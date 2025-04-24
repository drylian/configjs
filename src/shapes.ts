import { t, TshShapeError, type InferShapeType, type TshViewer } from '@caeljs/tsh';

export function ImportantCheck<T>(this: BaseShape<any>, value: T): T {
    if ((typeof value === "undefined" || value === null) && this._important) {
        throw new TshShapeError({
            code: 'IMPORTANT_PROPERTY',
            message: `The property '${this._prop}' is marked as required but was not provided. Please define this value before proceeding.`,
            value,
            shape: this,
        });
    }
    return value;
}

export abstract class AbstractShape<T> extends t.AbstractShape<T> {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
}

export abstract class BaseShape<T> extends t.BaseShape<T> {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
}

export class StringShape extends t.StringShape {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
    //@ts-expect-error ignore injected extends
    public override parse(val: unknown) {
        return ImportantCheck.bind(this as never)(super.parse(val))
    }
}

export class NumberShape extends t.NumberShape {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
    //@ts-expect-error ignore injected extends
    public override parse(val: unknown) {
        return ImportantCheck.bind(this as never)(super.parse(val))
    }
}

export class AnyShape<T> extends t.AnyShape<T> {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
    public override parse(val: unknown) {
        return ImportantCheck.bind(this as never)(super.parse(val))
    }
}

export class ArrayShape<T extends BaseShape<any>> extends t.ArrayShape<T> {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
    //@ts-expect-error ignore injected extends
    public override parse(val: unknown) {
        return ImportantCheck.bind(this as never)(super.parse(val))
    }
}

export class RecordShape<K extends string | number | symbol, V extends BaseShape<any>> extends t.RecordShape<K, V> {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
    //@ts-expect-error ignore injected extends
    public override parse(val: unknown) {
        return ImportantCheck.bind(this as never)(super.parse(val))
    }
}

export class ObjectShape<T extends Record<string, PrimitiveShapes>> extends t.ObjectShape<T> {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
    //@ts-expect-error ignore injected extends
    public override parse(val: unknown) {
        return ImportantCheck.bind(this as never)(super.parse(val))
    }
}

export class BooleanShape extends t.BooleanShape {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
    //@ts-expect-error ignore injected extends
    public override parse(val: unknown) {
        return ImportantCheck.bind(this as never)(super.parse(val))
    }
}

export class EnumShape<T extends (string | number | boolean)> extends t.EnumShape<T> {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
    //@ts-expect-error ignore injected extends
    public override parse(val: unknown) {
        return ImportantCheck.bind(this as never)(super.parse(val))
    }
}

export class UnionShape<T extends PrimitiveShapes[]> extends t.UnionShape<T> {
    public _prop = "_unconfigured_property";
    public prop(property: string) {
        this._prop = property;
        return this;
    }
    public override parse(val: unknown) {
        return ImportantCheck.bind(this as never)(super.parse(val))
    }
}

export type PrimitiveShapes =
    | NumberShape
    | StringShape
    | BooleanShape
    | AnyShape<any>
    | EnumShape<any>
    | ArrayShape<any>
    | ObjectShape<any>
    | RecordShape<any, any>
    | UnionShape<any>
    | BaseShape<any>
    | AbstractShape<any>;

export type infer<T> = TshViewer<InferShapeType<T>>;

export function Enum<const T extends readonly (string | number | boolean)[]>(
    keys: T
): EnumShape<T[number]>;

export function Enum<const T extends Record<string, string | number | boolean>>(
    enumObj: T
): EnumShape<T[keyof T]>;

export function Enum<T extends object | readonly (string | number)[]>(arg: T) {
    if (Array.isArray(arg)) {
        return new EnumShape(arg);
    } else {
        const values = Object.values(arg)
            .filter((v): v is T[keyof T] => typeof v === 'string' || typeof v === 'number');
        return new EnumShape(values as never);
    }
}

// Shape constructors
export function string() { return new StringShape(); }
export function number() { return new NumberShape(); }
export function boolean() { return new BooleanShape(); }
export function any() { return new AnyShape(); }
export function object<T extends Record<string, any>>(shape: T) { return new ObjectShape(shape); }
export function array<T extends BaseShape<any>>(shape: T) { return new ArrayShape(shape); }
export function record<K extends string | number, V extends BaseShape<any>>(keyShape: BaseShape<K>, valueShape: V) {
    return new RecordShape(keyShape as never, valueShape as V) as RecordShape<K, V>;
}
export function union<T extends PrimitiveShapes[]>(shapes: T) { return new UnionShape(shapes); }
export function unionOf<T extends PrimitiveShapes[]>(...shapes: T) { return new UnionShape(shapes); }

