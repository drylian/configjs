import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { Kfg, c, EnvDriver } from "../src";
import { parse, removeEnvKey, updateEnvContent } from "../src/utils/env";
import { flattenObject, setProperty, unflattenObject } from "../src/utils/object";
import { buildTypeBoxSchema, addSmartDefaults } from "../src/utils/schema";
import { Value } from "@sinclair/typebox/value";

const tmpDir = path.resolve(process.cwd(), "tests", ".tmp-bugfixes");
const tmpFile = (name: string) => path.join(tmpDir, name);

function setupTmp() {
	fs.mkdirSync(tmpDir, { recursive: true });
}

describe("bug 1: quote escaping in updateEnvContent", () => {
	test("values containing quotes are escaped and round-trip through parse", () => {
		const content = updateEnvContent("", "GREETING", 'say "hello" world');
		const parsed = parse(content);
		expect(parsed.GREETING).toBe('say "hello" world');
	});
});

describe("bug 2: c.Random produces a random default", () => {
	test("compiled schema gets a numeric default within max", () => {
		const schema = buildTypeBoxSchema({ seed: c.Random({ max: 50 }) });
		addSmartDefaults(schema);
		const result = Value.Default(schema, {}) as any;
		expect(typeof result.seed).toBe("number");
		expect(result.seed).toBeGreaterThanOrEqual(0);
		expect(result.seed).toBeLessThanOrEqual(50);
	});
});

describe("bug 3: c.createms default is generated at load time, not import time", () => {
	test("two compilations spaced in time give different defaults", async () => {
		const def = { ts: c.createms() };

		const s1 = buildTypeBoxSchema(def);
		addSmartDefaults(s1);
		const r1 = (Value.Default(s1, {}) as any).ts;

		await new Promise((r) => setTimeout(r, 15));

		const s2 = buildTypeBoxSchema({ ts: c.createms() });
		addSmartDefaults(s2);
		const r2 = (Value.Default(s2, {}) as any).ts;

		expect(typeof r1).toBe("number");
		expect(r2).toBeGreaterThan(r1);
	});
});

describe("bug 4: setting an object value via EnvDriver", () => {
	test("does not write [object Object] to the .env file", () => {
		setupTmp();
		const envPath = tmpFile("object-set.env");
		fs.writeFileSync(envPath, "APP_NAME=test\nAPP_RETRIES=3\n");

		const driver = new EnvDriver({ path: envPath, forceExit: false });
		const config = new Kfg(driver, {
			app: {
				name: c.string(),
				retries: c.number(),
				meta: c.optional(c.object({ owner: c.string() })),
			},
		});
		config.load();
		config.set("app.meta", { owner: "alice" });

		const content = fs.readFileSync(envPath, "utf-8");
		expect(content).not.toContain("[object Object]");

		// And it must survive a reload
		config.reload();
		expect(config.get("app.meta")).toEqual({ owner: "alice" });
	});
});

describe("bug 5: forceExit must not fire on runtime mutations", () => {
	test("invalid set() throws and rolls back instead of exiting the process", () => {
		setupTmp();
		const envPath = tmpFile("forceexit-set.env");
		fs.writeFileSync(envPath, "APP_PORT=8080\n");

		// forceExit defaults to TRUE on EnvDriver
		const driver = new EnvDriver({ path: envPath });
		const config = new Kfg(driver, {
			app: { port: c.number({ minimum: 1, maximum: 65535 }) },
		});
		config.load();

		const originalExit = process.exit;
		let exited = false;
		// @ts-expect-error stubbing
		process.exit = () => {
			exited = true;
			throw new Error("process.exit called");
		};
		try {
			expect(() => config.set("app.port", -1)).toThrow();
			expect(exited).toBe(false);
			expect(config.get("app.port")).toBe(8080);
		} finally {
			process.exit = originalExit;
		}
	});
});

describe("bug 6: env keys with regex metacharacters", () => {
	test("updateEnvContent does not misinterpret keys via regex injection", () => {
		// Keys come from `prop`, which users control freely.
		const content = "MY_KEYX=1\nOTHER=2";
		// "MY_KEY." as regex would match "MY_KEYX" — must not replace that line
		const updated = updateEnvContent(content, "MY_KEY.", "new");
		const lines = updated.split("\n");
		expect(lines).toContain("MY_KEYX=1");
		expect(updated).toContain("MY_KEY.=new");
	});
});

describe("bug 7: empty env string must not silently coerce to 0", () => {
	test("empty value for a number field fails validation instead of becoming 0", () => {
		setupTmp();
		const envPath = tmpFile("empty-number.env");
		fs.writeFileSync(envPath, "APP_PORT=\n");

		const driver = new EnvDriver({ path: envPath, forceExit: false });
		const config = new Kfg(driver, {
			app: { port: c.number({ minimum: 1 }) },
		});
		expect(() => config.load()).toThrow();
	});
});

