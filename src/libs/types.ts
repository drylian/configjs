import type { BaseShapeAbstract, ConfigJS, EnumShape } from "../ConfigJS";
import type { AnyShape } from "./shapes/any-shape";
import type { ArrayShape } from "./shapes/array-shape";
import type { BaseShape } from "./shapes/base-shape";
import type { BooleanShape } from "./shapes/boolean-shape";
import type { NumberShape } from "./shapes/number-shape";
import type { ObjectShape } from "./shapes/object-shape";
import type { RecordShape } from "./shapes/record-shape";
import type { StringShape } from "./shapes/string-shape";
import type { UnionShape } from "./shapes/union-shape";

export type COptionsConfig = { code?: string, message?: string, meta?: Record<string, unknown> };
export type ConfigJSRootPaths<T> =
  T extends BaseShape<any>
  ? never
  : T extends object
  ? {
    [K in keyof T & string]:
    T[K] extends BaseShape<any>
    ? never
    : T[K] extends object
    ? `${K}` | `${K}.${ConfigJSRootPaths<T[K]>}`
    : never
  }[keyof T & string]
  : never;

export type GetConfigType<T> = {
  [K in keyof T as
  K extends `_${infer P}`
  ? T[K] extends (...args: any[]) => any
  ? never
  : P
  : K extends string
  ? T[K] extends (...args: any[]) => any
  ? never
  : K
  : never
  ]: T[K]
};

export type RecursiveConfigJSResult<T, Path extends string> =
  Path extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
  ? RecursiveConfigJSResult<T[Key], Rest>
  : never
  : Path extends keyof T
  ? T[Path] extends Record<string, any>
  ? { [K in keyof T[Path]]: GetValueType<T[Path], K & string> }
  : never
  : never;

export type ConfigJSPaths<T> =
  T extends BaseShape<any> | BaseShapeAbstract<any>
  ? never
  : T extends object
  ? {
    [K in keyof T & string]: T[K] extends BaseShape<any> | BaseShapeAbstract<any>
    ? K
    : `${K}.${ConfigJSPaths<T[K]>}`
  }[keyof T & string]
  : never;
  
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Function
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type GetValueType<T, Path extends string> =
  Path extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
  ? GetValueType<T[Key], Rest>
  : never
  : Path extends keyof T
  ? T[Path] extends BaseShape<infer U> | BaseShapeAbstract<infer U>
  ? U
  : T[Path] extends Record<string, any>
  ? { [K in keyof T[Path]]: GetValueType<T[Path], K & string> }
  : never
  : never;

export type AnyConfigJSNestedShapes = {
  [key: string]: BaseShape<any> | BaseShapeAbstract<any> | AnyConfigJSNestedShapes;
};

export type ConfigInferNestedType<T> = T extends BaseShape<infer U>
  ? U
  : T extends Record<string, any>
  ? { [K in keyof T]: ConfigInferNestedType<T[K]> }
  : never;

export type ShapeDef<T> = BaseShape<T> | T;

export type InferType<T> =
  // Tipos primitivos diretos
  T extends StringShape ? string :
  T extends AnyShape ? any :
  T extends NumberShape ? number :
  T extends BooleanShape ? boolean :
  T extends EnumShape<infer U> ? U :

  // Shapes especiais
  T extends UnionShape<infer U> ? InferUnionType<U> :

  // Arrays
  T extends ArrayShape<infer U> ? Array<InferType<U>> :

  // Objetos
  T extends ObjectShape<infer U> ? { [K in keyof U]: InferType<U[K]> } :
  T extends RecordShape<string, infer V> ? Record<string, InferType<V>> :
  T extends RecordShape<infer K, infer V> ? Record<K, InferType<V>> :

  // Tipos diretos (para arrays primitivos)
  T extends readonly (infer U)[] ? ReadonlyArray<InferType<U>> :
  T extends (infer U)[] ? Array<InferType<U>> :

  // Fallbacks finais
  T extends BaseShape<infer U> ? U :
  T;

type InferUnionType<T extends BaseShape<any>[]> =
  T extends [infer First, ...infer Rest]
    ? First extends BaseShape<any>
      ? InferType<First> | (Rest extends BaseShape<any>[] ? InferUnionType<Rest> : never)
      : never
    : never;

export type If<Value extends boolean, TrueResult, FalseResult = null> = Value extends true
  ? TrueResult
  : Value extends false
  ? FalseResult
  : TrueResult | FalseResult;
export type ConfigJSResult<Async extends boolean = boolean, Shape extends unknown = BaseShape<any>> = If<Async, Promise<InferType<Shape>>, InferType<Shape>>
export type AnyConfigDriver<IsAsync extends boolean = boolean, DriverConfig extends object = {}> = If<IsAsync, AnyConfigTypedDriver<true, DriverConfig>, AnyConfigTypedDriver<false, DriverConfig>>
export type AnyConfigJS<DriverConfig extends object = {}> = ConfigJS<AnyConfigDriver<boolean, DriverConfig>, Record<string, BaseShape<any>>>
export type AnyConfigTypedDriver<DriverAsync extends boolean, DriverConfig extends object = {}> = {
  async: DriverAsync;
  config: DriverConfig;
  supported: (new (...any: any) => BaseShape<any>)[];
  set(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>, value: InferType<BaseShape<any>>): DriverAsync extends true ? Promise<InferType<BaseShape<any>>> : InferType<BaseShape<any>>;
  get(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>): DriverAsync extends true ? Promise<InferType<BaseShape<any>>> : InferType<BaseShape<any>>
  root(this: AnyConfigJS<DriverConfig>, shape: Record<string, BaseShape<any>>): DriverAsync extends true ? Promise<Record<string, BaseShape<any>>> : Record<string, BaseShape<any>>
  insert(this: AnyConfigJS<DriverConfig>, shape: Record<string, BaseShape<any>>, values: Record<string, InferType<BaseShape<any>>>): DriverAsync extends true ? Promise<boolean> : boolean
  del(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>): DriverAsync extends true ? Promise<boolean> : boolean;
  supported_check(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>): DriverAsync extends true ? Promise<boolean> : boolean;
  has(this: AnyConfigJS<DriverConfig>, ...shapes: BaseShape<any>[]): DriverAsync extends true ? Promise<boolean> : boolean;
  save(this: AnyConfigJS<DriverConfig>, shapes: BaseShape<any>[]): DriverAsync extends true ? Promise<boolean> : boolean;
  load(this: AnyConfigJS<DriverConfig>, shapes: BaseShape<any>[]): DriverAsync extends true ? Promise<boolean> : boolean;
};
export type ExpandRecursively<T> = T extends Date | RegExp | bigint | symbol | null | undefined | Function ? T : T extends Map<infer K, infer V> ? Map<ExpandRecursively<K>, ExpandRecursively<V>> : T extends WeakMap<infer K, infer V> ? WeakMap<ExpandRecursively<K>, ExpandRecursively<V>> : T extends Set<infer U> ? Set<ExpandRecursively<U>> : T extends WeakSet<infer U> ? WeakSet<ExpandRecursively<U>> : T extends Array<infer E> ? Array<ExpandRecursively<E>> : T extends object ? { [K in keyof T]: ExpandRecursively<T[K]> } : T;