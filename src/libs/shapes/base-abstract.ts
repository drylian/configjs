import { ConfigShapeError, type ErrorCreator } from '../error';
import type { COptionsConfig, GetConfigType } from '../types';

export abstract class BaseShapeAbstract<T> {
    public _default?: T;
    public _pretransforms: any[] = [];
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
            meta?: Record<string, unknown>;
            opts?: COptionsConfig;
        }
        | {
            type: 'refine';
            fn: (value: any) => boolean;
            message: string;
            code?: string;
            meta?: Record<string, unknown>;
            opts?: COptionsConfig;
        }
    > = [];

    abstract parse(value: unknown): T;

    public safeParse(value: unknown): 
        { value: T, success: boolean, error: ConfigShapeError | undefined } {
        try {
            const result = this.parse(value);
            return {
                value: result,
                success: true,
                error: undefined
            };
        } catch (e) {
            return {
                success: false,
                value: undefined as T,
                error: e as ConfigShapeError
            };
        }
    }

    default(value: T): this {
        if (this._operations.length === 0 || this._operations.every(op => op.type !== 'transform')) {
            this._default = value;
        } else {
            this._pretransforms.push(value);
        }
        return this;
    }

    important(): this {
        this._important = true;
        return this;
    }

    optional(): this & BaseShapeAbstract<T | undefined> {
        this._optional = true;
        return this as never;
    }

    nullable(): this & BaseShapeAbstract<T | null> {
        this._nullable = true;
        return this as never;
    }

    transform<U>(
        fn: (value: T) => U,
        opts: COptionsConfig = {}
    ): BaseShapeAbstract<U> {
        const newShape = this._clone();
        
        newShape._operations.unshift({
            type: 'transform',
            fn: fn as any,
            message: opts.message ?? "Invalid transform",
            code: opts.code ?? 'TRANSFORM_ERROR',
            meta: {
                ...opts.meta,
                message:opts.message ?? "Invalid transform"
            },
            opts
        });
    
        newShape._pretransforms = [...this._pretransforms];
    
        return newShape as never;
    }

    refine(
        predicate: (value: T) => boolean,
        message: string,
        code: string = 'VALIDATION_ERROR',
        meta?: Record<string, unknown>,
        opts?: COptionsConfig
    ): this {
        this._operations.push({
            type: 'refine',
            fn: predicate as any,
            message: opts?.message ?? message,
            code: opts?.code ?? code,
            meta: opts?.meta ?? meta,
            opts
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
        clone._pretransforms = [...this._pretransforms];
        return clone;
    }

    protected _applyOperations(value: any, path: string): any {
        let currentValue = value;

        for (const op of this._operations) {
            const operationOpts = op.opts;
            
            if (op.type === 'transform') {
                try {
                    currentValue = op.fn(currentValue);
                } catch (e) {
                    const err = e as Error | string;
                    throw new ConfigShapeError({
                        code: operationOpts?.code ?? op.code ?? (typeof err == "object" ? (err as Error).name : 'TRANSFORM_ERROR'),
                        path: this._prop !== '_unconfigured_property'
                            ? `${path ? `${path}.` : ''}${this._prop}`
                            : path,
                        message: operationOpts?.message ?? op.message ?? (typeof err == "string" ? err as string : err.message),
                        value: currentValue,
                        meta: {
                            message: operationOpts?.message ?? op.message ?? (typeof err == "string" ? err as string : err.message),
                            ...this._getConfig(),
                            ...op.meta ?? {},
                            ...operationOpts?.meta ?? {}
                        }
                    });
                }
            } else if (op.type === 'refine') {
                if (!op.fn(currentValue)) {
                    throw new ConfigShapeError({
                        code: operationOpts?.code ?? op.code ?? 'VALIDATION_ERROR',
                        path: this._prop !== '_unconfigured_property'
                            ? `${path ? `${path}.` : ''}${this._prop}`
                            : path,
                        message: operationOpts?.message ?? op.message,
                        value: currentValue,
                        meta: {
                            message: operationOpts?.message ?? op.message,
                            ...this._getConfig(),
                            ...op.meta ?? {},
                            ...operationOpts?.meta ?? {}
                        }
                    });
                }
            }
        }

        return currentValue;
    }

    protected _getConfig():GetConfigType<this> {
        const config = {} as GetConfigType<this>;
        
        for (const key in this) {
            if (!this.hasOwnProperty(key)) continue;
            if (typeof this[key] === 'function' || key.startsWith('__')) continue;
            const configKey = key.startsWith('_') ? key.substring(1) : key;
            config[configKey as never] = this[key as never];
        }
        
        return config;
    }
}