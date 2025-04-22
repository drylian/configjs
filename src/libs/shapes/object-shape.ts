import { BaseShape } from './base-shape';
import { type ShapeDef, type InferType, type COptionsConfig } from '../types';
import { ConfigShapeError } from '../error';
import { deepEqual, processShapes } from '../functions';
import { RecordShape } from './record-shape';

type ShapeObject<T extends Record<string, ShapeDef<any>>> = {
    [K in keyof T]: InferType<T[K]>;
};

export class ObjectShape<T extends Record<string, ShapeDef<any>>> extends BaseShape<ShapeObject<T>> {
    public readonly _type = "object";
    private readonly _shape: T;
    private static circularCache = new WeakMap<object, any>();

    constructor(_shape: T) {
        super();
        processShapes(_shape);
        this._shape = _shape;
    }

    private copyMetadata<U extends BaseShape<any>>(newShape: U) {
        newShape._optional = this._optional;
        newShape._nullable = this._nullable;
        newShape._default = this._default;
        newShape._key = this._key;
        return newShape;
    }

    getDefaults(): ShapeObject<T> {
        const result: any = { ...(this._default ?? {}) };

        for (const key in this._shape) {
            const shape = this._shape[key] as BaseShape<any>;

            if (shape instanceof RecordShape) {
                result[key] = shape?.getDefaults();
            } else if (shape instanceof BaseShape) {
                result[key] = shape?._default;
            } else {
                result[key] = shape;
            }
        }

        return result;
    }

    parse(value: unknown, opts?: COptionsConfig): ShapeObject<T> {
        if (typeof value === "undefined") {
            if (typeof this._default !== "undefined") {
                value = { ...this.getDefaults(), ...this._default };
            } else if (this._optional) {
                return undefined as never;
            }
        }

        if (value === null && this._nullable) {
            return null as never;
        }

        if (!this.isPlainObject(value)) {
            this.createError(
                (val: unknown, path?: string) => ({
                    code: opts?.code ?? 'NOT_OBJECT',
                    message: opts?.message ?? 'Expected a plain object',
                    path: path || '',
                    value: val,
                    meta: opts?.meta
                }),
                value
            );
        }

        const input = value as Record<string, unknown>;
        const result: any = {};
        const defaults = this.getDefaults();
        const errors: ConfigShapeError[] = [];
        const keys = Object.keys(this._shape);

        if (ObjectShape.circularCache.has(input)) {
            return ObjectShape.circularCache.get(input);
        }
        ObjectShape.circularCache.set(input, result);

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!Object.prototype.hasOwnProperty.call(this._shape, key)) continue;

            const shape = this._shape[key];
            const propertyDefault = defaults[key];
            const inputValue = input[key];
            //@ts-expect-error ignore 
            const path = opts?.path ? `${opts.path}.${key}` : key;

