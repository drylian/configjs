import { describe, expect, test } from "bun:test";
import { c } from "../src/ConfigJS";

describe("EnumShape", () => {
  test("basic enum validation (string)", () => {
    const schema = c.enum(["red", "green", "blue"] as const);
    expect(schema.parse("red")).toBe("red");
    expect(schema.parse("green")).toBe("green");
    expect(schema.parse("blue")).toBe("blue");
    expect(() => schema.parse("yellow")).toThrow();
    expect(() => schema.parse(1)).toThrow();
    expect(() => schema.parse(null)).toThrow();
    expect(() => schema.parse(undefined)).toThrow();
  });

  test("basic enum validation (number)", () => {
    const schema = c.enum([1, 2, 3] as const);
    expect(schema.parse(1)).toBe(1);
    expect(schema.parse(2)).toBe(2);
    expect(schema.parse(3)).toBe(3);
    expect(() => schema.parse(4)).toThrow();
    expect(() => schema.parse("1")).toThrow();
    expect(() => schema.parse(null)).toThrow();
    expect(() => schema.parse(undefined)).toThrow();
  });

  test("enum from object", () => {
    const Color = {
      RED: "red",
      GREEN: "green",
      BLUE: "blue"
    } as const;
    
    const schema = c.enum(Color);
    expect(schema.parse("red")).toBe("red");
    expect(schema.parse("green")).toBe("green");
    expect(schema.parse("blue")).toBe("blue");
    expect(() => schema.parse("yellow")).toThrow();
  });

  test("optional enum", () => {
    const schema = c.enum(["a", "b"] as const).optional();
    expect(schema.parse("a")).toBe("a");
    expect(schema.parse(undefined)).toBeUndefined();
    expect(() => schema.parse(null)).toThrow();
  });

  test("nullable enum", () => {
    const schema = c.enum(["a", "b"] as const).nullable();
    expect(schema.parse("a")).toBe("a");
    expect(schema.parse(null)).toBeNull();
    expect(() => schema.parse(undefined)).toThrow();
  });

  test("enum with default", () => {
    const schema = c.enum(["a", "b"] as const).default("a");
    expect(schema.parse("b")).toBe("b");
    expect(schema.parse(undefined)).toBe("a");
    expect(() => schema.parse(null)).toThrow();
  });

  test("hasValue", () => {
    const schema = c.enum(["a", "b", "c"] as const).hasValue("b");
    expect(schema.parse("b")).toBe("b");
    expect(() => schema.parse("a")).toThrow();
    expect(() => schema.parse("c")).toThrow();
  });

  test("notValue", () => {
    const schema = c.enum(["a", "b", "c"] as const).notValue("b");
    expect(schema.parse("a")).toBe("a");
    expect(schema.parse("c")).toBe("c");
    expect(() => schema.parse("b")).toThrow();
  });

  test("oneOf", () => {
    const schema = c.enum(["a", "b", "c", "d"] as const).oneOf(["a", "b"]);
    expect(schema.parse("a")).toBe("a");
    expect(schema.parse("b")).toBe("b");
    expect(() => schema.parse("c")).toThrow();
    expect(() => schema.parse("d")).toThrow();
  });

  test("notOneOf", () => {
    const schema = c.enum(["a", "b", "c", "d"] as const).notOneOf(["a", "b"]);
    expect(schema.parse("c")).toBe("c");
    expect(schema.parse("d")).toBe("d");
    expect(() => schema.parse("a")).toThrow();
    expect(() => schema.parse("b")).toThrow();
  });

  test("chained validations", () => {
    const schema = c.enum(["a", "b", "c", "d"] as const)
      .notValue("a")
      .oneOf(["b", "c"]);
    
    expect(schema.parse("b")).toBe("b");
    expect(schema.parse("c")).toBe("c");
    expect(() => schema.parse("a")).toThrow();
    expect(() => schema.parse("d")).toThrow();
  });

  test("error messages", () => {
    const schema = c.enum(["a", "b"] as const);
    try {
      schema.parse("c");
    } catch (error) {
      expect(error.message).toContain("Value must be one of: a, b");
      expect(error.code).toBe("INVALID_ENUM_VALUE");
    }
  });

  test("complex enum with mixed types", () => {
    const schema = c.enum(["text", 42, true] as const);
    expect(schema.parse("text")).toBe("text");
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse(true)).toBe(true);
    expect(() => schema.parse(false)).toThrow();
    expect(() => schema.parse(43)).toThrow();
    expect(() => schema.parse("other")).toThrow();
  });

  test("enum with numeric strings", () => {
    const schema = c.enum(["1", "2", "3"] as const);
    expect(schema.parse("1")).toBe("1");
    expect(schema.parse("2")).toBe("2");
    expect(schema.parse("3")).toBe("3");
    expect(() => schema.parse(1)).toThrow(); // Note: number vs string
    expect(() => schema.parse("4")).toThrow();
  });
});