// Modifiers
export function optional<T extends PrimitiveShapes>(shape: T) { return shape.optional(); }
export function nullable<T extends PrimitiveShapes>(shape: T) { return shape.nullable(); }
export function required<T extends PrimitiveShapes>(shape: T) {
    return shape.refine(v => v !== undefined && v !== null, 'Value is required');
}
export function partial<T extends ObjectShape<any>>(shape: T) { return shape.partial(); }

// Coercion
export const coerce = {
    string: () => new StringShape().coerce(),
    number: () => new NumberShape().coerce(),
    boolean: () => new BooleanShape().coerce(),
};

// Validation utilities
export function validate<T extends PrimitiveShapes>(value: unknown, shape: T) {
    try {
        return { success: true, data: shape.parse(value) } as const;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error))
        } as const;
    }
}

export function isValid<T>(value: unknown, shape: BaseShape<T>) {
    try {
        shape.parse(value);
        return true;
    } catch {
        return false;
    }
}

// Object utilities
export function pick<T extends ObjectShape<any>, K extends keyof InferShapeType<T>>(shape: T, keys: K[]) {
    return shape.pick(keys);
}

export function omit<T extends ObjectShape<any>, K extends keyof InferShapeType<T>>(shape: T, keys: K[]) {
    return shape.omit(keys);
}

export function merge<T extends Record<string, BaseShape<any>>, U extends Record<string, BaseShape<any>>>(shape1: ObjectShape<T>, shape2: ObjectShape<U>) {
    return shape1.merge(shape2 as never) as unknown as ObjectShape<T & U>;
}

export function extend<T extends ObjectShape<any>, U extends Record<string, PrimitiveShapes>>(shape: T, extensions: U) {
    return shape.merge(new ObjectShape(extensions) as never) as unknown as ObjectShape<TshViewer<T> & U>;
}

// Array utilities
export function nonEmptyArray<T extends BaseShape<any>>(shape: T) { return new ArrayShape(shape).nonEmpty(); }
export function uniqueArray<T extends BaseShape<any>>(shape: T) { return new ArrayShape(shape).unique(); }
export function minLength<T extends BaseShape<any>>(shape: T, min: number) { return new ArrayShape(shape).min(min); }
export function maxLength<T extends BaseShape<any>>(shape: T, max: number) { return new ArrayShape(shape).max(max); }

// String validators
export function email() { return new StringShape().email(); }
export function uuid() { return new StringShape().uuid(); }
export function url() { return new StringShape().url(); }
export function ip() { return new StringShape().ipAddress(); }
export function dateString() { return new StringShape().isoDate(); }
export function hexColor() { return new StringShape().hexColor(); }
export function creditCard() { return new StringShape().creditCard(); }
export function regex(pattern: RegExp) { return new StringShape().regex(pattern); }

// Number validators
export function int() { return new NumberShape().int(); }
export function float() { return new NumberShape(); }
export function positive() { return new NumberShape().positive(); }
export function negative() { return new NumberShape().negative(); }
export function port() { return new NumberShape().port(); }
export function latitude() { return new NumberShape().latitude(); }
export function longitude() { return new NumberShape().longitude(); }
export function percentage() { return new NumberShape().percentage(); }

// Logical operators
export function and<T extends PrimitiveShapes, U extends PrimitiveShapes>(shape1: T, shape2: U) {
    return new AnyShape<InferShapeType<T> & InferShapeType<U>>()
        .refine(v => shape1.safeParse(v).success && shape2.safeParse(v).success, 'Must satisfy both schemas');
}

export function or<T extends PrimitiveShapes, U extends PrimitiveShapes>(shape1: T, shape2: U) {
    return new UnionShape([shape1, shape2]);
}

export function not<T extends PrimitiveShapes>(shape: T) {
    return new AnyShape<unknown>().refine(v => !shape.safeParse(v).success, 'Must not match the schema');
}

// Random generators
export const random = t.random;
export const randomInt = t.randomInt;
export const randomUuid = t.randomUuid;

// Custom validators
export function custom<T>(validator: (value: unknown) => value is T, message?: string) {
    return new AnyShape<T>().refine(validator, message ?? 'Custom validation failed');
}

export function refine<T extends PrimitiveShapes>(
    shape: T,
    predicate: (value: InferShapeType<T>) => boolean,
    message: string,
    code?: string
) {
    return shape.refine(predicate, message, code);
}

// Utility functions
export const deepEqual = t.deepEqual;
export const getShapeDefault = t.getShapeDefault;
export const processShapes = t.processShapes;