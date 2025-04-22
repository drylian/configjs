import { describe, expect, test } from "bun:test";
import { c } from "../src/ConfigJS";

describe("StringShape", () => {
  test("basic string validation", () => {
    const schema = c.string();
    expect(schema.parse("hello")).toBe("hello");
    expect(() => schema.parse(123)).toThrow();
    expect(() => schema.parse(null)).toThrow();
    expect(() => schema.parse(undefined)).toThrow();
  });

  test("optional string", () => {
    const schema = c.string().optional();
    expect(schema.parse("hello")).toBe("hello");
    expect(schema.parse(undefined)).toBeUndefined();
    expect(() => schema.parse(null)).toThrow();
  });

  test("nullable string", () => {
    const schema = c.string().nullable();
    expect(schema.parse("hello")).toBe("hello");
    expect(schema.parse(null)).toBeNull();
    expect(() => schema.parse(undefined)).toThrow();
  });

  test("string with default", () => {
    const schema = c.string().default("default");
    expect(schema.parse("hello")).toBe("hello");
    expect(schema.parse(undefined)).toBe("default");
    expect(() => schema.parse(null)).toThrow();
  });

  test("coercion", () => {
    const schema = c.string().coerce();
    expect(schema.parse(123)).toBe("123");
    expect(schema.parse(true)).toBe("true");
    expect(schema.parse(null)).toBe("");
    expect(schema.parse(undefined)).toBe("");
    expect(schema.parse({ a: 1 })).toBe('{"a":1}');
  });

  test("min length", () => {
    const schema = c.string().min(3);
    expect(schema.parse("abc")).toBe("abc");
    expect(() => schema.parse("ab")).toThrow();
  });

  test("max length", () => {
    const schema = c.string().max(5);
    expect(schema.parse("abcde")).toBe("abcde");
    expect(() => schema.parse("abcdef")).toThrow();
  });

  test("exact length", () => {
    const schema = c.string().length(4);
    expect(schema.parse("abcd")).toBe("abcd");
    expect(() => schema.parse("abc")).toThrow();
    expect(() => schema.parse("abcde")).toThrow();
  });

  test("email validation", () => {
    const schema = c.string().email();
    expect(schema.parse("test@example.com")).toBe("test@example.com");
    expect(() => schema.parse("invalid-email")).toThrow();
  });

  test("URL validation", () => {
    const schema = c.string().url();
    expect(schema.parse("https://example.com")).toBe("https://example.com");
    expect(() => schema.parse("not-a-url")).toThrow();
  });

  test("UUID validation", () => {
    const schema = c.string().uuid();
    expect(schema.parse("123e4567-e89b-12d3-a456-426614174000")).toBe(
      "123e4567-e89b-12d3-a456-426614174000"
    );
    expect(() => schema.parse("not-a-uuid")).toThrow();
  });

  test("credit card validation", () => {
    const schema = c.string().creditCard();
    // Test with a valid Luhn number
    expect(schema.parse("4111111111111111")).toBe("4111111111111111");
    expect(() => schema.parse("1234567812345678")).toThrow();
  });

  test("hex color validation", () => {
    const schema = c.string().hexColor();
    expect(schema.parse("#ff0000")).toBe("#ff0000");
    expect(schema.parse("#f00")).toBe("#f00");
    expect(() => schema.parse("#zzz")).toThrow();
  });

  test("IP address validation", () => {
    const schema = c.string().ipAddress();
    expect(schema.parse("192.168.1.1")).toBe("192.168.1.1");
    expect(schema.parse("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
      "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
    );
    expect(() => schema.parse("not.an.ip")).toThrow();
  });

  test("ISO date validation", () => {
    const schema = c.string().isoDate();
    const date = new Date().toISOString();
    expect(schema.parse(date)).toBe(date);
    expect(() => schema.parse("2023-01-01")).toThrow();
  });

  test("trimmed string", () => {
    const schema = c.string().trimmed();
    expect(() => schema.parse("  hello  ")).toThrow();
  });

  test("lowercase string", () => {
    const schema = c.string().lowercase();
    expect(() => schema.parse("HELLO")).toThrow();
  });

  test("uppercase string", () => {
    const schema = c.string().uppercase();
    expect(() => schema.parse("hello")).toThrow();
  });

  test("alphanumeric validation", () => {
    const schema = c.string().alphanumeric();
    expect(schema.parse("abc123")).toBe("abc123");
    expect(() => schema.parse("abc!123")).toThrow();
  });

  test("contains substring", () => {
    const schema = c.string().contains("foo");
    expect(schema.parse("barfoobar")).toBe("barfoobar");
    expect(() => schema.parse("barbar")).toThrow();
  });

  test("startsWith", () => {
    const schema = c.string().startsWith("foo");
    expect(schema.parse("foobar")).toBe("foobar");
    expect(() => schema.parse("barfoo")).toThrow();
  });

  test("endsWith", () => {
    const schema = c.string().endsWith("bar");
    expect(schema.parse("foobar")).toBe("foobar");
    expect(() => schema.parse("barfoo")).toThrow();
  });

  test("oneOf", () => {
    const schema = c.string().oneOf(["a", "b", "c"]);
    expect(schema.parse("a")).toBe("a");
    expect(schema.parse("b")).toBe("b");
    expect(() => schema.parse("d")).toThrow();
  });

  test("notEmpty", () => {
    const schema = c.string().notEmpty();
    expect(schema.parse("a")).toBe("a");
    expect(() => schema.parse("")).toThrow();
  });

  test("asNumber", () => {
    const schema = c.string().asNumber();
    expect(schema.parse("123")).toBe("123");
    expect(() => schema.parse("abc")).toThrow();
  });

  test("asInteger", () => {
    const schema = c.string().asInteger();
    expect(schema.parse("123")).toBe("123");
    expect(() => schema.parse("123.45")).toThrow();
  });

  test("asBoolean", () => {
    const schema = c.string().asBoolean();
    expect(schema.parse("true")).toBe("true");
    expect(schema.parse("false")).toBe("false");
    expect(schema.parse("1")).toBe("1");
    expect(schema.parse("0")).toBe("0");
    expect(() => schema.parse("yes")).toThrow();
  });

  test("asJson", () => {
    const schema = c.string().asJson();
    expect(schema.parse('{"a":1}')).toBe('{"a":1}');
    expect(() => schema.parse("{a:1}")).toThrow();
  });

  test("pattern/regex", () => {
    const schema = c.string().pattern(/^[A-Z][a-z]+$/);
    expect(schema.parse("John")).toBe("John");
    expect(() => schema.parse("john")).toThrow();
  });

  test("chained validations", () => {
    const schema = c.string()
      .min(3)
      .max(10)
      .alphanumeric()
      .uppercase();
    
    expect(schema.parse("ABC123")).toBe("ABC123");
    expect(() => schema.parse("ab")).toThrow(); // too short
    expect(() => schema.parse("abcdefghijk")).toThrow(); // too long
    expect(() => schema.parse("ABC!123")).toThrow(); // not alphanumeric
    expect(() => schema.parse("abc123")).toThrow(); // not uppercase
  });
});