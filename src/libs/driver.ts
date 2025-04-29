import type { InferShapeType } from "@caeljs/tsh";
import type { ConfigJS, If } from "../ConfigJS";
import type { ConfigPrimitives } from "../shapes";

export abstract class AbstractConfigJSDriver<IsAsync extends boolean, Configuration extends object> {
    public config:Configuration;
    public ins:ConfigJS<typeof AbstractConfigJSDriver<any,any>, any>;
    public abstract readonly async:boolean;
    public supported:ConfigPrimitives[] = [];

    public check(
        shape: ConfigPrimitives,
    ): boolean {
        return this.supported.some((supported) => shape instanceof (supported as never));
    };

    constructor(instance: ConfigJS<typeof AbstractConfigJSDriver<any,any>, any>, config: Configuration) {
        this.ins = instance;
        this.config = config;
    }
    abstract set(
        shape: ConfigPrimitives,
        value: InferShapeType<ConfigPrimitives>,
    ): If<
        IsAsync,
        Promise<InferShapeType<ConfigPrimitives>>,
        InferShapeType<ConfigPrimitives>
    >;

    abstract get(
        shape: ConfigPrimitives,
    ): If<
        IsAsync,
        Promise<InferShapeType<ConfigPrimitives>>,
        InferShapeType<ConfigPrimitives>
    >;

    abstract root(
        shape: Record<string, ConfigPrimitives>,
    ): If<
        IsAsync,
        Promise<Record<string, ConfigPrimitives>>,
        Record<string, ConfigPrimitives>
    >;

    abstract insert(
        shape: Record<string, ConfigPrimitives>,
        values: Record<string, InferShapeType<ConfigPrimitives>>,
    ): If<IsAsync, Promise<boolean>, boolean>;

    abstract del(
        shape: ConfigPrimitives,
    ): If<IsAsync, Promise<boolean>, boolean>;

    abstract has(
        ...shapes: ConfigPrimitives[]
    ): If<IsAsync, Promise<boolean>, boolean>;

    abstract save(
        shapes: ConfigPrimitives[],
    ): If<IsAsync, Promise<boolean>, boolean>;

    abstract load(
        shapes: ConfigPrimitives[],
    ): If<IsAsync, Promise<boolean>, boolean>;
}