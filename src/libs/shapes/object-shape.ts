import { BaseShape } from './base-shape';
import { type ShapeDef, type InferType, type COptionsConfig } from '../types';
import { ConfigShapeError, type ErrorCreator } from '../error';
import { processShapes } from '../functions';
import { ArrayShape } from './array-shape';
import { RecordShape } from './record-shape';

type ShapeObject<T extends Record<string, ShapeDef<any>>> = {
    [K in keyof T]: InferType<T[K]>;
};

const createObjectError = (options: {
    code: string;
    message: string;
    meta?: Record<string, unknown>;
}): ErrorCreator => {
    return (value: unknown, path?: string) => ({
        ...options,
        path: path || '',
        value,
        meta: options.meta
    });
};

const OBJECT_ERRORS = {
    NOT_OBJECT: (opts?: COptionsConfig) => createObjectError({
        code: opts?.code ?? 'NOT_OBJECT',
        message: opts?.message ?? 'Expected an object',
        meta: opts?.meta
    }),
    INVALID_PROPERTY: (key: string, opts?: COptionsConfig) => createObjectError({
        code: opts?.code ?? 'INVALID_PROPERTY',
        message: opts?.message ?? `Invalid property "${key}"`,
        meta: opts?.meta ?? { property: key }
    })
};

export class PartialShape<T extends BaseShape<any>> extends BaseShape<Partial<InferType<T>>> {
    public readonly _type = "object";

    constructor(private readonly _shape: T) {
        super();
    }

    parse(value: unknown, opts?: COptionsConfig): Partial<InferType<T>> {
        if (value === null || typeof value !== 'object') {
            this.createError(OBJECT_ERRORS.NOT_OBJECT(opts), value);
        }

        const result: any = {};
        const input = value as Record<string, unknown>;

        if (this._shape instanceof ObjectShape) {
            //@ts-expect-error
            for (const key in this._shape._shape) {
                if (input[key] !== undefined) {
                    try {
                        //@ts-expect-error
                        result[key] = this._shape._shape[key].parseWithPath(input[key], `${this._prop}.${key}`);
                    } catch (error) {
                        if (error instanceof ConfigShapeError) {
                            throw error;
                        }
                        this.createError(OBJECT_ERRORS.INVALID_PROPERTY(key, opts), input[key]);
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
            // Tratamento para RecordShape
            if (shape instanceof RecordShape) {
              result[key] = shape.getDefaults();
            }
            // Tratamento para ObjectShape
            else if (shape instanceof ObjectShape) {
              result[key] = shape.getDefaults();
            } 
            // Tratamento para ArrayShape
            else if (shape instanceof ArrayShape) {
              if (shape._shape instanceof ObjectShape) {
                result[key] = shape._default ?? [shape._shape.getDefaults()];
              } else if (shape._shape instanceof BaseShape) {
                result[key] = shape._default;
              } else {
                result[key] = shape._default;
              }
            }
            // Caso padrão para outros shapes
            else {
              result[key] = shape._default;
            }
          } 
          // Para literais simples (não são instâncias de BaseShape)
          else {
            result[key] = shape;
          }
        }
        
        return result;
    }
    

    parse(value: unknown, opts?: COptionsConfig): ShapeObject<T> {
        if (typeof value === "undefined" && this._optional) return undefined as never;
        if (value === null && this._nullable) return null as never;    
        if (typeof value !== 'object' || value === null) {
            this.createError(OBJECT_ERRORS.NOT_OBJECT(opts), value);
        }

        const result: any = {};
        const input = value as Record<string, unknown>;

        const shapedef = this._default ?? {};
        const shapeDefs = this.getDefaults();
        const defaults = {
            ...shapeDefs,
            ...shapedef
        }
        
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
                this.createError(OBJECT_ERRORS.INVALID_PROPERTY(key, opts), input[key]);
            }
        }

        return this._checkImportant(this._applyOperations(result, this._key));
    }

    partial(): PartialShape<this> {
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
}