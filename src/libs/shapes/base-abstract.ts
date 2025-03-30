import { ConfigShapeError, type ErrorCreator } from '../error';

export abstract class BaseShapeAbstract<T> {
    protected _default?: T;
    public _prop = "_unconfigured_property";
    public _key = "_unconfigured_property";
    protected _description?: string;
    protected _transforms: Array<(value: T) => T> = [];
    protected _refinements: Array<{
        fn: (value: T) => boolean;
        message: string;
        code?: string;
        meta?: Record<string, unknown>;
    }> = [];

    abstract parse(value: unknown): T;

    protected createError(creator: ErrorCreator, value: unknown, path = ''): never {
        const fullPath = this._prop !== '_unconfigured_property'
            ? `${path ? `${path}.` : ''}${this._prop}`
            : path;

        throw new ConfigShapeError(creator(value, fullPath));
    }

    public safeParse(value: unknown): { values: T, success: boolean, error: ConfigShapeError | undefined } {
        try {
            return {
                values: this.parse(value),
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

    prop(prop: string): this {
        this._prop = prop;
        return this;
    }

    describe(description: string): this {
        this._description = description;
        return this;
    }
}