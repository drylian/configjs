import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { c, EnvDriver, JsonDriver, Kfg } from "../src";
import { safeWriteFileSync } from "../src/utils/safe-write";

const tmpDir = path.resolve(process.cwd(), "tests", ".tmp-safeguard");
fs.mkdirSync(tmpDir, { recursive: true });
const tmpFile = (name: string) => path.join(tmpDir, name);

afterAll(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("safeguard: backup", () => {
	test("save mirrors the new state into <file>.bak by default", () => {
		const filePath = tmpFile("backup-default.json");
		const driver = new JsonDriver({ path: filePath });
		const config = new Kfg(driver, { name: c.string({ default: "a" }) });
		config.load();
		config.set("name", "bob");

		expect(fs.existsSync(`${filePath}.bak`)).toBe(true);
		expect(fs.readFileSync(`${filePath}.bak`, "utf-8")).toBe(
			fs.readFileSync(filePath, "utf-8"),
		);
	});

	test("allow_backup accepts a custom backup path", () => {
		const filePath = tmpFile("backup-custom.json");
		const backupPath = tmpFile("backups/custom.json.bak");
		const driver = new JsonDriver({ path: filePath, allow_backup: backupPath });
		const config = new Kfg(driver, { name: c.string({ default: "a" }) });
		config.load();
		config.set("name", "bob");

		expect(fs.existsSync(backupPath)).toBe(true);
		expect(fs.existsSync(`${filePath}.bak`)).toBe(false);
	});

	test("allow_backup: false disables the backup", () => {
		const filePath = tmpFile("backup-off.json");
		const driver = new JsonDriver({ path: filePath, allow_backup: false });
		const config = new Kfg(driver, { name: c.string({ default: "a" }) });
		config.load();
		config.set("name", "bob");

		expect(fs.existsSync(`${filePath}.bak`)).toBe(false);
	});

	test("corrupted main JSON is restored from the backup on load", () => {
		const filePath = tmpFile("backup-recover.json");
		const driver = new JsonDriver({ path: filePath });
		const config = new Kfg(driver, { name: c.string({ default: "a" }) });
		config.load();
		config.set("name", "important-value");

		// Simulate corruption (e.g. partial write under memory/disk pressure)
		fs.writeFileSync(filePath, '{"name": "impo');

		const config2 = new Kfg(new JsonDriver({ path: filePath }), {
			name: c.string({ default: "a" }),
		});
		config2.load();
		expect(config2.get("name")).toBe("important-value");
		// Main file rewritten from backup
		expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).name).toBe(
			"important-value",
		);
	});

	test("EnvDriver also keeps a backup", () => {
		const filePath = tmpFile("backup.env");
		fs.writeFileSync(filePath, "NAME=a\n");
		const driver = new EnvDriver({ path: filePath, forceExit: false });
		const config = new Kfg(driver, { name: c.string() });
		config.load();
		config.set("name", "bob");

		expect(fs.existsSync(`${filePath}.bak`)).toBe(true);
		expect(fs.readFileSync(`${filePath}.bak`, "utf-8")).toContain("NAME=bob");
	});
});

