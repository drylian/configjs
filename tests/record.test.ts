import { describe, expect, test } from "bun:test";
import { c } from "../src/ConfigJS";

describe("RecordShape", () => {
    test("basic record validation", () => {
        const schema = c.record(c.string(), c.number());
        const validRecord = { a: 1, b: 2 };
        const invalidRecord = { a: "one", b: 2 };

        expect(schema.parse(validRecord)).toEqual(validRecord);
        expect(() => schema.parse(invalidRecord)).toThrow();
        expect(() => schema.parse("not an object")).toThrow();
    });

    test("optional record", () => {
        const schema = c.record(c.string(), c.number()).optional();
        expect(schema.parse({ a: 1 })).toEqual({ a: 1 });
        expect(schema.parse(undefined)).toBeUndefined();
        expect(() => schema.parse(null)).toThrow();
    });

    test("nullable record", () => {
        const schema = c.record(c.string(), c.number()).nullable();
        expect(schema.parse({ a: 1 })).toEqual({ a: 1 });
        expect(schema.parse(null)).toBeNull();
        expect(() => schema.parse(undefined)).toThrow();
    });

    test("record with default", () => {
        const schema = c.record(c.string(), c.number()).default({ default: 0 });
        expect(schema.parse({ a: 1 })).toEqual({ a: 1 });
        expect(schema.parse(undefined)).toEqual({ default: 0 });
        expect(() => schema.parse(null)).toThrow();
    });

    test("minProperties", () => {
        const schema = c.record(c.string(), c.number()).minProperties(2);
        expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        expect(() => schema.parse({ a: 1 })).toThrow();
    });

    test("maxProperties", () => {
        const schema = c.record(c.string(), c.number()).maxProperties(2);
        expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        expect(() => schema.parse({ a: 1, b: 2, c: 3 })).toThrow();
    });

    test("exactProperties", () => {
        const schema = c.record(c.string(), c.number()).exactProperties(2);
        expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        expect(() => schema.parse({ a: 1 })).toThrow();
        expect(() => schema.parse({ a: 1, b: 2, c: 3 })).toThrow();
    });

    test("hasProperty", () => {
        const schema = c.record(c.string(), c.number()).hasProperty("required");
        expect(schema.parse({ required: 1 })).toEqual({ required: 1 });
        expect(() => schema.parse({ other: 1 })).toThrow();
    });

    test("forbiddenProperty", () => {
        const schema = c.record(c.string(), c.number()).forbiddenProperty("secret");
        expect(schema.parse({ public: 1 })).toEqual({ public: 1 });
        expect(() => schema.parse({ secret: 1 })).toThrow();
    });

    test("propertyValue", () => {
        const schema = c.record(c.string(), c.number())
            .propertyValue("age", (val) => val >= 18);

        expect(schema.parse({ age: 20 })).toEqual({ age: 20 });
        expect(() => schema.parse({ age: 15 })).toThrow();
    });

    test("propertyShape", () => {
        const schema = c.record(c.string(), c.number())
            .propertyShape("age", c.number().min(18));

        expect(schema.parse({ age: 20 })).toEqual({ age: 20 });
        expect(() => schema.parse({ age: 15 })).toThrow();
    });

    test("nonEmpty", () => {
        const schema = c.record(c.string(), c.number()).nonEmpty();
        expect(schema.parse({ a: 1 })).toEqual({ a: 1 });
        expect(() => schema.parse({})).toThrow();
    });

    test("propertyNames", () => {
        const schema = c.record(c.string(), c.number())
            .propertyNames((key) => key.length <= 3);

        expect(schema.parse({ abc: 1 })).toEqual({ abc: 1 });
        expect(() => schema.parse({ longKey: 1 })).toThrow();
    });

    test("propertyValues", () => {
        const schema = c.record(c.string(), c.number())
            .propertyValues((val) => val > 0);

        expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        expect(() => schema.parse({ a: 1, b: 0 })).toThrow();
    });

    test("exactPropertiesShape", () => {
        const schema = c.record(c.string(), c.any())
            .exactPropertiesShape({
                name: c.string(),
                age: c.number().min(18)
            });

        const valid = { name: "John", age: 30 };
        const invalid1 = { name: "John" };
        const invalid2 = { name: "John", age: 15 };
        const invalid3 = { name: "John", age: 30, extra: "field" };

        expect(schema.parse(valid)).toEqual(valid as any);
        expect(() => schema.parse(invalid1)).toThrow();
        expect(() => schema.parse(invalid2)).toThrow();
        expect(() => schema.parse(invalid3)).toThrow();
    });

    test("complex key types", () => {
        const schema = c.record(c.enum(["a", "b"] as const), c.number());
        expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        expect(() => schema.parse({ c: 3 })).toThrow();
    });

    test("nested records", () => {
        const schema = c.record(
            c.string(),
            c.record(c.string(), c.number())
        );

        const valid = { user: { age: 30 } };
        const invalid = { user: { age: "thirty" } };

        expect(schema.parse(valid)).toEqual(valid);
        expect(() => schema.parse(invalid)).toThrow();
    });

    test("chained validations", () => {
        const schema = c.record(c.string(), c.number())
            .minProperties(1)
            .maxProperties(3)
            .hasProperty("required")
            .forbiddenProperty("secret");

        const valid1 = { required: 1 };
        const valid2 = { required: 1, a: 2, b: 3 };
        const invalid1 = {};
        const invalid2 = { required: 1, a: 2, b: 3, c: 4 };
        const invalid3 = { a: 1 };
        const invalid4 = { required: 1, secret: 0 };

        expect(schema.parse(valid1)).toEqual(valid1);
        expect(schema.parse(valid2)).toEqual(valid2);
        expect(() => schema.parse(invalid1)).toThrow();
        expect(() => schema.parse(invalid2)).toThrow();
        expect(() => schema.parse(invalid3)).toThrow();
        expect(() => schema.parse(invalid4)).toThrow();
    });
})
