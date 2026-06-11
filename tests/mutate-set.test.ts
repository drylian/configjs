import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { c, EnvDriver, JsonDriver, Kfg } from "../src";

const tmpDir = path.resolve(process.cwd(), "tests", ".tmp-mutateset");
fs.mkdirSync(tmpDir, { recursive: true });
const tmpFile = (n: string) => path.join(tmpDir, n);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("mutate_set flag", () => {
	test("default (off): set uses the in-memory cache path", () => {
		const filePath = tmpFile("off.json");
		const config = new Kfg(new JsonDriver({ path: filePath }), {
			count: c.number({ default: 0 }),
		});
		config.load();
		config.set("count", 7);
		expect(config.get("count")).toBe(7);
		expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).count).toBe(7);
	});

	test("on: set preserves a concurrent change to a different key", () => {
		const filePath = tmpFile("on.json");
		const schema = { a: c.number({ default: 0 }), b: c.number({ default: 0 }) };
		const w1 = new Kfg(new JsonDriver({ path: filePath, mutate_set: true }), schema);
		const w2 = new Kfg(new JsonDriver({ path: filePath, mutate_set: true }), schema);
		w1.load();
		w2.load();

		// w2 changes key "b" behind w1's back
		w2.set("b", 100);
		// w1 (stale cache: b=0) writes key "a"; transactional set must NOT
		// clobber w2's "b" back to 0
		w1.set("a", 7);

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		expect(onDisk.a).toBe(7);
		expect(onDisk.b).toBe(100); // preserved
	});

	test("off (default): the stale-cache write DOES clobber the other key", () => {
		const filePath = tmpFile("on-clobber.json");
		const schema = { a: c.number({ default: 0 }), b: c.number({ default: 0 }) };
		const w1 = new Kfg(new JsonDriver({ path: filePath }), schema);
		const w2 = new Kfg(new JsonDriver({ path: filePath }), schema);
		w1.load();
		w2.load();
		w2.set("b", 100);
		w1.set("a", 7); // w1's stale cache (b=0) overwrites the whole file

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		expect(onDisk.a).toBe(7);
		expect(onDisk.b).toBe(0); // lost — documents why mutate_set exists
	});

	test("on: del/insert/inject also go transactional", () => {
		const filePath = tmpFile("ops.json");
		const config = new Kfg(new JsonDriver({ path: filePath, mutate_set: true }), {
			a: c.number({ default: 1 }),
			b: c.optional(c.number()),
			obj: c.object({ x: c.number({ default: 0 }) }),
		});
		config.load();
		config.set("b", 5);
		config.insert("obj", { x: 9 });
		expect(config.get("b")).toBe(5);
		expect(config.get("obj")).toEqual({ x: 9 });
		config.del("b");
		expect(config.get("b")).toBeUndefined();
	});

	test("on: validation failure rolls back, disk untouched", () => {
		const filePath = tmpFile("rollback.json");
		const config = new Kfg(
			new JsonDriver({ path: filePath, mutate_set: true }),
			{ port: c.number({ minimum: 1, default: 8080 }) },
		);
		config.load();
		config.set("port", 3000);
		expect(() => config.set("port", -1)).toThrow();
		expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).port).toBe(3000);
	});

	test("EnvDriver supports mutate_set and preserves concurrent keys", () => {
		const filePath = tmpFile("env.env");
		fs.writeFileSync(filePath, "A=0\nB=0\n");
		const schema = { a: c.number(), b: c.number() };
		const w1 = new Kfg(new EnvDriver({ path: filePath, forceExit: false, mutate_set: true }), schema);
		const w2 = new Kfg(new EnvDriver({ path: filePath, forceExit: false, mutate_set: true }), schema);
		w1.load();
		w2.load();
		w2.set("b", 50);
		w1.set("a", 7);

		const reader = new Kfg(new EnvDriver({ path: filePath, forceExit: false }), schema);
		reader.load();
		expect(reader.get("a")).toBe(7);
		expect(reader.get("b")).toBe(50); // preserved
	});
});
