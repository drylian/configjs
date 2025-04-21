import { BaseShape } from './base-shape';
import { type ShapeDef, type InferType, type COptionsConfig } from '../types';
import { ConfigShapeError } from '../error';
import { processShapes } from '../functions';
import { ArrayShape } from './array-shape';
import { RecordShape } from './record-shape';

type ShapeObject<T extends Record<string, ShapeDef<any>>> = {
    [K in keyof T]: InferType<T[K]>;
};

export class PartialShape<T extends BaseShape<any>> extends BaseShape<Partial<InferType<T>>> {
    public readonly _type = "object";

    constructor(private readonly _shape: T) {
        super();
    }

    parse(value: unknown, opts?: COptionsConfig): Partial<InferType<T>> {
        if (value === null || typeof value !== 'object') {
            this.createError((value: unknown, path?: string) => ({
                code: opts?.code ?? 'NOT_OBJECT',
                message: opts?.message ?? 'Expected an object',
                path: path || '',
                value,
                meta: opts?.meta
            }), value);
        }

        const result: any = {};
        const input = value as Record<string, unknown>;

        if (this._shape instanceof ObjectShape) {
            for (const key in (this._shape as any)._shape) {
                if (input[key] !== undefined) {
                    try {
                        result[key] = (this._shape as any)._shape[key].parseWithPath(
                            input[key], 
                            `${this._prop}.${key}`
                        );
                    } catch (error) {
                        if (error instanceof ConfigShapeError) {
                            throw error;
                        }
                        this.createError((value: unknown, path?: string) => ({
                            code: opts?.code ?? 'INVALID_PROPERTY',
                            message: opts?.message ?? `Invalid property "${key}"`,
                            path: path || '',
                            value,
                            meta: opts?.meta ?? { property: key }
                        }), input[key]);
                    }
                }
            }
        } else {
            throw new ConfigShapeError({
                code: 'INVALID_PARTIAL_SHAPE',
                path: this._prop,
                message: 'PartialShape can only be used with ObjectShape',
                value,
                ...opts
            });
        }

        return result;
    }
}

export class ObjectShape<T extends Record<string, ShapeDef<any>>> extends BaseShape<ShapeObject<T>> {
    public readonly _type = "object";
    private readonly _shape: T;

    constructor(_shape: T) {
        super();
        processShapes(_shape);
        this._shape = _shape;
    }

    getDefaults(): ShapeObject<T> {
        const result: any = {
            ...(this._default ?? {})
        };
        
        for (const key in this._shape) {
            const shape = this._shape[key] as BaseShape<any>;
            
            if (shape instanceof BaseShape) {
                if (shape instanceof RecordShape) {
                    result[key] = shape.getDefaults();
                } else if (shape instanceof ObjectShape) {
                    result[key] = shape.getDefaults();
                } else if (shape instanceof ArrayShape) {
                    if (shape._shape instanceof ObjectShape) {
                        result[key] = shape._default ?? [shape._shape.getDefaults()];
                    } else {
                        result[key] = shape._default;
                    }
                } else {
                    result[key] = shape._default;
                }
            } else {
                result[key] = shape;
            }
        }
        
        return result;
    }

    parse(value: unknown, opts?: COptionsConfig): ShapeObject<T> {
        if (typeof value === "undefined" && this._optional) return undefined as never;
        if (value === null && this._nullable) return null as never;    
        if (typeof value !== 'object' || value === null) {
            this.createError((value: unknown, path?: string) => ({
                code: opts?.code ?? 'NOT_OBJECT',
                message: opts?.message ?? 'Expected an object',
                path: path || '',
                value,
                meta: opts?.meta
            }), value);
        }

        const result: any = {};
        const input = value as Record<string, unknown>;

        const shapedef = this._default ?? {};
        const shapeDefs = this.getDefaults();
        const defaults = {
            ...shapeDefs,
            ...shapedef
        };
        
        for (const key in this._shape) {
            const shape = this._shape[key];
            const object_default = defaults[key];

            try {
                const value = input[key];
                if (shape?.parse) {
                    const use_default = (value == null) && (object_default !== undefined || shape._default !== undefined);
                    result[key] = shape.parse(use_default ? object_default ?? shape._default : value);
                }
                else if (value !== shape) {
                    throw new ConfigShapeError({
                        code: 'INVALID_LITERAL',
                        path: `${key}`,
                        message: `Expected ${JSON.stringify(shape)}`,
                        value,
                        ...opts
                    });
                } else {
                    result[key] = shape ?? object_default;
                }
            } catch (error) {
                if (error instanceof ConfigShapeError) {
                    throw error;
                }
                this.createError((value: unknown, path?: string) => ({
                    code: opts?.code ?? 'INVALID_PROPERTY',
                    message: opts?.message ?? `Invalid property "${key}"`,
                    path: path || '',
                    value,
                    meta: opts?.meta ?? { property: key }
                }), input[key]);
            }
        }

        return this._checkImportant(this._applyOperations(result, this._key));
    }

    partial() {
        if (!(this instanceof ObjectShape)) {
            throw new ConfigShapeError({
                code: 'INVALID_PARTIAL_CALL',
                path: (this as BaseShape<any>)._prop,
                message: 'partial() can only be called on ObjectShape instances',
                value: this
            });
        }
        return new PartialShape(this);
    }

    merge<U extends Record<string, ShapeDef<any>>>(shape: ObjectShape<U>): ObjectShape<T & U> {
        return new ObjectShape({
            ...this._shape,
            ...shape._shape
        }) as ObjectShape<T & U>;
    }

    pick<K extends keyof T>(keys: K[]): ObjectShape<Pick<T, K>> {
        const newShape = {} as Pick<T, K>;
        for (const key of keys) {
            newShape[key] = this._shape[key];
        }
        return new ObjectShape(newShape);
    }

    omit<K extends keyof T>(keys: K[]): ObjectShape<Omit<T, K>> {
        const newShape = { ...this._shape };
        for (const key of keys) {
            delete newShape[key];
        }
        return new ObjectShape(newShape as Omit<T, K>);
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

    deepPartial(): ObjectShape<{ [K in keyof T]: T[K] extends BaseShape<any> ? PartialShape<T[K]> : T[K] }> {
        const newShape: any = {};
        for (const key in this._shape) {
            const shape = this._shape[key];
            newShape[key] = (shape as any) instanceof BaseShape ? shape.partial?.() ?? shape : shape;
        }
        return new ObjectShape(newShape);
    }
}