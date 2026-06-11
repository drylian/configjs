import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { rule } from "../src/rule";
import "../src/utils/formats";

const ok = (schema: any, value: unknown) => Value.Check(schema, value);

describe("rule: string formats", () => {
	test("email", () => {
		const s = rule("required|email");
		expect(ok(s, "a@b.com")).toBe(true);
		expect(ok(s, "not-an-email")).toBe(false);
	});

	test("url / active_url", () => {
		const s = rule("required|url");
		expect(ok(s, "https://example.com/x?y=1")).toBe(true);
		expect(ok(s, "not a url")).toBe(false);
	});

	test("ip accepts v4 and v6", () => {
		const s = rule("required|ip");
		expect(ok(s, "192.168.0.1")).toBe(true);
		expect(ok(s, "::1")).toBe(true);
		expect(ok(s, "999.999.999.999")).toBe(false);
		expect(ok(s, "nope")).toBe(false);
	});

	test("ipv4 rejects out-of-range octets", () => {
		const s = rule("required|ipv4");
		expect(ok(s, "10.0.0.1")).toBe(true);
		expect(ok(s, "256.1.1.1")).toBe(false);
	});

	test("ipv6", () => {
		const s = rule("required|ipv6");
		expect(ok(s, "2001:db8::8a2e:370:7334")).toBe(true);
		expect(ok(s, "192.168.0.1")).toBe(false);
	});

	test("mac_address", () => {
		const s = rule("required|mac_address");
		expect(ok(s, "00:1A:2B:3C:4D:5E")).toBe(true);
		expect(ok(s, "00-1A-2B-3C-4D-5E")).toBe(true);
		expect(ok(s, "00:1A:2B:3C:4D")).toBe(false);
	});

	test("json", () => {
		const s = rule("required|json");
		expect(ok(s, '{"a":1}')).toBe(true);
		expect(ok(s, "{a:1}")).toBe(false);
	});

	test("hex_color", () => {
		const s = rule("required|hex_color");
		expect(ok(s, "#fff")).toBe(true);
		expect(ok(s, "#a1b2c3")).toBe(true);
		expect(ok(s, "fff")).toBe(false);
		expect(ok(s, "#xyz")).toBe(false);
	});

	test("timezone", () => {
		const s = rule("required|timezone");
		expect(ok(s, "America/Sao_Paulo")).toBe(true);
		expect(ok(s, "Not/AZone")).toBe(false);
	});

	test("hostname", () => {
		const s = rule("required|hostname");
		expect(ok(s, "api.example.com")).toBe(true);
		expect(ok(s, "-bad-.com")).toBe(false);
	});

	test("date and time", () => {
		expect(ok(rule("required|date"), "2026-06-11")).toBe(true);
		expect(ok(rule("required|date"), "11/06/2026")).toBe(false);
		expect(ok(rule("required|time"), "23:59:59")).toBe(true);
		expect(ok(rule("required|time"), "24:00")).toBe(false);
	});
});

describe("rule: string patterns", () => {
	test("not_regex", () => {
		const s = rule("required|not_regex:/foo/");
		expect(ok(s, "bar baz")).toBe(true);
		expect(ok(s, "has foo inside")).toBe(false);
	});

	test("doesnt_start_with", () => {
		const s = rule("required|doesnt_start_with:tmp,bak");
		expect(ok(s, "main.ts")).toBe(true);
		expect(ok(s, "tmpfile")).toBe(false);
		expect(ok(s, "bakup")).toBe(false);
	});

	test("doesnt_end_with", () => {
		const s = rule("required|doesnt_end_with:.tmp,.bak");
		expect(ok(s, "data.json")).toBe(true);
		expect(ok(s, "data.tmp")).toBe(false);
	});

	test("contains requires every substring", () => {
		const s = rule("required|contains:host,port");
		expect(ok(s, "host=1 port=2")).toBe(true);
		expect(ok(s, "host only")).toBe(false);
	});

	test("decimal:places", () => {
		const s = rule("required|decimal:2");
		expect(ok(s, "10.25")).toBe(true);
		expect(ok(s, "-3.99")).toBe(true);
		expect(ok(s, "10.5")).toBe(false);
		expect(ok(s, "10")).toBe(false);
	});

	test("decimal:min,max", () => {
		const s = rule("required|decimal:1,3");
		expect(ok(s, "1.5")).toBe(true);
		expect(ok(s, "1.555")).toBe(true);
		expect(ok(s, "1.5555")).toBe(false);
	});
});

describe("rule: numeric", () => {
	test("integer digits:n bounds the value range", () => {
		const s = rule("required|integer|digits:3");
		expect(ok(s, 100)).toBe(true);
		expect(ok(s, 999)).toBe(true);
		expect(ok(s, 99)).toBe(false);
		expect(ok(s, 1000)).toBe(false);
	});

	test("numeric size:n means exact value", () => {
		const s = rule("required|integer|size:10");
		expect(ok(s, 10)).toBe(true);
		expect(ok(s, 11)).toBe(false);
	});
});

describe("rule: accepted / declined", () => {
	test("accepted only allows true", () => {
		const s = rule("accepted");
		expect(ok(s, true)).toBe(true);
		expect(ok(s, false)).toBe(false);
	});

	test("declined only allows false", () => {
		const s = rule("declined");
		expect(ok(s, false)).toBe(true);
		expect(ok(s, true)).toBe(false);
	});
});

describe("rule: array", () => {
	test("array with min/max items", () => {
		const s = rule("required|array|min:1|max:3");
		expect(ok(s, ["a"])).toBe(true);
		expect(ok(s, [])).toBe(false);
		expect(ok(s, [1, 2, 3, 4])).toBe(false);
	});

	test("array distinct enforces unique items", () => {
		const s = rule("required|array|distinct");
		expect(ok(s, [1, 2, 3])).toBe(true);
		expect(ok(s, [1, 1])).toBe(false);
	});

	test("array size:n is exact length", () => {
		const s = rule("required|array|size:2");
		expect(ok(s, [1, 2])).toBe(true);
		expect(ok(s, [1])).toBe(false);
	});
});

describe("rule: optional still composes with new rules", () => {
	test("optional email accepts undefined inside an object", () => {
		const s = rule("optional|email");
		const container = Type.Object({ e: s as any });
		expect(Value.Check(container, {})).toBe(true);
		expect(Value.Check(container, { e: "a@b.com" })).toBe(true);
		expect(Value.Check(container, { e: "bad" })).toBe(false);
	});
});
