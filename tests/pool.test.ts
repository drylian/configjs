import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c, JsonDriver, Kfg, KfgScopeError } from "../src";

const schema = {
	tks: {
		category: c.String({ default: "none" }),
		enabled: c.Boolean({ default: false }),
	},
	limit: c.Number({ default: 10 }),
};

let root: string;

const makePool = (options: Record<string, any> = {}) =>
	Kfg.pool(schema, {
		driver: (id: string) =>
			new JsonDriver({ path: join(root, id, "config.json") }),
		...options,
	});

beforeEach(() => {
	root = join(tmpdir(), `kfg-pool-${Date.now()}-${Math.random()}`);
	mkdirSync(root, { recursive: true });
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("KfgPool.for()", () => {
	test("creates and loads an isolated instance per scope", () => {
		const pool = makePool();

		pool.for("111").set("tks.category", "alpha");
		pool.for("222").set("tks.category", "beta");

		expect(pool.for("111").get("tks.category")).toBe("alpha");
		expect(pool.for("222").get("tks.category")).toBe("beta");
		expect(existsSync(join(root, "111", "config.json"))).toBe(true);
		expect(existsSync(join(root, "222", "config.json"))).toBe(true);
	});

	test("returns the same instance for the same id", () => {
		const pool = makePool();
		expect(pool.for("111")).toBe(pool.for("111"));
		expect(pool.ids()).toEqual(["111"]);
	});

	test("dispose drops the instance but keeps the persisted state", () => {
		const pool = makePool();
		pool.for("111").set("limit", 42);

		expect(pool.dispose("111")).toBe(true);
		expect(pool.ids()).toEqual([]);
		expect(pool.for("111").get("limit")).toBe(42);
	});
});

describe("scope resolution", () => {
	test("throws KfgScopeError when there is no scope", () => {
		const pool = makePool();
		expect(() => pool.get("tks.category")).toThrow(KfgScopeError);
		expect(() => pool.get("tks.category")).toThrow(/No active scope/);
	});

	test("resolve() drives the ambient scope", () => {
		let scope: string | null = null;
		const pool = makePool({ resolve: () => scope });

		scope = "111";
		pool.set("tks.category", "alpha");
		scope = "222";
		pool.set("tks.category", "beta");

		expect(pool.current()).toBe("222");
		expect(pool.get("tks.category")).toBe("beta");
		scope = "111";
		expect(pool.get("tks.category")).toBe("alpha");
	});

	test("defaultScope catches scope-less calls and reports them", () => {
		const missing: string[] = [];
		const pool = makePool({
			defaultScope: "global",
			onMissingScope: (operation: string) => missing.push(operation),
		});

		expect(pool.get("limit")).toBe(10);
		pool.set("limit", 5);

		expect(pool.missingScopeCount).toBe(2);
		expect(missing).toEqual(['reading "limit"', 'writing "limit"']);
		expect(pool.ids()).toEqual(["global"]);
	});

	test("an active scope wins over defaultScope", () => {
		const pool = makePool({ defaultScope: "global", resolve: () => "111" });
		pool.set("limit", 7);

		expect(pool.missingScopeCount).toBe(0);
		expect(pool.for("111").get("limit")).toBe(7);
	});
});

describe("API parity", () => {
	test("the pool exposes the same surface as a single instance", () => {
		const pool = makePool({ resolve: () => "111" });

		pool.set("tks.category", "alpha");
		expect(pool.get("tks.category")).toBe("alpha");
		expect(pool.has("tks.category", "limit")).toBe(true);
		expect(pool.root("tks")).toEqual({ category: "alpha", enabled: false });
		expect(pool.conf("limit").default).toBe(10);
		expect(pool.toJSON()).toEqual({
			tks: { category: "alpha", enabled: false },
			limit: 10,
		});

		pool.insert("tks", { enabled: true });
		expect(pool.get("tks.enabled")).toBe(true);

		pool.del("tks.category");
		expect(pool.get("tks.category")).toBe("none");

		expect(pool.schema).toBe(schema);
		expect(pool.driver).toBeInstanceOf(JsonDriver);
	});

	test("config proxy resolves the scope on every access", () => {
		let scope = "111";
		const pool = makePool({ resolve: () => scope });
		const config = pool.config;

		pool.for("111").set("limit", 1);
		pool.for("222").set("limit", 2);

		expect(config.limit).toBe(1);
		scope = "222";
		expect(config.limit).toBe(2);
		expect(() => {
			(config as any).limit = 3;
		}).toThrow(/read-only/);
	});
});
