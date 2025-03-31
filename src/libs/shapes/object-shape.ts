import { BaseShape } from './base-shape';
import { type ShapeDef, type InferType } from '../types';
import { ConfigShapeError, type ErrorCreator } from '../error';

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
    NOT_OBJECT: createObjectError({
        code: 'NOT_OBJECT',
        message: 'Expected an object'
    }),
    INVALID_PROPERTY: (key: string) => createObjectError({
        code: 'INVALID_PROPERTY',
        message: `Invalid property "${key}"`,
        meta: { property: key }
    })
};

export class PartialShape<T extends BaseShape<any>> extends BaseShape<Partial<InferType<T>>> {
    public readonly _type = "object";

    constructor(private readonly _shape: T) {
        super();
    }

    parse(value: unknown): Partial<InferType<T>> {

        if (value === null || typeof value !== 'object') {
            this.createError(OBJECT_ERRORS.NOT_OBJECT, value);
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
                        this.createError(OBJECT_ERRORS.INVALID_PROPERTY(key), input[key]);
                    }
                }
            }
        } else {
            throw new ConfigShapeError({
                code: 'INVALID_PARTIAL_SHAPE',
                path: this._prop,
                message: 'PartialShape can only be used with ObjectShape',
                value
            });
        }

        return result;
    }
}

export class ObjectShape<T extends Record<string, ShapeDef<any>>> extends BaseShape<ShapeObject<T>> {
    public readonly _type = "object";

    constructor(private readonly _shape: T) {
        super();
    }

    parse(value: unknown): ShapeObject<T> {
        if (typeof value !== 'object' || value === null) {
            this.createError(OBJECT_ERRORS.NOT_OBJECT, value);
        }

        const result: any = {};
        const input = value as Record<string, unknown>;

        for (const key in this._shape) {
            const shape = this._shape[key];
            const object_default = this._default?.[key];

            try {
                const value = input[key];
                if (shape?.parse) {
                    const use_default = (value == null) && (object_default !== undefined || shape._default !== undefined);
                    result[key] = shape.parse(use_default ? object_default ?? shape._default : value);
                }
                else if (value !== shape) {
                    throw new ConfigShapeError({
                        code: 'INVALID_LITERAL',
                        path: `${this._prop}.${key}`,
                        message: `Expected ${JSON.stringify(shape)}`,
                        value
                    });
                } else {
                    result[key] = shape ?? object_default;
                }
            } catch (error) {
                if (error instanceof ConfigShapeError) {
                    throw error;
                }
                this.createError(OBJECT_ERRORS.INVALID_PROPERTY(key), input[key]);
            }
        }

        return this._checkImportant(result);
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
}