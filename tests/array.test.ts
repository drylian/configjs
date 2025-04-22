import { describe, expect, test } from "bun:test";
import { c } from "../src/ConfigJS";

describe("ArrayShape", () => {
  test("basic array validation", () => {
    const schema = c.array(c.string());
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(() => schema.parse("not an array")).toThrow();
    expect(() => schema.parse([1, 2])).toThrow();
    expect(() => schema.parse(null)).toThrow();
    expect(() => schema.parse(undefined)).toThrow();
  });

  test("optional array", () => {
    const schema = c.array(c.string()).optional();
    expect(schema.parse(["a"])).toEqual(["a"]);
    expect(schema.parse(undefined)).toBeUndefined();
    expect(() => schema.parse(null)).toThrow();
  });

  test("nullable array", () => {
    const schema = c.array(c.string()).nullable();
    expect(schema.parse(["a"])).toEqual(["a"]);
    expect(schema.parse(null)).toBeNull();
    expect(() => schema.parse(undefined)).toThrow();
  });

  test("array with default", () => {
    const schema = c.array(c.string()).default(["default"]);
    expect(schema.parse(["a"])).toEqual(["a"]);
    expect(schema.parse(undefined)).toEqual(["default"]);
    expect(() => schema.parse(null)).toThrow();
  });

  test("min length", () => {
    const schema = c.array(c.string()).min(2);
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(schema.parse(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(() => schema.parse(["a"])).toThrow();
  });

  test("max length", () => {
    const schema = c.array(c.string()).max(2);
    expect(schema.parse(["a"])).toEqual(["a"]);
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(() => schema.parse(["a", "b", "c"])).toThrow();
  });

  test("exact length", () => {
    const schema = c.array(c.string()).length(2);
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(() => schema.parse(["a"])).toThrow();
    expect(() => schema.parse(["a", "b", "c"])).toThrow();
  });

  test("nonEmpty", () => {
    const schema = c.array(c.string()).nonEmpty();
    expect(schema.parse(["a"])).toEqual(["a"]);
    expect(() => schema.parse([])).toThrow();
  });

  test("unique", () => {
    const schema = c.array(c.string()).unique();
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(() => schema.parse(["a", "a"])).toThrow();
  });

  test("includes", () => {
    const schema = c.array(c.string()).includes("a");
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(() => schema.parse(["b", "c"])).toThrow();
  });

  test("excludes", () => {
    const schema = c.array(c.string()).excludes("a");
    expect(schema.parse(["b", "c"])).toEqual(["b", "c"]);
    expect(() => schema.parse(["a", "b"])).toThrow();
  });

  test("nested arrays", () => {
    const schema = c.array(c.array(c.number()));
    expect(schema.parse([[1], [2, 3]])).toEqual([[1], [2, 3]]);
    expect(() => schema.parse([[1], ["2"]])).toThrow();
  });

  test("complex array elements", () => {
    const schema = c.array(
      c.object({
        id: c.string().uuid(),
        active: c.boolean()
      })
    );
    
    const valid = [{
      id: "123e4567-e89b-12d3-a456-426614174000",
      active: true
    }];
    
    const invalid = [{
      id: "invalid",
      active: "not boolean"
    }];

    expect(schema.parse(valid)).toEqual(valid);
    expect(() => schema.parse(invalid)).toThrow();
  });

  test("chained validations", () => {
    const schema = c.array(c.number())
      .min(1)
      .max(3)
      .unique()
      .nonEmpty();
    
    expect(schema.parse([1, 2])).toEqual([1, 2]);
    expect(() => schema.parse([])).toThrow(); // empty
    expect(() => schema.parse([1, 1])).toThrow(); // not unique
    expect(() => schema.parse([1, 2, 3, 4])).toThrow(); // too long
  });

  test("error messages include paths", () => {
    const schema = c.array(
      c.object({
        name: c.string(),
        age: c.number()
      })
    );

    try {
      schema.parse([{ name: "John", age: "30" }]);
    } catch (error) {
      expect(error.message).toContain("Multiple validation errors");
      expect(error.path).toBe("_unconfigured_property[0]");
    }
  });


  test("empty array validation", () => {
    const schema = c.array(c.any());
    expect(schema.parse([])).toEqual([]);
  });

  test("array with mixed types", () => {
    const schema = c.array(c.union([c.string(), c.number()]));
    expect(schema.parse(["a", 1])).toEqual(["a", 1] as never);
    expect(() => schema.parse(["a", true])).toThrow();
  });
});