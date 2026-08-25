import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Safeguarded file persistence:
 * - Lock file prevents two writers from touching the same file at once.
 * - Content is written to a temp file, read back and verified BEFORE
 *   replacing the target, so disk-full / memory pressure can never
 *   corrupt the existing file (you get a clear error instead).
 * - Optional backup mirror (`allow_backup`) kept in sync after every
 *   successful write, used to recover a corrupted main file on load.
 */

export interface SafeWriteOptions {
	/** true (default) → "<file>.bak"; string → custom backup path; false → disabled. */
	backup?: boolean | string;
	/** Extra content validation (e.g. JSON.parse) run on the temp file before commit. */
	verify?: (content: string) => boolean;
	/**
	 * How long (ms) to wait for a concurrent writer to release the lock before
	 * failing. Effectively queues writers across processes. Default 1000; 0 fails
	 * immediately. Note: the wait blocks the thread (sync API).
	 */
	lockTimeout?: number;
}

const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_MS = 25;
const DEFAULT_LOCK_TIMEOUT_MS = 1_000;

/**
 * Whether the process that owns a lock is still running. Reads the PID the
 * lock holder wrote and probes it with signal 0 (existence check, no signal
 * actually sent). Returns `undefined` when liveness can't be determined
 * (empty/partial lock, non-numeric content) so callers fall back to the
 * time-based staleness check.
 */
function isLockOwnerAlive(lockPath: string): boolean | undefined {
	let raw: string;
	try {
		raw = fs.readFileSync(lockPath, "utf-8").trim();
	} catch {
		return undefined;
	}
	const pid = Number(raw);
	if (!raw || !Number.isInteger(pid) || pid <= 0) return undefined;
	if (pid === process.pid) return true;
	try {
		// Signal 0 performs error checking without sending a signal.
		process.kill(pid, 0);
		return true; // process exists
	} catch (e: any) {
		// ESRCH → no such process (dead). EPERM → exists but not ours (alive).
		if (e?.code === "ESRCH") return false;
		if (e?.code === "EPERM") return true;
		return undefined;
	}
}

function sleepSync(ms: number): void {
	try {
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
	} catch {
		// Atomics.wait unavailable in this context — busy-wait fallback
		const end = Date.now() + ms;
		while (Date.now() < end) {
			/* spin */
		}
	}
}

export function backupPathFor(
	filePath: string,
	backup: boolean | string | undefined,
): string | undefined {
	if (backup === false) return undefined;
	return typeof backup === "string"
		? path.resolve(process.cwd(), backup)
		: `${filePath}.bak`;
}

function acquireLock(filePath: string, timeoutMs: number): string {
	const lockPath = `${filePath}.lock`;
	const deadline = Date.now() + Math.max(0, timeoutMs);

	for (;;) {
		try {
			fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
			return lockPath;
		} catch (e: any) {
			if (e?.code !== "EEXIST") throw e;

			// If the lock owner crashed, steal immediately instead of waiting
			// out the staleness window — this is the common "process restarted
			// after a crash" case.
			if (isLockOwnerAlive(lockPath) === false) {
				fs.rmSync(lockPath, { force: true });
				continue;
			}

			// Owner alive or unknown — steal only stale locks (time-based backstop,
			// covers cross-machine locks where PID liveness is meaningless).
			try {
				const age = Date.now() - fs.statSync(lockPath).mtimeMs;
				if (age > LOCK_STALE_MS) {
					fs.rmSync(lockPath, { force: true });
					continue;
				}
			} catch {
				// lock vanished between stat calls — retry immediately
				continue;
			}

			if (Date.now() >= deadline) {
				throw new Error(
					`[Kfg] Concurrent write detected on "${filePath}": another save is in progress ` +
						`(waited ${timeoutMs}ms). Increase "lock_timeout", retry, or delete "${lockPath}" if it is stale.`,
				);
			}
			sleepSync(LOCK_RETRY_MS);
		}
	}
}

