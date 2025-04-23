import { BaseShape } from './base-shape';
import { type InferShapeType, type COptionsConfig, type PrimitiveShapes, type ShapeViewer, type ObjShape, type DeepPartialObjShape, type PartialObjShape } from '../types';
import { ConfigShapeError } from '../error';
import { deepEqual, processShapes } from '../functions';
import { RecordShape } from './record-shape';

export class ObjectShape<T extends Record<string, PrimitiveShapes>> extends BaseShape<ObjShape<T>> {
    public readonly _type = 'object';
    public _minProperties?: number;
    public _maxProperties?: number;
    public _partial? = false;
    private readonly _shape: T;

    constructor(_shape: T) {
        super();
        processShapes(_shape);
        this._shape = _shape;
    }

    private copyMetadata<U extends BaseShape<any>>(newShape: U): U {
        const exclude = ['_type', '_shape'];

        Object.keys(this).forEach((key) => {
            if (
                !exclude.includes(key) &&
                key in newShape
            ) {
                const value = this[key as keyof this];

                if (Array.isArray(value)) {
                    (newShape as any)[key] = [...value];
                } else if (typeof value === 'object' && value !== null) {
                    (newShape as any)[key] = { ...value };
                } else if (typeof value !== "function") {
                    (newShape as any)[key] = value;
                }
            }
        });

        return newShape;
    }

    getDefaults(): ShapeViewer<ObjShape<T>> {
        const entries = Object.entries(this._shape).map(([key, shape]) => {
            if (shape instanceof ObjectShape) {
                return [key, shape.getDefaults()];
            } else if (shape instanceof RecordShape) {
                return [key, shape.getDefaults()];
            } else if (shape instanceof BaseShape) {
                return [key, shape._default];
            }
            return [key, shape];
        });

        return Object.fromEntries(entries);
    }

    //@ts-expect-error ignore
    parse(value: unknown, opts?: COptionsConfig): ShapeViewer<ObjShape<T>> {
        const path = opts?.path ?? '';

        // Handle undefined
        if (typeof value === "undefined") {
            if (this._default !== undefined) {
                const shape_defaults = this.getDefaults();
                const object_defaults = this._default;
                return { ...shape_defaults, ...object_defaults };
            } else if (this._optional) {
                return undefined as never;
            }
        }

        // Handle null
        if (value === null) {
            if (this._nullable) return null as never;

            if (this._default !== undefined) {
                const shape_defaults = this.getDefaults();
                const object_defaults = this._default;
                return { ...shape_defaults, ...object_defaults };
            } else {
                this.createError(() => ({
                    code: 'NOT_OBJECT',
                    message: 'Expected object',
                    path,
                    value,
                    key:this._key,
                    meta: opts?.meta
                }), value);
            }
        }

        // Handle non-object
        if (!this.isPlainObject(value)) {
            this.createError(() => ({
                code: 'NOT_OBJECT',
                message: 'Expected object',
                path,
                value,
                key:this._key,
                meta: opts?.meta
            }), value);
        }

        const input = value as Record<string, unknown>;
        const shape_defaults = this.getDefaults();
        const object_defaults = this._default;
        const merged = { ...shape_defaults, ...object_defaults, ...input };

        const entries: [string, unknown][] = [];
        const errors: ConfigShapeError[] = [];

        const cached = (opts?.meta?.cached ?? new WeakMap<object, any>()) as WeakMap<object, any>;
        if (cached.has(merged)) {
            return cached.get(merged);
        }
        cached.set(merged, Object.fromEntries(entries));

        for (const [key, shape] of Object.entries(this._shape)) {
            const currentPath = path ? `${path}.${key}` : key;

            if (this._partial && !(key in merged)) {
                continue;
            }

            if (shape instanceof ObjectShape && typeof value == "object" && !(key in value)) continue;

            const inputVal = merged[key];

            try {
                if (shape instanceof BaseShape) {
                    let resolvedVal = inputVal;

                    // Handle undefined values
                    if (resolvedVal === undefined) {
                        if (shape._default !== undefined) {
                            resolvedVal = shape._default;
                        } else if (shape._optional || this._partial) {
                            continue;
                        } else {
                            throw new ConfigShapeError({
                                code: 'MISSING_PROPERTY',
                                message: `Missing required property "${key}"`,
                                path: currentPath,
                                value: undefined,
                                key,
                                ...opts
                            });
                        }
                    }

                    // Handle null values
                    if (resolvedVal === null) {
                        if (shape._nullable) {
                            entries.push([key, null]);
                        } else {
                            throw new ConfigShapeError({
                                code: 'NOT_NULLABLE',
                                message: `Property "${key}" is not nullable`,
                                path: currentPath,
                                value: null,
                                key,
                                ...opts
                            });
                        }
                        continue;
                    }

                    const parsedValue = shape.parse(resolvedVal, {
                        ...opts,
                        path: currentPath,
                        meta: {
                            ...opts?.meta,
                            cached
                        },
                        //@ts-expect-error ignore multiply generic types
                        parent: Object.fromEntries(entries)
                    });

                    if (this._partial && !Object.keys(parsedValue).length && !value && shape._optional) {
                        continue;
                    }

                    entries.push([key, parsedValue]);
                } else {
                    if (!deepEqual(inputVal, shape)) {
                        throw new ConfigShapeError({
                            code: 'INVALID_LITERAL',
                            message: `Expected literal value: ${JSON.stringify(shape)}`,
                            path: currentPath,
                            value: inputVal,
                            key,
                            meta: {
                                expected:JSON.stringify(shape)
                            },
                            ...opts
                        });
                    }
                    entries.push([key, inputVal]);
                }
            } catch (err) {
                if (err instanceof ConfigShapeError) {
                    errors.push(err);
                } else {
                    errors.push(new ConfigShapeError({
                        code: 'INVALID_PROPERTY',
                        message: `Invalid property "${key}"`,
                        path: currentPath,
                        value: inputVal,
                        key,
                        ...opts
                    }));
                }
            }
        }

        cached.delete(merged);

        const result = Object.fromEntries(entries);

        const keys = Object.keys(result);

        if (this._minProperties !== undefined && keys.length < this._minProperties) {
            throw new ConfigShapeError({
                code: 'TOO_FEW_PROPERTIES',
                message: `Object must have at least ${this._minProperties} properties`,
                path,
                value,
                key:this._key,
                meta: { min: this._minProperties }
            });
        }

        if (this._maxProperties !== undefined && keys.length > this._maxProperties) {
            throw new ConfigShapeError({
                code: 'TOO_MANY_PROPERTIES',
                message: `Object must have at most ${this._maxProperties} properties`,
                path,
                value,
                key:this._key,
                meta: { max: this._maxProperties }
            });
        }

        if (errors.length > 0) {
            if (errors.length === 1) {
                throw errors[0];
            } else {
                throw new AggregateError(errors, 'Multiple validation errors');
            }
        }

        return this._checkImportant(this._applyOperations(result, path)) as never;
    }