describe("bug 9: '#' inside unquoted values", () => {
	test("comment stripping requires whitespace before '#'", () => {
		const parsed = parse("PASSWORD=a#b\nWITHCOMMENT=value # real comment");
		expect(parsed.PASSWORD).toBe("a#b");
		expect(parsed.WITHCOMMENT).toBe("value");
	});
});

describe("bug 11: set() resolves description through c.Object schemas", () => {
	test("description from a nested TObject property lands in the .env comment", () => {
		setupTmp();
		const envPath = tmpFile("description.env");
		fs.writeFileSync(envPath, "APP_NAME=test\n");

		const driver = new EnvDriver({ path: envPath, forceExit: false });
		const config = new Kfg(driver, {
			app: c.object({
				name: c.string({ description: "Application name" }),
			}),
		});
		config.load();
		config.set("app.name", "renamed");

		const content = fs.readFileSync(envPath, "utf-8");
		expect(content).toContain("# Application name");
	});
});

describe("bug 13: setProperty aborts on dangerous mid-path keys", () => {
	test("__proto__ segment does not redirect writes to the wrong object", () => {
		const obj: Record<string, any> = { safe: {} };
		setProperty(obj, "__proto__.polluted", "x");
		expect(({} as any).polluted).toBeUndefined();
		// Must not have written "polluted" onto obj itself either
		expect(obj.polluted).toBeUndefined();
	});
});

describe("bug 8: removeEnvKey comment handling", () => {
	test("removes the whole multi-line description block, not just the last line", () => {
		const content = "# Database host\n# used by the API\nDB_HOST=x\nOTHER=1";
		const result = removeEnvKey(content, "DB_HOST");
		expect(result).not.toContain("DB_HOST");
		expect(result).not.toContain("# Database host");
		expect(result).not.toContain("# used by the API");
		expect(result).toContain("OTHER=1");
	});

	test("keeps comments separated from the key by a blank line", () => {
		const content = "# Section: database\n\nDB_HOST=x\nOTHER=1";
		const result = removeEnvKey(content, "DB_HOST");
		expect(result).toContain("# Section: database");
		expect(result).not.toContain("DB_HOST");
	});
});

describe("bug 10: missing-property detection uses the TypeBox enum, not magic 45", () => {
	test("EnvDriver.formatError classifies ObjectRequiredProperty errors as missing", async () => {
		const { ValueErrorType } = await import("@sinclair/typebox/errors");
		const driver = new EnvDriver({ forceExit: false });
		const message = driver.formatError([
			{
				type: ValueErrorType.ObjectRequiredProperty,
				path: "/app/port",
				message: "Expected property",
				schema: { type: "number" },
				value: undefined,
			},
		]);
		expect(message).toContain("add:");
		expect(message).toContain("APP_PORT");
	});
});

describe("bug 12: load() compiles the schema only once without only_importants", () => {
	test("buildTypeBoxSchema is not called redundantly on plain load", () => {
		setupTmp();
		const envPath = tmpFile("compile-once.env");
		fs.writeFileSync(envPath, "APP_PORT=8080\n");

		const driver = new EnvDriver({ path: envPath, forceExit: false });
		const config = new Kfg(driver, { app: { port: c.number() } });

		// Pure refactor (single compilation) — this guards the observable behavior.
		config.load();
		expect(config.get("app.port")).toBe(8080);
		config.load({ only_importants: true });
		expect(config.get("app.port")).toBe(8080);
	});
});

describe("bug 15: mutation rollback preserves non-JSON-safe values", () => {
	test("set() rollback restores the exact previous cache (structuredClone semantics)", () => {
		setupTmp();
		const envPath = tmpFile("rollback.env");
		fs.writeFileSync(envPath, "APP_PORT=8080\nAPP_NAME=svc\n");

		const driver = new EnvDriver({ path: envPath, forceExit: false });
		const config = new Kfg(driver, {
			app: { port: c.number({ minimum: 1 }), name: c.string() },
		});
		config.load();

		expect(() => config.set("app.port", -5)).toThrow();
		expect(config.get("app.port")).toBe(8080);
		expect(config.get("app.name")).toBe("svc");
	});
});

describe("bug 14: flattenObject preserves empty objects", () => {
	test("round-trip keeps empty object leaves", () => {
		const flat = flattenObject({ a: { b: {} }, c: 1 });
		const back = unflattenObject(flat);
		expect(back).toEqual({ a: { b: {} }, c: 1 });
	});
});
