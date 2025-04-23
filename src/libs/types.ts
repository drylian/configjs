import type { AbstractShape, BaseShape, ConfigJS, EnumShape } from "../ConfigJS";
import type { AnyShape } from "./shapes/any-shape";
import type { ArrayShape } from "./shapes/array-shape";
import type { BooleanShape } from "./shapes/boolean-shape";
import type { NumberShape } from "./shapes/number-shape";
import type { ObjectShape } from "./shapes/object-shape";
import type { RecordShape } from "./shapes/record-shape";
import type { StringShape } from "./shapes/string-shape";
import type { UnionShape } from "./shapes/union-shape";

export type ShapeViewer<T> =
  T extends null | undefined ? T :
  T extends Array<infer E> ? Array<ShapeViewer<E>> :
  T extends object ? { [K in keyof T]: ShapeViewer<T[K]> } : T;

export type ObjShape<T extends Record<string, PrimitiveShapes>> = {
  [K in keyof T]?: InferShapeType<T[K]>;
};

export type PartialObjShape<T extends Record<string, PrimitiveShapes>> = {
  [K in keyof T]?: T[K] extends PrimitiveShapes ? T[K] : never
};

export type DeepPartialObjShape<T extends Record<string, PrimitiveShapes>> = {
  [K in keyof T]?: T[K] extends Record<string, PrimitiveShapes>
  ? DeepPartialObjShape<T[K]>
  : T[K] extends PrimitiveShapes
  ? T[K]
  : never
};

export type PrimitiveShapes =
  | StringShape
  | NumberShape
  | BooleanShape
  | AnyShape<any>
  | EnumShape<any>
  | ArrayShape<any>
  | ObjectShape<any>
  | RecordShape<any, any>
  | BaseShape<any>
  | UnionShape<any>;

export type COptionsConfig = { code?: string, message?: string, path?: string, meta?: Record<string, unknown> };
export type inferType<T> = InferShapeType<T>;
export type InferShapeType<T> =
  T extends StringShape ? string :
  T extends NumberShape ? number :
  T extends BooleanShape ? boolean :
  T extends AnyShape ? any :
  T extends EnumShape<infer U> ? U :
  T extends AbstractShape<infer U> ? U :
  T extends ArrayShape<infer U> ? Array<InferShapeType<U>> :
  T extends ObjectShape<infer U> ? { [K in keyof U]: InferShapeType<U[K]> } :
  T extends RecordShape<string, infer V> ? Record<string, InferShapeType<V>> :
  T extends RecordShape<infer K, infer V> ? Record<K, InferShapeType<V>> :
  T extends UnionShape<infer U> ? InferUnionType<U> :
  T extends readonly (infer U)[] ? ReadonlyArray<InferShapeType<U>> :
  T extends (infer U)[] ? Array<InferShapeType<U>> :
  T;

export type InferUnionType<T extends PrimitiveShapes[]> =
  T extends [infer First, ...infer Rest]
  ? First extends PrimitiveShapes
  ? InferShapeType<First> | (Rest extends PrimitiveShapes[] ? InferUnionType<Rest> : never)
  : never
  : never;

/**  Config TYPES **/

export type ConfigDeepPartial<T> = {
  [K in keyof T]?: T[K] extends Function
    ? T[K]
    : T[K] extends object
      ? ConfigDeepPartial<T[K]>
      : T[K];
};
export type ConfigJSRootPaths<T> =
  T extends PrimitiveShapes
  ? never
  : T extends object
  ? {
    [K in keyof T & string]:
    T[K] extends PrimitiveShapes
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
  T extends PrimitiveShapes | AbstractShape<any>
  ? never
  : T extends object
  ? {
    [K in keyof T & string]: T[K] extends PrimitiveShapes | AbstractShape<any>
    ? K
    : `${K}.${ConfigJSPaths<T[K]>}`
  }[keyof T & string]
  : never;


export type GetValueType<T, Path extends string> =
  Path extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
  ? GetValueType<T[Key], Rest>
  : never
  : Path extends keyof T
  ? T[Path] extends PrimitiveShapes | AbstractShape<infer U>
  ? U
  : T[Path] extends Record<string, any>
  ? { [K in keyof T[Path]]: GetValueType<T[Path], K & string> }
  : never
  : never;

export type AnyConfigJSNestedShapes = {
  [key: string]: PrimitiveShapes | AbstractShape<any> | AnyConfigJSNestedShapes;
};

export type ConfigInferNestedType<T> = T extends PrimitiveShapes
  ? InferShapeType<T>
  : T extends Record<string, any>
  ? { [K in keyof T]: ConfigInferNestedType<T[K]> }
  : never;

export type If<Value extends boolean, TrueResult, FalseResult = null> = Value extends true
  ? TrueResult
  : Value extends false
  ? FalseResult
  : TrueResult | FalseResult;

export type ConfigJSResult<Async extends boolean = boolean, Shape extends unknown = PrimitiveShapes> =
  If<Async, Promise<InferShapeType<Shape>>, InferShapeType<Shape>>;

export type AnyConfigDriver<IsAsync extends boolean = boolean, DriverConfig extends object = {}> =
  If<IsAsync, AnyConfigTypedDriver<true, DriverConfig>, AnyConfigTypedDriver<false, DriverConfig>>;

export type AnyConfigJS<DriverConfig extends object = {}> =
  ConfigJS<AnyConfigDriver<boolean, DriverConfig>, Record<string, PrimitiveShapes>>;

export type AnyConfigTypedDriver<DriverAsync extends boolean, DriverConfig extends object = {}> = {
  async: DriverAsync;
  config: DriverConfig;
  supported: (new (...any: any) => BaseShape<any>)[];
  set(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>, value: InferShapeType<BaseShape<any>>):
    DriverAsync extends true ? Promise<InferShapeType<BaseShape<any>>> : InferShapeType<BaseShape<any>>;
  get(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>):
    DriverAsync extends true ? Promise<InferShapeType<BaseShape<any>>> : InferShapeType<BaseShape<any>>;
  root(this: AnyConfigJS<DriverConfig>, shape: Record<string, BaseShape<any>>):
    DriverAsync extends true ? Promise<Record<string, BaseShape<any>>> : Record<string, BaseShape<any>>;
  insert(this: AnyConfigJS<DriverConfig>, shape: Record<string, BaseShape<any>>, values: Record<string, InferShapeType<BaseShape<any>>>):
    DriverAsync extends true ? Promise<boolean> : boolean;
  del(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>):
    DriverAsync extends true ? Promise<boolean> : boolean;
  supported_check(this: AnyConfigJS<DriverConfig>, shape: BaseShape<any>):
    DriverAsync extends true ? Promise<boolean> : boolean;
  has(this: AnyConfigJS<DriverConfig>, ...shapes: BaseShape<any>[]):
    DriverAsync extends true ? Promise<boolean> : boolean;
  save(this: AnyConfigJS<DriverConfig>, shapes: BaseShape<any>[]):
    DriverAsync extends true ? Promise<boolean> : boolean;
  load(this: AnyConfigJS<DriverConfig>, shapes: BaseShape<any>[]):
    DriverAsync extends true ? Promise<boolean> : boolean;
};