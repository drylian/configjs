import { describe, expect, test } from "bun:test";
import { c, StringShape, NumberShape, BooleanShape, ObjectShape, ArrayShape, RecordShape, EnumShape, AnyShape, UnionShape } from "../src/ConfigJS";


describe("Shape Factory", () => {
    // =====================
    // BASIC TYPE SHAPES
    // =====================
    describe("Basic Types", () => {
        test("string() creates StringShape", () => {
            const shape = c.string();
            expect(shape).toBeInstanceOf(StringShape);
        });

        test("number() creates NumberShape", () => {
            const shape = c.number();
            expect(shape).toBeInstanceOf(NumberShape);
        });

        test("boolean() creates BooleanShape", () => {
            const shape = c.boolean();
            expect(shape).toBeInstanceOf(BooleanShape);
        });

        test("any() creates AnyShape", () => {
            const shape = c.any();
            expect(shape).toBeInstanceOf(AnyShape);
        });
    });

    // =====================
    // COMPLEX TYPE SHAPES
    // =====================
    describe("Complex Types", () => {
        test("object() creates ObjectShape", () => {
            const shape = c.object({ name: c.string() });
            expect(shape).toBeInstanceOf(ObjectShape);
        });

        test("array() creates ArrayShape", () => {
            const shape = c.array(c.string());
            expect(shape).toBeInstanceOf(ArrayShape);
        });

        test("record() creates RecordShape", () => {
            const shape = c.record(c.string(), c.number());
            expect(shape).toBeInstanceOf(RecordShape);
        });

        test("enum() creates EnumShape from array", () => {
            const shape = c.enum(["a", "b", "c"]);
            expect(shape).toBeInstanceOf(EnumShape);
        });

        test("enum() creates EnumShape from object", () => {
            const shape = c.enum({ A: "a", B: "b", C: "c" });
            expect(shape).toBeInstanceOf(EnumShape);
        });

        test("union() creates UnionShape", () => {
            const shape = c.union([c.string(), c.number()]);
            expect(shape).toBeInstanceOf(UnionShape);
        });

        test("unionOf() creates UnionShape", () => {
            const shape = c.unionOf(c.string(), c.number());
            expect(shape).toBeInstanceOf(UnionShape);
        });
    });

    // =====================
    // TYPE MODIFIERS
    // =====================
    describe("Type Modifiers", () => {
        test("optional() makes shape optional", () => {
            const shape = c.string().optional();
            expect(c.validate(undefined, shape).success).toBe(true);
        });

        test("nullable() makes shape nullable", () => {
            const shape = c.string().nullable();
            expect(c.validate(null, shape).success).toBe(true);
        });

        test("partial() makes object partial", () => {
            const shape = c.object({ name: c.string() }).partial();
            expect(c.validate({}, shape).success).toBe(true);
        });
    });

    // =====================
    // COERCION
    // =====================
    describe("Coercion", () => {
        test("coerce.string() coerces to string", () => {
            const shape = c.coerce.string();
            expect(c.validate(123, shape).data).toBe("123");
        });

        test("coerce.number() coerces to number", () => {
            const shape = c.coerce.number();
            expect(c.validate("123", shape).data).toBe(123);
        });

        test("coerce.boolean() coerces to boolean", () => {
            const shape = c.coerce.boolean();
            expect(c.validate("true", shape).data).toBe(true);
        });

        test("coerce.date() coerces to ISO date string", () => {
            const shape = c.coerce.date();
            const date = new Date();
            expect(c.validate(date.toISOString(), shape).data).toBe(date.toISOString());
        });
    });

    // =====================
    // VALIDATION UTILITIES
    // =====================
    describe("Validation Utilities", () => {
        test("validate() returns success with valid data", () => {
            const result = c.validate("test", c.string());
            expect(result.success).toBe(true);
            expect(result.data).toBe("test");
        });

        test("validate() returns failure with invalid data", () => {
            const result = c.validate(123, c.string());
            expect(result.success).toBe(false);
            expect(result.error).toBeInstanceOf(Error);
        });

        test("isValid() returns true for valid data", () => {
            expect(c.isValid("test", c.string())).toBe(true);
        });

        test("isValid() returns false for invalid data", () => {
            expect(c.isValid(123, c.string())).toBe(false);
        });
    });

    // =====================
    // OBJECT UTILITIES
    // =====================
    describe("Object Utilities", () => {
        const userShape = c.object({
            name: c.string(),
            age: c.number(),
        });

        test("pick() creates shape with picked properties", () => {
            const nameOnly = c.pick(userShape, ["name"]);
            expect(c.validate({ name: "test" }, nameOnly).success).toBe(true);
            expect(c.validate({ name: "test", age: 30 }, nameOnly).success).toBe(true);
            expect(c.validate({ age: 30 }, nameOnly).success).toBe(false);
        });

        test("omit() creates shape with omitted properties", () => {
            const noAge = c.omit(userShape, ["age"]);
            expect(c.validate({ name: "test" }, noAge).success).toBe(true);
            expect(c.validate({ name: "test", age: 30 }, noAge).success).toBe(true);
            expect(c.validate({ age: 30 }, noAge).success).toBe(false);
        });

        test("merge() combines two object shapes", () => {
            const addressShape = c.object({ street: c.string() });
            const userWithAddress = c.merge(userShape, addressShape);
            expect(c.validate({ name: "test", age: 30, street: "123 Main" }, userWithAddress).success).toBe(true);
        });

        test("extend() adds properties to object shape", () => {
            const extendedUser = c.extend(userShape, { email: c.string().email() });
            expect(c.validate({ name: "test", age: 30, email: "test@example.com" }, extendedUser).success).toBe(true);
        });
    });

    // =====================
    // STRING SPECIALIZATIONS
    // =====================
    describe("String Specializations", () => {
        test("email() validates email format", () => {
            const shape = c.email();
            expect(c.isValid("test@example.com", shape)).toBe(true);
            expect(c.isValid("invalid", shape)).toBe(false);
        });

        test("uuid() validates UUID format", () => {
            const shape = c.uuid();
            expect(c.isValid("123e4567-e89b-12d3-a456-426614174000", shape)).toBe(true);
            expect(c.isValid("invalid", shape)).toBe(false);
        });

        test("url() validates URL format", () => {
            const shape = c.url();
            expect(c.isValid("https://example.com", shape)).toBe(true);
            expect(c.isValid("invalid", shape)).toBe(false);
        });

        test("ip() validates IP address format", () => {
            const shape = c.ip();
            expect(c.isValid("192.168.1.1", shape)).toBe(true);
            expect(c.isValid("invalid", shape)).toBe(false);
        });

        test("dateString() validates ISO date format", () => {
            const shape = c.dateString();
            expect(c.isValid("2023-01-01T00:00:00.000Z", shape)).toBe(true);
            expect(c.isValid("invalid", shape)).toBe(false);
        });

        test("hexColor() validates hex color format", () => {
            const shape = c.hexColor();
            expect(c.isValid("#ffffff", shape)).toBe(true);
            expect(c.isValid("invalid", shape)).toBe(false);
        });

        test("creditCard() validates credit card format", () => {
            const shape = c.creditCard();
            expect(c.isValid("4111111111111111", shape)).toBe(true); // Test Visa
            expect(c.isValid("invalid", shape)).toBe(false);
        });

        test("regex() validates against custom regex", () => {
            const shape = c.regex(/^[A-Z]+$/);
            expect(c.isValid("ABC", shape)).toBe(true);
            expect(c.isValid("abc", shape)).toBe(false);
        });
    });

    // =====================
    // NUMBER SPECIALIZATIONS
    // =====================
    describe("Number Specializations", () => {
        test("int() validates integers", () => {
            const shape = c.int();
            expect(c.isValid(123, shape)).toBe(true);
            expect(c.isValid(123.45, shape)).toBe(false);
        });

        test("positive() validates positive numbers", () => {
            const shape = c.positive();
            expect(c.isValid(123, shape)).toBe(true);
            expect(c.isValid(-123, shape)).toBe(false);
        });

        test("negative() validates negative numbers", () => {
            const shape = c.negative();
            expect(c.isValid(-123, shape)).toBe(true);
            expect(c.isValid(123, shape)).toBe(false);
        });

        test("port() validates port numbers", () => {
            const shape = c.port();
            expect(c.isValid(8080, shape)).toBe(true);
            expect(c.isValid(0, shape)).toBe(false);
            expect(c.isValid(65536, shape)).toBe(false);
        });

        test("latitude() validates latitude values", () => {
            const shape = c.latitude();
            expect(c.isValid(45.123, shape)).toBe(true);
            expect(c.isValid(-91, shape)).toBe(false);
            expect(c.isValid(91, shape)).toBe(false);
        });

        test("longitude() validates longitude values", () => {
            const shape = c.longitude();
            expect(c.isValid(-180, shape)).toBe(true);
            expect(c.isValid(180, shape)).toBe(true);
            expect(c.isValid(-181, shape)).toBe(false);
            expect(c.isValid(181, shape)).toBe(false);
        });

        test("percentage() validates percentage values", () => {
            const shape = c.percentage();
            expect(c.isValid(50, shape)).toBe(true);
            expect(c.isValid(0, shape)).toBe(true);
            expect(c.isValid(100, shape)).toBe(true);
            expect(c.isValid(-1, shape)).toBe(false);
            expect(c.isValid(101, shape)).toBe(false);
        });
    });

    // =====================
    // LOGICAL OPERATORS
    // =====================
    describe("Logical Operators", () => {
        test("and() combines shapes with AND logic", () => {
            const shape = c.and(c.string(), c.regex(/^[A-Z]+$/));
            expect(c.isValid("ABC", shape)).toBe(true);
            expect(c.isValid("abc", shape)).toBe(false);
            expect(c.isValid(123, shape)).toBe(false);
        });

        test("or() combines shapes with OR logic", () => {
            const shape = c.or(c.string(), c.number());
            expect(c.isValid("test", shape)).toBe(true);
            expect(c.isValid(123, shape)).toBe(true);
            expect(c.isValid(true, shape)).toBe(false);
        });

        test("not() negates a shape", () => {
            const shape = c.not(c.number());
            expect(c.isValid("test", shape)).toBe(true);
            expect(c.isValid(123, shape)).toBe(false);
        });
    });

    // =====================
    // RANDOM GENERATORS
    // =====================
    describe("Random Generators", () => {
        test("random() generates string of specified length", () => {
            const str = c.random(10);
            expect(str.length).toBe(10);
        });

        test("randomInt() generates number within range", () => {
            const num = c.randomInt(5, 10);
            expect(num).toBeGreaterThanOrEqual(5);
            expect(num).toBeLessThanOrEqual(10);
        });

        test("randomUuid() generates valid UUID", () => {
            const uuid = c.randomUuid();
            expect(c.isValid(uuid, c.uuid())).toBe(true);
        });
    });

    // =====================
    // CUSTOM VALIDATION
    // =====================
    describe("Custom Validation", () => {
        test("custom() creates shape with custom validator", () => {
            const shape = c.custom((val): val is string => typeof val === "string" && val.length > 5);
            expect(c.isValid("long enough", shape)).toBe(true);
            expect(c.isValid("short", shape)).toBe(false);
        });

        test("refine() adds custom validation to existing shape", () => {
            const shape = c.string().refine(val => val.length > 5, "Must be longer than 5 characters");
            expect(c.isValid("long enough", shape)).toBe(true);
            expect(c.isValid("short", shape)).toBe(false);
        });
    });
});