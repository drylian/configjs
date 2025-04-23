import { describe, expect, test } from "bun:test";
import { c } from "../src/ConfigJS";

describe("BooleanShape", () => {
  test("basic boolean validation", () => {
    const schema = c.boolean();
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
    expect(() => schema.parse("true")).toThrow();
    expect(() => schema.parse(1)).toThrow();
    expect(() => schema.parse(null)).toThrow();
    expect(() => schema.parse(undefined)).toThrow();
  });

  test("optional boolean", () => {
    const schema = c.boolean().optional();
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(undefined)).toBeUndefined();
    expect(() => schema.parse(null)).toThrow();
  });

  test("nullable boolean", () => {
    const schema = c.boolean().nullable();
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(null)).toBeNull();
    expect(() => schema.parse(undefined)).toThrow();
  });

  test("boolean with default", () => {
    const schema = c.boolean().default(true);
    expect(schema.parse(false)).toBe(false);
    expect(schema.parse(undefined)).toBe(true);
    expect(() => schema.parse(null)).toThrow();
  });

  test("coercion", () => {
    const schema = c.boolean().coerce();
    // String values
    expect(schema.parse("true")).toBe(true);
    expect(schema.parse("false")).toBe(false);
    expect(schema.parse("1")).toBe(true);
    expect(schema.parse("0")).toBe(false);
    // Number values
    expect(schema.parse(1)).toBe(true);
    expect(schema.parse(0)).toBe(false);
    expect(schema.parse(-1)).toBe(true);
    // Other values
    expect(schema.parse([])).toBe(true);
    expect(schema.parse({})).toBe(true);
    expect(schema.parse("")).toBe(false);
    expect(schema.parse(null)).toBe(false);
    expect(schema.parse(undefined)).toBe(false);
  });

  test("strict string coercion", () => {
    const schema = c.boolean().coerce();
    expect(schema.parse("true")).toBe(true);
    expect(schema.parse("false")).toBe(false);
    expect(schema.parse("1")).toBe(true);
    expect(schema.parse("0")).toBe(false);
    expect(schema.parse("yes")).toBe(true);
    expect(schema.parse("no")).toBe(false);
    expect(schema.parse("")).toBe(false);
    // Non-string values still work as normal coercion
    expect(schema.parse(1)).toBe(true);
    expect(schema.parse(0)).toBe(false);
    expect(schema.parse(null)).toBe(false);
  });

  test("isTrue", () => {
    const schema = c.boolean().isTrue();
    expect(schema.parse(true)).toBe(true);
    expect(() => schema.parse(false)).toThrow();
  });

  test("isFalse", () => {
    const schema = c.boolean().isFalse();
    expect(schema.parse(false)).toBe(false);
    expect(() => schema.parse(true)).toThrow();
  });

  test("truthy", () => {
    const schema = c.boolean().coerce().truthy();
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse("true")).toBe(true);
    expect(schema.parse(1)).toBe(true);
    expect(schema.parse("1")).toBe(true);
    expect(() => schema.parse(false)).toThrow();
    expect(() => schema.parse("false")).toThrow();
    expect(() => schema.parse(0)).toThrow();
    expect(() => schema.parse("0")).toThrow();
  });

  test("falsy", () => {
    const schema = c.boolean().coerce().falsy();
    expect(schema.parse(false)).toBe(false);
    expect(schema.parse("false")).toBe(false);
    expect(schema.parse(0)).toBe(false);
    expect(schema.parse("0")).toBe(false);
    expect(() => schema.parse(true)).toThrow();
    expect(() => schema.parse("true")).toThrow();
    expect(() => schema.parse(1)).toThrow();
    expect(() => schema.parse("1")).toThrow();
  });

  test("chained validations", () => {
    const schema = c.boolean()
      .coerce()
      .isTrue();
    
    expect(schema.parse("true")).toBe(true);
    expect(schema.parse("1")).toBe(true);
    expect(() => schema.parse("false")).toThrow();
    expect(() => schema.parse("0")).toThrow();
  });

  test("error messages", () => {
    // Test basic boolean error
    try {
      c.boolean().parse("true");
    } catch (error) {
      expect(error.message).toContain("Expected a boolean");
      expect(error.code).toBe("NOT_BOOLEAN");
    }

    // Test strict string error
    try {
      c.boolean().coerce().parse("yes");
    } catch (error) {
      expect(error.message).toContain('String must be "true", "false", "1", or "0"');
      expect(error.code).toBe("INVALID_BOOLEAN_STRING");
    }

    // Test isTrue error
    try {
      c.boolean().isTrue().parse(false);
    } catch (error) {
      expect(error.message).toContain("Value must be true");
      expect(error.code).toBe("NOT_TRUE");
    }
  });

  test("edge cases", () => {
    const schema = c.boolean().coerce();
    // Empty objects/arrays
    expect(schema.parse({})).toBe(true);
    expect(schema.parse([])).toBe(true);
    // Special numbers
    expect(schema.parse(NaN)).toBe(false);
    expect(schema.parse(Infinity)).toBe(true);
    // Special strings
    expect(schema.parse("")).toBe(false); // non-empty string
    expect(schema.parse("TRUE")).toBe(true); // case insensitive?
    expect(schema.parse("FALSE")).toBe(false); // case insensitive?
  });
});