    private isPlainObject(obj: unknown): obj is Record<string, unknown> {
        return Object.prototype.toString.call(obj) === '[object Object]' &&
            Object.getPrototypeOf(obj) === Object.prototype;
    }

    //@ts-expect-error ginore
    partial(): ObjectShape<PartialObjShape<T>> {
        this._partial = true;
        const extended = Object.fromEntries(
            Object.entries(this._shape).map(([key, shape]) => {
                if (shape instanceof BaseShape) {
                    return [key, shape.optional()];
                }
                return [key, shape];
            })
        );
        //@ts-expect-error ignore multiply generic types
        return this.copyMetadata(new ObjectShape(extended));
    }

    //@ts-expect-error ginore
    deepPartial(): ObjectShape<DeepPartialObjShape<T>> {
        const extended = Object.fromEntries(
            Object.entries(this._shape).map(([key, shape]) => {
                if (shape instanceof ObjectShape) {
                    return [key, shape.partial()];
                } else if (shape instanceof BaseShape) {
                    return [key, shape.optional()];
                }
                return [key, shape];
            })
        );

        //@ts-expect-error recursive types
        return this.copyMetadata(new ObjectShape(extended));
    }

    merge<U extends Record<string, PrimitiveShapes>>(shape: ObjectShape<U>): ObjectShape<T & U> {
        return this.copyMetadata(new ObjectShape({
            ...this._shape,
            ...shape._shape
        } as T & U));
    }

    pick<K extends keyof T>(keys: K[]): ObjectShape<Pick<T, K>> {
        const newShape = Object.fromEntries(
            keys.map(key => [key, this._shape[key]])
        ) as Pick<T, K>;
        return this.copyMetadata(new ObjectShape(newShape));
    }

    omit<K extends keyof T>(keys: K[]): ObjectShape<Omit<T, K>> {
        const newShape = { ...this._shape };
        for (const key of keys) {
            delete newShape[key];
        }
        //@ts-expect-error recursive types
        return this.copyMetadata(new ObjectShape(newShape));
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

    minProperties(min: number): this {
        this._minProperties = min;
        this.partial();
        return this;
    }

    maxProperties(max: number): this {
        this._maxProperties = max;
        this.partial();
        return this;
    }

    propertyValue<K extends keyof T>(
        key: K,
        validator: (value: InferShapeType<T[K]>) => boolean,
        opts: COptionsConfig = {}
    ): this {
        return this.refine(
            (val) => key in val && validator(val[key] as never),
            opts.message ?? `Property "${String(key)}" is invalid`,
            opts.code ?? 'INVALID_PROPERTY_VALUE',
            opts.meta ?? { property: key }
        );
    }

    nonEmpty(): this {
        return this.minProperties(1);
    }
}