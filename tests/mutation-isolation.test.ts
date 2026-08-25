import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c, JsonDriver, Kfg, KfgValidationError } from "../src";

const schema = {
	server: {
		port: c.Number({ default: 3000, minimum: 1 }),
		host: c.String({ default: "0.0.0.0" }),
	},
	tags: c.Array(c.String(), { default: [] }),
	name: c.String({ default: "app", description: "Human readable name" }),
};

let root: string;
let kfg: Kfg<JsonDriver, typeof schema>;

beforeEach(() => {
	root = join(tmpdir(), `kfg-iso-${Date.now()}-${Math.random()}`);
	mkdirSync(root, { recursive: true });
	kfg = new Kfg(new JsonDriver({ path: join(root, "config.json") }), schema);
	kfg.load();
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("failed mutations leave no trace", () => {
	test("a rejected set does not change the cache", () => {
		kfg.set("server.port", 8080);

		expect(() => kfg.set("server.port", -1 as any)).toThrow(KfgValidationError);
		expect(kfg.get("server.port")).toBe(8080);
		expect(kfg.get("server.host")).toBe("0.0.0.0");
	});

	test("a rejected insert does not partially apply", () => {
		expect(() =>
			kfg.insert("server", { host: "127.0.0.1", port: -5 } as any),
		).toThrow(KfgValidationError);

		expect(kfg.get("server.host")).toBe("0.0.0.0");
		expect(kfg.get("server.port")).toBe(3000);
	});

	test("a rejected inject does not partially apply", () => {
		expect(() =>
			kfg.inject({ name: "renamed", server: { port: -2 } } as any),
		).toThrow(KfgValidationError);

		expect(kfg.get("name")).toBe("app");
		expect(kfg.get("server.port")).toBe(3000);
	});
});

describe("snapshots are not mutated by later writes", () => {
	test("toJSON() result stays as it was read", () => {
		const before = kfg.toJSON();
		expect(before.server.port).toBe(3000);

		kfg.set("server.port", 9999);

		expect(before.server.port).toBe(3000);
		expect(kfg.get("server.port")).toBe(9999);
	});

	test("untouched branches keep working after a write", () => {
		kfg.set("tags", ["a", "b"]);
		kfg.set("server.port", 4000);

		expect(kfg.get("tags")).toEqual(["a", "b"]);
		expect(kfg.get("server.host")).toBe("0.0.0.0");
		expect(kfg.toJSON()).toEqual({
			server: { port: 4000, host: "0.0.0.0" },
			tags: ["a", "b"],
			name: "app",
		});
	});

	test("delete and insert stay isolated too", () => {
		const before = kfg.toJSON();
		kfg.insert("server", { host: "127.0.0.1" });
		expect(before.server.host).toBe("0.0.0.0");
		expect(kfg.get("server.host")).toBe("127.0.0.1");

		kfg.del("tags");
		expect(before.tags).toEqual([]);
	});
});

describe("schema node lookups", () => {
	test("descriptions are still resolved from the schema on set", () => {
		kfg.set("name", "other");
		// repeated writes take the memoized path
		kfg.set("name", "third");
		expect((kfg.driver as any).comments.name).toBe("Human readable name");
	});

	test("an explicit description still wins", () => {
		kfg.set("name", "x", "explicit one");
		expect((kfg.driver as any).comments.name).toBe("explicit one");
	});
});
