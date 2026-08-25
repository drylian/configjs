import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c, JsonAsyncDriver, Kfg, KfgValidationError } from "../src";
import { safeWriteFile, withFileLockAsync } from "../src/utils/safe-write-async";

const schema = {
	server: {
		port: c.Number({ default: 3000, minimum: 1 }),
		host: c.String({ default: "0.0.0.0" }),
	},
	tags: c.Array(c.String(), { default: [] }),
	name: c.String({ default: "app" }),
};

let root: string;
let file: string;

const make = (config: Record<string, any> = {}) =>
	new Kfg(new JsonAsyncDriver({ path: file, ...config }), schema);

beforeEach(() => {
	root = join(tmpdir(), `kfg-async-${Date.now()}-${Math.random()}`);
	mkdirSync(root, { recursive: true });
	file = join(root, "nested", "config.json");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("async lifecycle", () => {
	test("load/set/get round-trip", async () => {
		const kfg = make();
		await kfg.load();

		expect(kfg.get("server.port")).toBe(3000);
		await kfg.set("server.port", 8080);
		expect(kfg.get("server.port")).toBe(8080);

		expect(JSON.parse(readFileSync(file, "utf-8")).server.port).toBe(8080);
	});

	test("every mutating method returns a promise", async () => {
		const kfg = make();
		await kfg.load();

		expect(kfg.set("name", "x")).toBeInstanceOf(Promise);
		expect(kfg.insert("server", { host: "127.0.0.1" })).toBeInstanceOf(Promise);
		expect(kfg.inject({ tags: ["a"] })).toBeInstanceOf(Promise);
		expect(kfg.del("tags")).toBeInstanceOf(Promise);
		expect(kfg.save()).toBeInstanceOf(Promise);
		expect(kfg.mutate((d) => d)).toBeInstanceOf(Promise);
		expect(kfg.toJSON()).toBeInstanceOf(Promise);

		// let the queued writes settle before the directory is removed
		await kfg.save();
	});

	test("insert, inject, del and reload persist", async () => {
		const kfg = make();
		await kfg.load();

		await kfg.insert("server", { host: "127.0.0.1" });
		await kfg.inject({ tags: ["a", "b"], name: "svc" });
		await kfg.set("server.port", 4000);
		await kfg.del("tags");

		const reloaded = make();
		await reloaded.load();
		expect(reloaded.get("server.host")).toBe("127.0.0.1");
		expect(reloaded.get("server.port")).toBe(4000);
		expect(reloaded.get("name")).toBe("svc");
		expect(reloaded.get("tags")).toEqual([]);
	});

	test("a rejected write leaves cache and file untouched", async () => {
		const kfg = make();
		await kfg.load();
		await kfg.set("server.port", 8080);

		await expect(kfg.set("server.port", -1 as any)).rejects.toBeInstanceOf(
			KfgValidationError,
		);
		expect(kfg.get("server.port")).toBe(8080);
		expect(JSON.parse(readFileSync(file, "utf-8")).server.port).toBe(8080);
	});

	test("load rejects instead of exiting when the file is invalid", async () => {
		mkdirSync(join(root, "nested"), { recursive: true });
		writeFileSync(file, '{"server":{"port":"nope"}}');

		await expect(make().load()).rejects.toBeInstanceOf(KfgValidationError);
	});

	test("lazy is rejected for an async driver", () => {
		expect(
			() => new Kfg(new JsonAsyncDriver({ path: file }), schema, { lazy: true }),
		).toThrow(/synchronous driver/);
	});
});

describe("async transactions", () => {
	test("mutate applies on the freshest persisted state", async () => {
		const kfg = make();
		await kfg.load();
		await kfg.set("name", "first");

		// another writer changes the file behind this instance's back
		const other = make();
		await other.load();
		await other.set("server.port", 7777);

		await kfg.mutate((draft) => {
			draft.name = "second";
		});

		const onDisk = JSON.parse(readFileSync(file, "utf-8"));
		expect(onDisk.name).toBe("second");
		expect(onDisk.server.port).toBe(7777); // the other writer's key survived
	});

	test("concurrent mutations queue instead of losing updates", async () => {
		const kfg = make();
		await kfg.load();
		await kfg.set("tags", []);

		await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				make().mutate((draft) => {
					draft.tags = [...(draft.tags ?? []), `t${i}`];
				}),
			),
		);

		const onDisk = JSON.parse(readFileSync(file, "utf-8"));
		expect(onDisk.tags).toHaveLength(5);
		expect([...onDisk.tags].sort()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
	});

	test("mutate_set routes set through the transactional path", async () => {
		const kfg = make({ mutate_set: true });
		await kfg.load();

		const other = make();
		await other.load();
		await other.set("server.port", 5555);

		await kfg.set("name", "kept");

		const onDisk = JSON.parse(readFileSync(file, "utf-8"));
		expect(onDisk.name).toBe("kept");
		expect(onDisk.server.port).toBe(5555);
	});
});

describe("async safeguards", () => {
	test("recovers from a corrupted file using the backup", async () => {
		const kfg = make();
		await kfg.load();
		await kfg.set("name", "valuable");

		writeFileSync(file, "{ not json");

		const recovered = make();
		await recovered.load();
		expect(recovered.get("name")).toBe("valuable");
	});

	test("waiting for a lock yields instead of blocking", async () => {
		mkdirSync(join(root, "nested"), { recursive: true });
		const target = join(root, "nested", "locked.json");

		let ticks = 0;
		const ticker = setInterval(() => ticks++, 5);

		// start a writer, then hold the lock for a while so it has to wait
		let waiting!: Promise<void>;
		await withFileLockAsync(target, async () => {
			waiting = safeWriteFile(target, '{"a":2}', { lockTimeout: 2000 });
			await new Promise((r) => setTimeout(r, 120));
		});
		await waiting;

		clearInterval(ticker);
		// the event loop kept running while the writer waited
		expect(ticks).toBeGreaterThan(5);
		expect(JSON.parse(readFileSync(target, "utf-8")).a).toBe(2);
	});

	test("times out with a clear error when the lock is held too long", async () => {
		mkdirSync(join(root, "nested"), { recursive: true });
		const target = join(root, "nested", "busy.json");
		writeFileSync(`${target}.lock`, String(process.pid));

		await expect(
			safeWriteFile(target, '{"a":1}', { lockTimeout: 50 }),
		).rejects.toThrow(/Concurrent write detected/);
	});

	test("creates missing directories and the backup mirror", async () => {
		const deep = join(root, "a", "b", "c.json");
		await safeWriteFile(deep, '{"x":1}');

		expect(readFileSync(deep, "utf-8")).toBe('{"x":1}');
		expect(existsSync(`${deep}.bak`)).toBe(true);
		expect(existsSync(`${deep}.lock`)).toBe(false);
	});
});