            try {
                if (shape instanceof BaseShape) {
                    let valueToParse: unknown;
                    if (inputValue === undefined) {
                        if (propertyDefault !== undefined) {
                            valueToParse = propertyDefault;
                        } else if (shape._default !== undefined) {
                            valueToParse = shape._default;
                        } else if (shape._optional) {
                            continue; // Omit optional keys without defaults
                        } else {
                            throw new ConfigShapeError({
                                code: 'MISSING_PROPERTY',
                                path,
                                message: `Missing required property "${key}"`,
                                value: undefined,
                                ...opts
                            });
                        }
                    } else {
                        valueToParse = inputValue;
                    }

                    if (shape._nullable && valueToParse === null) {
                        result[key] = null;
                    } else {
                        //@ts-expect-error ignore 
                        result[key] = shape.parse(valueToParse, {
                            ...opts,
                            path,
                            parent: result
                        });
                    }
                } else if (!deepEqual(inputValue, shape)) {
                    throw new ConfigShapeError({
                        code: 'INVALID_LITERAL',
                        path,
                        message: `Expected ${JSON.stringify(shape)}`,
                        value: inputValue,
                        ...opts
                    });
                } else {
                    result[key] = inputValue;
                }
            } catch (error) {
                if (error instanceof ConfigShapeError) {
                    errors.push(error);
                } else {
                    errors.push(new ConfigShapeError({
                        code: 'INVALID_PROPERTY',
                        path,
                        message: `Invalid property "${key}"`,
                        value: inputValue,
                        meta: { property: key },
                        ...opts
                    }));
                }
            }
        }

        ObjectShape.circularCache.delete(input);

        if (errors.length > 0) {
            throw new AggregateError(errors, 'Multiple validation errors');
        }
        //@ts-expect-error ignore 
        return this._checkImportant(this._applyOperations(result, opts?.path));
    }

    private isPlainObject(obj: unknown): obj is Record<string, unknown> {
        return Object.prototype.toString.call(obj) === '[object Object]' &&
            Object.getPrototypeOf(obj) === Object.prototype;
    }

    /**
     * Creates a new ObjectShape with all properties made optional
     * @returns New ObjectShape instance with optional properties
     */
    partial(): ObjectShape<{ [K in keyof T]: T[K] extends BaseShape<infer U> ? BaseShape<U | undefined> : T[K] }> {
        const newShape: any = {};
        for (const key in this._shape) {
            const shape = this._shape[key] as BaseShape<any>;
            if (shape instanceof BaseShape) {
                newShape[key] = shape.optional();
            } else {
                newShape[key] = shape
            }
        }
        return this.copyMetadata(new ObjectShape(newShape));
    }

    merge<U extends Record<string, ShapeDef<any>>>(shape: ObjectShape<U>): ObjectShape<T & U> {
        //@ts-expect-error ignore diff types
        return this.copyMetadata(new ObjectShape({
            ...this._shape,
            ...shape._shape
        } as T & U));
    }

    pick<K extends keyof T>(keys: K[]): ObjectShape<Pick<T, K>> {
        const newShape = {} as Pick<T, K>;
        for (const key of keys) {
            newShape[key] = this._shape[key];
        }
        //@ts-expect-error ignore diff types 
        return this.copyMetadata(new ObjectShape(newShape));
    }

    omit<K extends keyof T>(keys: K[]): ObjectShape<Omit<T, K>> {
        const newShape = { ...this._shape };
        for (const key of keys) {
            delete newShape[key];
        }
        //@ts-expect-error ignore diff types 
        return this.copyMetadata(new ObjectShape(newShape as Omit<T, K>));
    }

    hasProperty<K extends keyof T>(key: K, opts: COptionsConfig = {}): this {
        return this.refine(
            (val) => key in val,
            opts.message ?? `Object must have property "${String(key)}"`,
            opts.code ?? 'MISSING_PROPERTY',
            opts.meta ?? { property: key }
        );
    }

    forbiddenProperty<K extends keyof T>(key: K, opts: COptionsConfig = {}): this {
        return this.refine(
            (val) => !(key in val),
            opts.message ?? `Object must not have property "${String(key)}"`,
            opts.code ?? 'FORBIDDEN_PROPERTY',
            opts.meta ?? { property: key }
        );
    }

    exactProperties(count: number, opts: COptionsConfig = {}): this {
        return this.refine(
            (val) => Object.keys(val).length === count,
            opts.message ?? `Object must have exactly ${count} properties`,
            opts.code ?? 'INVALID_PROPERTY_COUNT',
            opts.meta ?? { count }
        );
    }

    minProperties(min: number, opts: COptionsConfig = {}): this {
        return this.refine(
            (val) => Object.keys(val).length >= min,
            opts.message ?? `Object must have at least ${min} properties`,
            opts.code ?? 'TOO_FEW_PROPERTIES',
            opts.meta ?? { min }
        );
    }

    maxProperties(max: number, opts: COptionsConfig = {}): this {
        return this.refine(
            (val) => Object.keys(val).length <= max,
            opts.message ?? `Object must have at most ${max} properties`,
            opts.code ?? 'TOO_MANY_PROPERTIES',
            opts.meta ?? { max }
        );
    }

    propertyValue<K extends keyof T>(
        key: K,
        validator: (value: InferType<T[K]>) => boolean,
        opts: COptionsConfig = {}
    ): this {
        return this.refine(
            (val) => key in val && validator(val[key]),
            opts.message ?? `Property "${String(key)}" is invalid`,
            opts.code ?? 'INVALID_PROPERTY_VALUE',
            opts.meta ?? { property: key }
        );
    }

    nonEmpty(opts: COptionsConfig = {}): this {
        return this.minProperties(1, opts);
    }
}