import type { ConfigJS } from "../ConfigJS";
import type { ArrayShape } from "./shapes/array-shape";
import type { BaseShape } from "./shapes/base-shape";
import type { BooleanShape } from "./shapes/boolean-shape";
import type { NullableShape } from "./shapes/nullable-shape";
import type { NumberShape } from "./shapes/number-shape";
import type { ObjectShape, PartialShape } from "./shapes/object-shape";
import type { OptionalShape } from "./shapes/optional-shape";
import type { RecordShape } from "./shapes/record-shape";
import type { StringShape } from "./shapes/string-shape";

export type ConfigJSPaths<T> = T extends BaseShape<any>
  ? never
  : T extends object
  ? {
    [K in keyof T & string]: T[K] extends BaseShape<any>
    ? K
    : `${K}.${ConfigJSPaths<T[K]>}`
  }[keyof T & string]
  : never;

export type GetValueType<T, Path extends string> = Path extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
  ? GetValueType<T[Key], Rest>
  : never
  : Path extends keyof T
  ? T[Path] extends BaseShape<infer U> ? U : never
  : never;

export type AnyConfigJSNestedShapes = {
  [key: string]: BaseShape<any> | AnyConfigJSNestedShapes;
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
  T extends NumberShape ? number :
  T extends BooleanShape ? boolean :

  // Shapes especiais
  T extends OptionalShape<infer U> ? InferType<U> | undefined :
  T extends NullableShape<infer U> ? InferType<U> | null :
  T extends PartialShape<infer U> ? Partial<InferType<U>> :

  // Arrays
  T extends ArrayShape<infer U> ? Array<InferType<U>> :

  // Objetos
  T extends ObjectShape<infer U> ? { [K in keyof U]: InferType<U[K]> } :
  T extends { [key: string]: ShapeDef<any> } ? { [K in keyof T]: InferType<T[K]> } :
  T extends RecordShape<infer K, infer V> ? Record<K, InferType<V>> :

  // Fallback para BaseShape
  T extends BaseShape<infer U> ? InferType<U> :

  // Tipos literais
  T;
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
  del(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>): DriverAsync extends true ? Promise<boolean> : boolean;
  supported_check(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>): DriverAsync extends true ? Promise<boolean> : boolean;
  has(this: AnyConfigJS<DriverConfig>, ...shapes: BaseShape<any>[]): DriverAsync extends true ? Promise<boolean> : boolean;
  save(this: AnyConfigJS<DriverConfig>, shapes: BaseShape<any>[]): DriverAsync extends true ? Promise<boolean> : boolean;
  load(this: AnyConfigJS<DriverConfig>, shapes: BaseShape<any>[]): DriverAsync extends true ? Promise<boolean> : boolean;
};