import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { Value } from "@sinclair/typebox/value";
import { c, EnvDriver, JsonDriver, Kfg, rule } from "../src";
import "../src/utils/formats";

const tmpDir = path.resolve(process.cwd(), "tests", ".tmp-faults2");
fs.mkdirSync(tmpDir, { recursive: true });
const tmpFile = (n: string) => path.join(tmpDir, n);

describe("fault A: refines custom validators are ignored", () => {
	test("a refine that always fails should reject the value", () => {
		const envPath = tmpFile("refines.env");
		fs.writeFileSync(envPath, "TOKEN=short\n");
		const driver = new EnvDriver({ path: envPath, forceExit: false });
		const config = new Kfg(driver, {
			token: c.string({
				refines: [(v) => (typeof v === "string" && v.length >= 10) || "too short"],
			}),
		});
		// "short" violates the refine → load must throw
		expect(() => config.load()).toThrow();
	});
});

describe("fault B: coerceType boolean only understands 'true'", () => {
	test("common truthy env strings should not silently become false", () => {
		const envPath = tmpFile("bool.env");
		fs.writeFileSync(envPath, "ENABLED=1\n");
		const driver = new EnvDriver({ path: envPath, forceExit: false });
		const config = new Kfg(driver, { enabled: c.boolean() });
		config.load();
		// "1" is the canonical truthy env value — must be true, not false
		expect(config.get("enabled")).toBe(true);
	});

	test("'yes' and 'on' are truthy too", () => {
		const envPath = tmpFile("bool2.env");
		fs.writeFileSync(envPath, "A=yes\nB=on\n");
		const driver = new EnvDriver({ path: envPath, forceExit: false });
		const config = new Kfg(driver, { a: c.boolean(), b: c.boolean() });
		config.load();
		expect(config.get("a")).toBe(true);
		expect(config.get("b")).toBe(true);
	});

	test("invalid boolean string should fail rather than coerce to false", () => {
		const envPath = tmpFile("bool3.env");
		fs.writeFileSync(envPath, "FLAG=maybe\n");
		const driver = new EnvDriver({ path: envPath, forceExit: false });
		const config = new Kfg(driver, { flag: c.boolean() });
		expect(() => config.load()).toThrow();
	});
});

describe("fault C: numeric 'in:' enum rejects numeric input", () => {
	test("rule('in:1,2,3') with default 2 should validate against number-like input", () => {
		const schema = rule("in:1,2,3", "2");
		// Coerced env value "2" should pass
		expect(Value.Check(schema, "2")).toBe(true);
	});
});

describe("fault D: additionalProperties inconsistent between root and nested", () => {
	test("unknown keys behave the same at root and inside c.Object", () => {
		const envPath = tmpFile("extra.json");
		// root level extra key + nested extra key
		fs.writeFileSync(
			envPath,
			JSON.stringify({
				known: "x",
				extraRoot: "keep?",
				obj: { inner: "y", extraNested: "keep?" },
			}),
		);
		const driver = new JsonDriver({ path: envPath, allow_backup: false });
		const config = new Kfg(driver, {
			known: c.string(),
			obj: c.object({ inner: c.string() }),
		});
		config.load();
		const root = config.toJSON() as any;
		const rootHasExtra = "extraRoot" in root;
		const nestedHasExtra = "extraNested" in (root.obj ?? {});
		// They should agree (both strip or both keep) — documents the inconsistency
		expect(rootHasExtra).toBe(nestedHasExtra);
	});
});

describe("fault E: mergePatterns combined string rules", () => {
	test("alpha + starts_with both enforced", () => {
		const schema = rule("required|alpha|starts_with:Ab");
		expect(Value.Check(schema, "Abcd")).toBe(true);
		expect(Value.Check(schema, "Xbcd")).toBe(false); // wrong start
		expect(Value.Check(schema, "Ab12")).toBe(false); // not alpha
	});
});
