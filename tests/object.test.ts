import { describe, expect, test } from "bun:test";
import { c } from "../src/ConfigJS";

describe("ObjectShape", () => {
  test("basic object validation", () => {
    const schema = c.object({
      name: c.string(),
      age: c.number()
    });

    const valid = { name: "John", age: 30 };
    const invalid1 = { name: "John" }; // missing age
    const invalid2 = { name: "John", age: "30" }; // wrong type
    const invalid3 = "not an object";

    expect(schema.parse(valid)).toEqual(valid);
    expect(() => schema.parse(invalid1)).toThrow('Missing required property "age"');
    expect(() => schema.parse(invalid2)).toThrow('Expected a number');
    expect(() => schema.parse(invalid3)).toThrow('Expected object');
  });

  test("optional object", () => {
    const schema = c.object({
      name: c.string()
    }).optional();

    expect(schema.parse({ name: "John" })).toEqual({ name: "John" });
    expect(schema.parse(undefined)).toBeUndefined();
    expect(() => schema.parse(null)).toThrow('Expected object');
  });

  test("nullable object", () => {
    const schema = c.object({
      name: c.string()
    }).nullable();

    expect(schema.parse({ name: "John" })).toEqual({ name: "John" });
    expect(schema.parse(null)).toBeNull();
    expect(() => schema.parse(undefined)).toThrow('Expected object');
  });

  test("object with default", () => {
    const schema = c.object({
      name: c.string()
    }).default({ name: "Default" });

    expect(schema.parse({ name: "John" })).toEqual({ name: "John" });
    expect(schema.parse(undefined)).toEqual({ name: "Default" });
    expect(schema.parse(null)).toEqual({
      name: "Default",
    });
  });

  test("nested objects", () => {
    const schema = c.object({
      user: c.object({
        name: c.string(),
        age: c.number()
      })
    });

    const valid = { user: { name: "John", age: 30 } };
    const invalid = { user: { name: "John", age: "30" } };

    expect(schema.parse(valid)).toEqual(valid);
    expect(() => schema.parse(invalid)).toThrow('Expected a number');
  });

  test("object with arrays", () => {
    const schema = c.object({
      tags: c.array(c.string())
    });

    const valid = { tags: ["a", "b"] };
    const invalid = { tags: "not an array" };

    expect(schema.parse(valid)).toEqual(valid);
    expect(() => schema.parse(invalid)).toThrow('Expected an array');
  });

  test("partial object", () => {
    const schema = c.object({
      name: c.string(),
      age: c.number()
    }).partial();

    const valid1 = { name: "John", age: 30 };
    const valid2 = { name: "John" };
    const valid3 = { age: 30 };
    const valid4 = {};

    expect(schema.parse(valid1)).toEqual(valid1 as never);
    expect(schema.parse(valid2)).toEqual(valid2 as never);
    expect(schema.parse(valid3)).toEqual(valid3 as never);
    expect(schema.parse(valid4)).toEqual(valid4 as never);

    // Should still validate types for provided properties
    expect(() => schema.parse({ name: 123 })).toThrow('Expected a string');
  });

  test("merge objects", () => {
    const schema1 = c.object({ name: c.string() });
    const schema2 = c.object({ age: c.number() });
    const merged = schema1.merge(schema2);

    const valid = { name: "John", age: 30 };
    const invalid = { name: "John" }; // missing age

    expect(merged.parse(valid)).toEqual(valid);
    expect(() => merged.parse(invalid)).toThrow('Missing required property "age"');
  });

  test("pick properties", () => {
    const schema = c.object({
      name: c.string(),
      age: c.number(),
      email: c.string().email()
    }).pick(["name", "age"]);

    const valid = { name: "John", age: 30 };
    const invalid1 = { name: "John" }; // missing age
    const invalid2 = { name: "John", age: 30, email: "john@example.com" }; // extra property

    expect(schema.parse(valid)).toEqual(valid);
    expect(() => schema.parse(invalid1)).toThrow('Missing required property "age"');
    expect(schema.parse(invalid2)).toEqual(valid); // Extra properties should be stripped
  });

  test("omit properties", () => {
    const schema = c.object({
      name: c.string(),
      age: c.number(),
      email: c.string().email()
    }).omit(["email"]);

    const valid = { name: "John", age: 30 };
    const invalid1 = { name: "John" }; // missing age
    const invalid2 = { name: "John", age: 30, email: "john@example.com" }; // extra property

    expect(schema.parse(valid)).toEqual(valid);
    expect(() => schema.parse(invalid1)).toThrow('Missing required property "age"');
    expect(schema.parse(invalid2)).toEqual(valid); // Extra properties should be stripped
  });

  test("hasProperty", () => {
    const schema = c.object({
      name: c.string()
    }).hasProperty("name");

    expect(schema.parse({ name: "John" })).toEqual({ name: "John" });
    expect(() => schema.parse({})).toThrow('Missing required property "name"');
  });

  test("forbiddenProperty", () => {
    const schema = c.object({
      name: c.string()
    }).forbiddenProperty("secret" as never);

    expect(schema.parse({ name: "John" })).toEqual({ name: "John" });
    expect(schema.parse({ name: "John", secret: "data" })).toEqual({ name: "John" });
  });

  test("exactProperties", () => {
    const schema = c.object({
      name: c.string(),
      age: c.number()
    }).exactProperties(2);

    const valid = { name: "John", age: 30 };
    const invalid1 = { name: "John" };
    const invalid2 = { name: "John", age: 30, extra: "field" };

    expect(schema.parse(valid)).toEqual(valid);
    expect(() => schema.parse(invalid1)).toThrow('Missing required property \"age\"');
    expect(schema.parse(invalid2)).toEqual({
      name: "John",
      age: 30,
    });
  });

  test("minProperties", () => {
    const schema = c.object({
      name: c.string(),
      age: c.number()
    }).minProperties(1);

    const valid1 = { name: "John" };
    const valid2 = { name: "John", age: 30 };
    const invalid = {};

    expect(schema.parse(valid1)).toEqual(valid1 as never);
    expect(schema.parse(valid2)).toEqual(valid2);
    expect(() => schema.parse(invalid)).toThrow('Object must have at least 1 properties');
  });

  test("maxProperties", () => {
    const schema = c.object({
      name: c.string(),
      age: c.number(),
      extra: c.string().optional(),
    }).minProperties(1).maxProperties(2);

    const valid1 = { name: "John" };
    const valid2 = { name: "John", age: 30 };
    const invalid = { name: "John", age: 30, extra: "field" };
    expect(schema.parse(valid1)).toEqual(valid1 as never);
    expect(schema.parse(valid2)).toEqual(valid2 as never);
    expect(() => schema.parse(invalid)).toThrow('Object must have at most 2 properties');
  });

  test("propertyValue", () => {
    const schema = c.object({
      age: c.number()
    }).propertyValue("age", (age) => age >= 18);

    const valid = { age: 20 };
    const invalid = { age: 15 };

    expect(schema.parse(valid)).toEqual(valid);
    expect(() => schema.parse(invalid)).toThrow('Property "age" is invalid');
  });

  test("nonEmpty", () => {
    const schema = c.object({
      name: c.string()
    }).nonEmpty();

    const valid = { name: "John" };
    const invalid = {};

    expect(schema.parse(valid)).toEqual(valid);
    expect(() => schema.parse(invalid)).toThrow('Object must have at least 1 properties');
  });

  test("complex nested structure", () => {
    const schema = c.object({
      id: c.string().uuid(),
      user: c.object({
        name: c.string(),
        age: c.number().min(18),
        contacts: c.array(c.object({
          type: c.enum(["email", "phone"]),
          value: c.string()
        }))
      }),
      metadata: c.object({}).partial()
    });

    const valid = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      user: {
        name: "John",
        age: 30,
        contacts: [
          { type: "email", value: "john@example.com" },
          { type: "phone", value: "123456789" }
        ]
      },
      metadata: {}
    };

    const invalid = {
      id: "invalid-uuid",
      user: {
        name: "John",
        age: 15,
        contacts: [
          { type: "invalid", value: "john@example.com" }
        ]
      },
      metadata: "not an object"
    };

    expect(schema.parse(valid)).toEqual(valid as never);
    expect(() => schema.parse(invalid)).toThrow();
  });

  test("partial with nested objects", () => {
    const schema = c.object({
      user: c.object({
        name: c.string(),
        age: c.number()
      }),
      valor:c.string()
    }).partial();

    const valid1 = { user: { name: "John", age: 30 } };
    const valid2 = { user: { name: "John", age: 30 } };
    const valid3 = { user: {} };
    const valid4 = {};
    const valor =schema.parse(valid1)
    expect(schema.parse(valid1)).toEqual(valid1 as never);
    expect(schema.parse(valid2)).toEqual(valid2 as never);
    expect(() => schema.parse(valid3)).toThrow();
    expect(schema.parse(valid4)).toEqual(valid4 as never);
  });

  test("deepPartial with nested objects", () => {
    const schema = c.object({
      user: c.object({
        name: c.string(),
        age: c.number()
      })
    }).deepPartial();

    const valid1 = { user: { name: "John", age: 30 } };
    const valid2 = { user: { name: "John" } };
    const valid3 = { user: {} };
    const valid4 = {};
const valor =schema.parse(valid1)
    expect(schema.parse(valid1)).toEqual(valid1);
    expect(schema.parse(valid2)).toEqual(valid2);
    expect(schema.parse(valid3)).toEqual(valid3);
    expect(schema.parse(valid4)).toEqual(valid4);
  });

  test("default with partial", () => {
    const schema = c.object({
      name: c.string(),
      age: c.number()
    })
      .partial()
      .default({ name: "Default" });

    expect(schema.parse(undefined)).toEqual({ name: "Default" });
    expect(schema.parse({})).toEqual({ name: "Default" });
    expect(schema.parse({ age: 30 })).toEqual({ name: "Default", age: 30 });
  });
});