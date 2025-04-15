import { ConfigShapeError, type ErrorCreator } from '../error';

export abstract class BaseShapeAbstract<T> {
    public _default?: T;
    public _prop = "_unconfigured_property";
    public _key = "_unconfigured_property";
    public _important = false;
    public _save_default = false;
    public _optional = false;
    public _nullable = false;

    public _description?: string;
    protected _operations: Array<
        | {
            type: 'transform';
            fn: (value: any) => any;
            message: string;
            code?: string;
            meta?: Record<string, unknown>
        }
        | {
            type: 'refine';
            fn: (value: any) => boolean;
            message: string;
            code?: string;
            meta?: Record<string, unknown>
        }
    > = [];

    abstract parse(value: unknown): T;

    public safeParse(value: unknown): { values: T, success: boolean, error: ConfigShapeError | undefined } {
        try {
            const result = this.parse(value);
            return {
                values: result,
                success: true,
                error: undefined
            };
        } catch (e) {
            return {
                success: false,
                values: undefined as T,
                error: e as ConfigShapeError
            }
        }
    }

    default(value: T): this {
        this._default = value;
        return this;
    }

    important(): this {
        this._important = true;
        return this;
    }

    optional():this & BaseShapeAbstract<T | undefined>  {
        this._optional = true;
        return this;
    }

    nullable():this & BaseShapeAbstract<T | null> {
        this._nullable = true;
        return this;
    }

    transform<U>(fn: (value: T) => U, {
        message = "Invalid transform",
        code = 'TRANSFORM_ERROR',
        meta = {},
    }): BaseShapeAbstract<U> {
        const newShape = this._clone();
        newShape._operations.push({
            type: 'transform',
            fn: fn as any,
            message,
            code,
            meta
        });
        return newShape as unknown as BaseShapeAbstract<U>;
    }

    refine(
        predicate: (value: T) => boolean,
        message: string,
        code = 'VALIDATION_ERROR',
        meta?: Record<string, unknown>
    ): this {
        this._operations.push({
            type: 'refine',
            fn: predicate as any,
            message,
            code,
            meta
        });
        return this;
    }

    save(): this {
        this._save_default = true;
        return this;
    }

    prop(prop: string): this {
        this._prop = prop;
        return this;
    }

    describe(description: string): this {
        this._description = description;
        return this;
    }

    protected _clone(): this {
        const clone = Object.create(Object.getPrototypeOf(this));
        Object.assign(clone, this);
        clone._operations = [...this._operations];
        return clone;
    }

    protected _applyOperations(value: any, path: string): any {
        let currentValue = value;

        for (const op of this._operations) {
            if (op.type === 'transform') {
                try {
                    currentValue = op.fn(currentValue);
                } catch (e) {
                    const err = e as Error | string;
                    throw new ConfigShapeError({
                        code: op.code || typeof err == "object" ? (err as Error).name :'TRANSFORM_ERROR',
                        path: this._prop !== '_unconfigured_property'
                            ? `${path ? `${path}.` : ''}${this._prop}`
                            : path,
                        message: op.message ?? typeof err == "string" ? err as string : err.message,
                        value: currentValue,
                        meta: {
                            ...this._getConfig(),
                            ...op.meta ?? {},
                        }
                    });
                }
            } else if (op.type === 'refine') {
                if (!op.fn(currentValue)) {
                    throw new ConfigShapeError({
                        code: op.code || 'VALIDATION_ERROR',
                        path: this._prop !== '_unconfigured_property'
                            ? `${path ? `${path}.` : ''}${this._prop}`
                            : path,
                        message: op.message,
                        value: currentValue,
                        meta: {
                            ...this._getConfig(),
                            ...op.meta ?? {},
                        }
                    });
                }
            }
        }

        return currentValue;
    }

    protected _getConfig() {
        return {
            key: this._key,
            prop: this._prop,
            default: this._default,
            description: this._description,
            optional: this._optional,
            nullable: this._nullable,
            important: this._important,
            save_default: this._save_default,
        };
    }
}