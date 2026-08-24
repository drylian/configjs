import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c, JsonDriver, Kfg, KfgScopeError, KfgValidationError } from "../src";

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

describe("lazy loading", () => {
	test("a lazy instance loads on first access", () => {
		const instance = new Kfg(
			new JsonDriver({ path: join(root, "lazy", "config.json") }),
			schema,
			{ lazy: true },
		);

		expect(instance["~loaded"]).toBe(false);
		expect(instance.get("limit")).toBe(10);
		expect(instance["~loaded"]).toBe(true);
	});

	test("a non-lazy instance still requires load()", () => {
		const instance = new Kfg(
			new JsonDriver({ path: join(root, "eager", "config.json") }),
			schema,
		);
		expect(() => instance.get("limit")).toThrow(/not loaded/i);
	});

	test("lazy is rejected for async drivers", () => {
		const asyncDriver = new JsonDriver({
			path: join(root, "async", "config.json"),
		});
		(asyncDriver as any).async = true;

		expect(
			() => new Kfg(asyncDriver as any, schema, { lazy: true }),
		).toThrow(/synchronous driver/);
	});

	test("pool instances are lazy: no file is written before first access", () => {
		const pool = makePool();
		const instance = pool.for("111");

		expect(existsSync(join(root, "111", "config.json"))).toBe(false);
		expect(instance.get("limit")).toBe(10);
	});
});

describe("KfgValidationError", () => {
	const strict = { limit: c.Number({ minimum: 1, default: 1 }) };

	const writeRaw = (id: string, body: string) => {
		mkdirSync(join(root, id), { recursive: true });
		writeFileSync(join(root, id, "config.json"), body);
	};

	test("a broken scope throws instead of exiting the process", () => {
		writeRaw("bad", '{"limit":"not-a-number"}');
		const pool = Kfg.pool(strict, {
			driver: (id: string) =>
				new JsonDriver({
					path: join(root, id, "config.json"),
					forceExit: true,
				} as any),
		});

		let caught: KfgValidationError | undefined;
		try {
			pool.for("bad").get("limit");
		} catch (error) {
			caught = error as KfgValidationError;
		}

		expect(caught).toBeInstanceOf(KfgValidationError);
		expect(caught?.scope).toBe("bad");
		expect(caught?.kind).toBe("schema");
		expect(caught?.paths).toContain("limit");
		// The formatted message is unchanged, so string readers keep working.
		expect(caught?.message).toContain("[KFG] Invalid JSON configuration.");
	});

	test("other scopes keep working after one fails", () => {
		writeRaw("bad", '{"limit":"not-a-number"}');
		const pool = Kfg.pool(strict, {
			driver: (id: string) =>
				new JsonDriver({ path: join(root, id, "config.json") }),
		});

		expect(() => pool.for("bad").get("limit")).toThrow(KfgValidationError);
		pool.for("good").set("limit", 3);
		expect(pool.for("good").get("limit")).toBe(3);
	});
});

describe("ambient scope", () => {
	test("run() sets the scope for everything inside it", () => {
		const pool = makePool();

		pool.run("111", () => pool.set("limit", 1));
		pool.run("222", () => pool.set("limit", 2));

		expect(pool.run("111", () => pool.get("limit"))).toBe(1);
		expect(pool.run("222", () => pool.get("limit"))).toBe(2);
		expect(pool.current()).toBeNull();
	});

	test("the scope survives awaits", async () => {
		const pool = makePool();

		await pool.run("111", async () => {
			await Bun.sleep(1);
			pool.set("limit", 9);
			expect(pool.scope()).toBe("111");
		});

		expect(pool.for("111").get("limit")).toBe(9);
	});

	test("nested run() wins for its own body", () => {
		const pool = makePool();

		pool.run("111", () => {
			expect(pool.current()).toBe("111");
			pool.run("222", () => expect(pool.current()).toBe("222"));
			expect(pool.current()).toBe("111");
		});
	});

	test("run() outranks resolve(), which outranks defaultScope", () => {
		const pool = makePool({ resolve: () => "111", defaultScope: "global" });

		expect(pool.current()).toBe("111");
		expect(pool.run("222", () => pool.current())).toBe("222");
	});

	test("defaultScope still applies outside any scope", () => {
		const pool = makePool({ defaultScope: "global", onMissingScope: () => {} });
		expect(pool.get("limit")).toBe(10);
		expect(pool.missingScopeCount).toBe(1);
	});
});
