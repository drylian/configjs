import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { backupPathFor, type SafeWriteOptions } from "./safe-write";

/**
 * Asynchronous counterpart of `safe-write.ts`, with the same guarantees:
 * lock file, temp-write + read-back verification + atomic rename, and a
 * backup mirror written from the verified content.
 *
 * The difference that matters is what happens while waiting for a lock: the
 * sync API blocks the thread, this one yields, so a server can keep serving
 * requests while another writer finishes.
 */

const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_MS = 25;
const DEFAULT_LOCK_TIMEOUT_MS = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether the process that owns a lock is still running. See safe-write.ts. */
async function isLockOwnerAlive(
	lockPath: string,
): Promise<boolean | undefined> {
	let raw: string;
	try {
		raw = (await fsp.readFile(lockPath, "utf-8")).trim();
	} catch {
		return undefined;
	}

	const pid = Number(raw);
	if (!raw || !Number.isInteger(pid) || pid <= 0) return undefined;
	if (pid === process.pid) return true;

	try {
		process.kill(pid, 0);
		return true;
	} catch (e: any) {
		if (e?.code === "ESRCH") return false;
		// EPERM means the process exists but belongs to another user.
		return e?.code === "EPERM" ? true : undefined;
	}
}

async function acquireLock(
	filePath: string,
	timeoutMs: number,
): Promise<string> {
	const lockPath = `${filePath}.lock`;
	const deadline = Date.now() + Math.max(0, timeoutMs);

	for (;;) {
		try {
			await fsp.writeFile(lockPath, String(process.pid), { flag: "wx" });
			return lockPath;
		} catch (e: any) {
			// First write into a new directory: create it and retry.
			if (e?.code === "ENOENT") {
				await fsp.mkdir(path.dirname(lockPath), { recursive: true });
				continue;
			}
			if (e?.code !== "EEXIST") throw e;

			if ((await isLockOwnerAlive(lockPath)) === false) {
				await fsp.rm(lockPath, { force: true });
				continue;
			}

			try {
				const age = Date.now() - (await fsp.stat(lockPath)).mtimeMs;
				if (age > LOCK_STALE_MS) {
					await fsp.rm(lockPath, { force: true });
					continue;
				}
			} catch {
				continue;
			}

			if (Date.now() >= deadline) {
				throw new Error(
					`[Kfg] Concurrent write detected on "${filePath}": another save is in progress ` +
						`(waited ${timeoutMs}ms). Increase "lock_timeout", retry, or delete "${lockPath}" if it is stale.`,
				);
			}
			await sleep(LOCK_RETRY_MS);
		}
	}
}

/**
 * Runs `fn` while holding the exclusive write lock for `filePath`, releasing
 * it afterwards even on error. Unlike the sync version, waiting for the lock
 * yields to the event loop instead of blocking it.
 */
export async function withFileLockAsync<T>(
	filePath: string,
	fn: () => T | Promise<T>,
	options: { lockTimeout?: number } = {},
): Promise<T> {
	const lockPath = await acquireLock(
		filePath,
		options.lockTimeout ?? DEFAULT_LOCK_TIMEOUT_MS,
	);
	try {
		return await fn();
	} finally {
		await fsp.rm(lockPath, { force: true });
	}
}

/** Atomic write WITHOUT the lock. The caller must already hold it. */
async function atomicWriteUnlocked(
	filePath: string,
	content: string,
	options: SafeWriteOptions,
): Promise<void> {
	const tmpPath = `${filePath}.tmp`;
	try {
		await fsp.writeFile(tmpPath, content, "utf-8");
		const written = await fsp.readFile(tmpPath, "utf-8");
		if (written !== content) {
			throw Object.assign(new Error("content mismatch after write"), {
				code: "EVERIFY",
			});
		}
		if (options.verify && !options.verify(written)) {
			throw Object.assign(new Error("content failed verification"), {
				code: "EVERIFY",
			});
		}
	} catch (e: any) {
		await fsp.rm(tmpPath, { force: true });
		if (e?.code === "ENOSPC") {
			throw new Error(
				`[Kfg] Device out of space: could not save "${filePath}". ` +
					`The original file was left untouched.`,
			);
		}
		if (e?.code === "EVERIFY") {
			throw new Error(
				`[Kfg] Write verification failed for "${filePath}" (possible disk/memory pressure): ${e.message}. ` +
					`The original file was left untouched.`,
			);
		}
		throw e;
	}

	await fsp.rename(tmpPath, filePath);

	const bak = backupPathFor(filePath, options.backup ?? true);
	if (bak) {
		try {
			try {
				await fsp.writeFile(bak, content, "utf-8");
			} catch (e: any) {
				if (e?.code !== "ENOENT") throw e;
				await fsp.mkdir(path.dirname(bak), { recursive: true });
				await fsp.writeFile(bak, content, "utf-8");
			}
		} catch (e) {
			console.warn(`[Kfg] Could not update backup "${bak}":`, e);
		}
	}
}

/** Atomically writes `content` to `filePath` under the write lock. */
export async function safeWriteFile(
	filePath: string,
	content: string,
	options: SafeWriteOptions = {},
): Promise<void> {
	await withFileLockAsync(
		filePath,
		() => atomicWriteUnlocked(filePath, content, options),
		options,
	);
}

/**
 * Locked read-modify-write: the whole cycle runs under one lock, so
 * concurrent writers queue instead of losing each other's updates.
 */
export async function safeMutateFile(
	filePath: string,
	read: () => Promise<string | undefined> | string | undefined,
	mutate: (current: string | undefined) => Promise<string> | string,
	options: SafeWriteOptions = {},
): Promise<void> {
	await withFileLockAsync(
		filePath,
		async () => {
			const current = await read();
			const next = await mutate(current);
			await atomicWriteUnlocked(filePath, next, options);
		},
		options,
	);
}

/**
 * Reads `filePath`, validating with `validate`. If the main file is missing
 * or corrupted and a valid backup exists, restores the main file from the
 * backup (with a warning) and returns the backup content.
 */
export async function safeReadFile(
	filePath: string,
	options: {
		backup?: boolean | string;
		validate?: (content: string) => boolean;
	} = {},
): Promise<string | undefined> {
	const validate = options.validate ?? (() => true);

	const read = async (target: string): Promise<string | undefined> => {
		try {
			return await fsp.readFile(target, "utf-8");
		} catch {
			return undefined;
		}
	};

	const content = await read(filePath);
	if (content !== undefined) {
		if (validate(content)) return content;
		console.warn(`[Kfg] "${filePath}" is corrupted, trying backup...`);
	}

	const bak = backupPathFor(filePath, options.backup ?? true);
	if (bak) {
		const backupContent = await read(bak);
		if (backupContent !== undefined && validate(backupContent)) {
			console.warn(`[Kfg] Restored "${filePath}" from backup "${bak}".`);
			try {
				await fsp.writeFile(filePath, backupContent, "utf-8");
			} catch (e) {
				console.warn(`[Kfg] Could not rewrite "${filePath}" from backup:`, e);
			}
			return backupContent;
		}
	}
	return undefined;
}