/**
 * Runs `fn` while holding the exclusive write lock for `filePath`, releasing
 * it afterwards even on error. Use this to make a whole read-modify-write
 * sequence atomic across processes (preventing lost updates), not just the
 * final write.
 */
export function withFileLock<T>(
	filePath: string,
	fn: () => T,
	options: { lockTimeout?: number } = {},
): T {
	const lockPath = acquireLock(
		filePath,
		options.lockTimeout ?? DEFAULT_LOCK_TIMEOUT_MS,
	);
	try {
		return fn();
	} finally {
		fs.rmSync(lockPath, { force: true });
	}
}

/**
 * Atomic write WITHOUT acquiring the lock. Caller must already hold it
 * (e.g. inside withFileLock). The original file is never touched unless the
 * new content was fully written and verified.
 */
function atomicWriteUnlocked(
	filePath: string,
	content: string,
	options: SafeWriteOptions,
): void {
	const tmpPath = `${filePath}.tmp`;
	try {
		fs.writeFileSync(tmpPath, content, "utf-8");
		const written = fs.readFileSync(tmpPath, "utf-8");
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
		fs.rmSync(tmpPath, { force: true });
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

	// Verified — atomically replace the target (same directory, same fs).
	fs.renameSync(tmpPath, filePath);

	// Mirror the new valid state into the backup.
	const bak = backupPathFor(filePath, options.backup ?? true);
	if (bak) {
		try {
			// Try the copy first: creating the directory on every write costs a
			// syscall per save and is almost always a no-op.
			try {
				fs.copyFileSync(filePath, bak);
			} catch (e: any) {
				if (e?.code !== "ENOENT") throw e;
				fs.mkdirSync(path.dirname(bak), { recursive: true });
				fs.copyFileSync(filePath, bak);
			}
		} catch (e) {
			console.warn(`[Kfg] Could not update backup "${bak}":`, e);
		}
	}
}

/**
 * Atomically writes `content` to `filePath` under the write lock. The original
 * file is never touched unless the new content was fully written and verified.
 */
export function safeWriteFileSync(
	filePath: string,
	content: string,
	options: SafeWriteOptions = {},
): void {
	withFileLock(
		filePath,
		() => atomicWriteUnlocked(filePath, content, options),
		options,
	);
}

/**
 * Transactional read-modify-write under a single lock acquisition, preventing
 * lost updates when multiple processes mutate the same file. `read` returns the
 * current content (or undefined), `mutate` produces the new content from it,
 * and the result is written atomically — all while the lock is held.
 */
export function safeMutateFileSync(
	filePath: string,
	read: () => string | undefined,
	mutate: (current: string | undefined) => string,
	options: SafeWriteOptions = {},
): void {
	withFileLock(
		filePath,
		() => {
			const current = read();
			const next = mutate(current);
			atomicWriteUnlocked(filePath, next, options);
		},
		options,
	);
}

/**
 * Reads `filePath`, validating with `validate`. If the main file is missing
 * or corrupted and a valid backup exists, restores the main file from the
 * backup (with a warning) and returns the backup content.
 * Returns undefined when neither source is usable.
 */
export function safeReadFileSync(
	filePath: string,
	options: {
		backup?: boolean | string;
		validate?: (content: string) => boolean;
	} = {},
): string | undefined {
	const validate = options.validate ?? (() => true);

	if (fs.existsSync(filePath)) {
		const content = fs.readFileSync(filePath, "utf-8");
		if (validate(content)) return content;
		console.warn(`[Kfg] "${filePath}" is corrupted, trying backup...`);
	}

	const bak = backupPathFor(filePath, options.backup ?? true);
	if (bak && fs.existsSync(bak)) {
		const backupContent = fs.readFileSync(bak, "utf-8");
		if (validate(backupContent)) {
			console.warn(`[Kfg] Restored "${filePath}" from backup "${bak}".`);
			try {
				fs.writeFileSync(filePath, backupContent, "utf-8");
			} catch (e) {
				console.warn(`[Kfg] Could not rewrite "${filePath}" from backup:`, e);
			}
			return backupContent;
		}
	}
	return undefined;
}