describe("safeguard: concurrent writes", () => {
	test("a held lock times out with a clear error after lockTimeout", () => {
		const filePath = tmpFile("locked.json");
		fs.writeFileSync(filePath, '{"name":"orig"}');
		// A live owner (this process) — must NOT be stolen, so the wait times out.
		fs.writeFileSync(`${filePath}.lock`, String(process.pid));

		try {
			const start = Date.now();
			expect(() =>
				safeWriteFileSync(filePath, '{"name":"new"}', { lockTimeout: 100 }),
			).toThrow(/Concurrent write detected/);
			expect(Date.now() - start).toBeGreaterThanOrEqual(100);
			// Original untouched
			expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).name).toBe("orig");
		} finally {
			fs.rmSync(`${filePath}.lock`, { force: true });
		}
	});

	test("a writer waits in line and proceeds once the lock is released", async () => {
		const filePath = tmpFile("queued.json");
		fs.writeFileSync(filePath, '{"name":"orig"}');
		const lockPath = `${filePath}.lock`;
		// Live owner so the lock is not stolen as dead; released by the helper below.
		fs.writeFileSync(lockPath, String(process.pid));

		// Separate process releases the lock after ~150ms while this thread
		// blocks inside safeWriteFileSync waiting for it.
		const releaser = Bun.spawn([
			"bun",
			"-e",
			`setTimeout(() => require("node:fs").rmSync(${JSON.stringify(lockPath)}, { force: true }), 150)`,
		]);

		try {
			safeWriteFileSync(filePath, '{"name":"queued"}', {
				backup: false,
				lockTimeout: 5000,
			});
			expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).name).toBe(
				"queued",
			);
		} finally {
			await releaser.exited;
		}
	});

	test("a fresh lock from a crashed process is stolen immediately on restart", () => {
		const filePath = tmpFile("crash-restart.json");
		fs.writeFileSync(filePath, '{"name":"orig"}');
		const lockPath = `${filePath}.lock`;
		// Dead PID, fresh mtime (crash happened <10s ago, before staleness kicks in).
		fs.writeFileSync(lockPath, "999999");

		const start = Date.now();
		// Must NOT wait for lockTimeout nor the 10s staleness window — the owner
		// is provably dead, so steal at once.
		safeWriteFileSync(filePath, '{"name":"recovered"}', {
			backup: false,
			lockTimeout: 5000,
		});
		expect(Date.now() - start).toBeLessThan(1000);
		expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).name).toBe(
			"recovered",
		);
		expect(fs.existsSync(lockPath)).toBe(false);
	});

	test("a non-numeric/partial lock falls back to time-based staleness", () => {
		const filePath = tmpFile("garbage-lock.json");
		fs.writeFileSync(filePath, '{"name":"orig"}');
		const lockPath = `${filePath}.lock`;
		fs.writeFileSync(lockPath, ""); // partial write: created but PID not yet written
		const past = new Date(Date.now() - 60_000);
		fs.utimesSync(lockPath, past, past);

		safeWriteFileSync(filePath, '{"name":"new"}', { backup: false });
		expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).name).toBe("new");
	});

	test("a stale lock (crashed writer) is stolen and the write proceeds", () => {
		const filePath = tmpFile("stale-lock.json");
		fs.writeFileSync(filePath, '{"name":"orig"}');
		const lockPath = `${filePath}.lock`;
		fs.writeFileSync(lockPath, "9999");
		const past = new Date(Date.now() - 60_000);
		fs.utimesSync(lockPath, past, past);

		safeWriteFileSync(filePath, '{"name":"new"}', { backup: false });
		expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).name).toBe("new");
		expect(fs.existsSync(lockPath)).toBe(false);
	});
});

describe("safeguard: atomic writes", () => {
	test("a failed write never corrupts the original file", () => {
		const filePath = tmpFile("atomic.json");
		fs.writeFileSync(filePath, '{"name":"orig"}');
		// Occupy the temp slot with a directory so the temp write fails,
		// simulating an I/O failure mid-write.
		fs.mkdirSync(`${filePath}.tmp`, { recursive: true });

		try {
			expect(() =>
				safeWriteFileSync(filePath, '{"name":"new"}', { backup: false }),
			).toThrow();
			expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).name).toBe("orig");
		} finally {
			fs.rmSync(`${filePath}.tmp`, { recursive: true, force: true });
		}
	});

	test("verify() rejecting the content blocks the commit", () => {
		const filePath = tmpFile("verify.json");
		fs.writeFileSync(filePath, '{"name":"orig"}');

		expect(() =>
			safeWriteFileSync(filePath, "not json at all", {
				backup: false,
				verify: (content) => {
					try {
						JSON.parse(content);
						return true;
					} catch {
						return false;
					}
				},
			}),
		).toThrow(/Write verification failed/);
		expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).name).toBe("orig");
	});

	test("no temp or lock files are left behind after a successful write", () => {
		const filePath = tmpFile("clean.json");
		safeWriteFileSync(filePath, '{"ok":true}', { backup: false });
		expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
		expect(fs.existsSync(`${filePath}.lock`)).toBe(false);
	});
});

describe("backup directory creation", () => {
	test("creates a missing backup directory on first write", () => {
		const dir = path.join(tmpDir, `bakdir-${Date.now()}`);
		const file = path.join(dir, "config.json");
		const bak = path.join(dir, "nested", "deep", "config.bak.json");
		fs.mkdirSync(dir, { recursive: true });

		try {
			safeWriteFileSync(file, '{"a":1}', { backup: bak });
			expect(fs.existsSync(bak)).toBe(true);

			// Second write hits the fast path with the directory already there.
			safeWriteFileSync(file, '{"a":2}', { backup: bak });
			expect(fs.readFileSync(bak, "utf-8")).toBe('{"a":2}');
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
