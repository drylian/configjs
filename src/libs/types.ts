/** Config TYPES **/
import type { ConfigJS } from "../ConfigJS";
import type { infer as InferType, AbstractShape as AAbstractShape } from "@caeljs/tsh";
import type { AbstractShape } from "../shapes";

type If<Cond extends boolean, Then, Else> = Cond extends true ? Then : Else;

export type ConfigJSOptions = {
  [key: string]: AbstractShape<any> | ConfigJSOptions;
};

export type ConfigJSResolvePath<T, P extends string> = 
  P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? ConfigJSResolvePath<T[K], Rest>
      : never
    : P extends keyof T
      ? T[P]
      : never;
export type ConfigJSResource<T, P extends string> = InferType<ConfigJSResolvePath<T, P>>
export type ConfigJSRoots<T> = T extends AbstractShape<any>
  ? never
  : T extends object
    ? {
        [K in keyof T & string]: T[K] extends
          | AbstractShape<any>
          | AbstractShape<any>
          ? never
          : T[K] extends object
            ? `${K}` | `${K}.${ConfigJSRoots<T[K]>}`
            : never;
      }[keyof T & string]
    : never;

export type ConfigJSPaths<T> = T extends AbstractShape<any>
  ? never
  : T extends object
    ? {
        [K in keyof T & string]: T[K] extends
          | AbstractShape<any>
          ? K
          : `${K}.${ConfigJSPaths<T[K]>}`;
      }[keyof T & string]
    : never;

export type ConfigJSResolver<Async extends boolean, Result> = If<
  Async,
  Promise<Result>,
  Result
>;

export type ConfigJSPartials<T> = {
  [K in keyof T]?: T[K] extends object
    ? T[K] extends Function
      ? T[K]
      : ConfigJSPartials<T[K]>
    : T[K];
};

export type AnyConfigTypedDriver<
  DriverAsync extends boolean,
  DriverConfig extends object = {},
> = {
  async: DriverAsync;
  config: DriverConfig;
  supported: (new (...any: any) => AbstractShape<any> | AAbstractShape<any>)[];

  set(
    this: AnyConfigJS<DriverConfig>,
    shape: AbstractShape<any>,
    value: InferType<AbstractShape<any>>,
  ): If<
    DriverAsync,
    Promise<InferType<AbstractShape<any>>>,
    InferType<AbstractShape<any>>
  >;

  get(
    this: AnyConfigJS<DriverConfig>,
    shape: AbstractShape<any>,
  ): If<
    DriverAsync,
    Promise<InferType<AbstractShape<any>>>,
    InferType<AbstractShape<any>>
  >;

  root(
    this: AnyConfigJS<DriverConfig>,
    shape: Record<string, AbstractShape<any>>,
  ): If<
    DriverAsync,
    Promise<Record<string, AbstractShape<any>>>,
    Record<string, AbstractShape<any>>
  >;

  insert(
    this: AnyConfigJS<DriverConfig>,
    shape: Record<string, AbstractShape<any>>,
    values: Record<string, InferType<AbstractShape<any>>>,
  ): If<DriverAsync, Promise<boolean>, boolean>;

  del(
    this: AnyConfigJS<DriverConfig>,
    shape: AbstractShape<any>,
  ): If<DriverAsync, Promise<boolean>, boolean>;

  supported_check(
    this: AnyConfigJS<DriverConfig>,
    shape: AbstractShape<any>,
  ): If<DriverAsync, Promise<boolean>, boolean>;

  has(
    this: AnyConfigJS<DriverConfig>,
    ...shapes: AbstractShape<any>[]
  ): If<DriverAsync, Promise<boolean>, boolean>;

  save(
    this: AnyConfigJS<DriverConfig>,
    shapes: AbstractShape<any>[],
  ): If<DriverAsync, Promise<boolean>, boolean>;

  load(
    this: AnyConfigJS<DriverConfig>,
    shapes: AbstractShape<any>[],
  ): If<DriverAsync, Promise<boolean>, boolean>;
};

export type AnyConfigDriver<
  IsAsync extends boolean = boolean,
  DriverConfig extends object = {},
> = If<
  IsAsync,
  AnyConfigTypedDriver<true, DriverConfig>,
  AnyConfigTypedDriver<false, DriverConfig>
>;

export type AnyConfigJS<DriverConfig extends object = {}> = ConfigJS<
  AnyConfigDriver<boolean, DriverConfig>,
  Record<string, AbstractShape<any>>
>;
