import { StringShape } from './shapes/string-shape';
import { NumberShape } from './shapes/number-shape';
import { BooleanShape } from './shapes/boolean-shape';
import { ObjectShape } from './shapes/object-shape';
import { ArrayShape } from './shapes/array-shape';
import { RecordShape } from './shapes/record-shape';
import { EnumShape } from './shapes/enum-shape';
import { AnyShape } from './shapes/any-shape';
import { UnionShape } from './shapes/union-shape';
import type { BaseShape } from './shapes/base-shape';
import type { InferType } from "./types"
//@ts-expect-error typed declaration diff
declare function Enum<const T extends readonly (string | number | boolean)[]>(
  keys: T
): EnumShape<T[number]>;

//@ts-expect-error typed declaration diff
declare function Enum<const T extends Record<string, string | number | boolean>>(
  enumObj: T
): EnumShape<T[keyof T]>;

function Enum<T extends object | readonly (string | number)[]>(arg: T) {
  if (Array.isArray(arg)) {
    return new EnumShape(arg);
  } else {
    const values = Object.values(arg)
      .filter((v): v is T[keyof T] => typeof v === 'string' || typeof v === 'number');
    return new EnumShape(values as never);
  }
}

export const c = {
  // =====================
  // BASIC TYPE SHAPES
  // =====================
  string: () => new StringShape(),
  number: () => new NumberShape(),
  boolean: () => new BooleanShape(),
  any: () => new AnyShape(),

  object: <T extends Record<string, any>>(shape: T) => new ObjectShape(shape),
  array: <T extends BaseShape<any>>(shape: T) => new ArrayShape(shape),
  record: <K extends string | number | symbol, V>(
    keyShape: BaseShape<K>,
    valueShape: V
  ) => new RecordShape(keyShape, valueShape as BaseShape<any>),
  enum: Enum,
  union: <T extends BaseShape<any>[]>(shapes: T) => new UnionShape(shapes),
  unionOf: <T extends BaseShape<any>[]>(...shapes: T) => new UnionShape(shapes),

  // =====================
  // TYPE MODIFIERS
  // =====================
  optional: <T extends BaseShape<any>>(shape: T) => shape.optional(),
  nullable: <T extends BaseShape<any>>(shape: T) => shape.nullable(),
  required: <T extends BaseShape<any>>(shape: T) => shape.refine(
    v => v !== undefined && v !== null, 
    'Value is required'
  ),
  partial: <T extends ObjectShape<any>>(shape: T) => shape.partial(),

  // =====================
  // COERCION
  // =====================
  coerce: {
    string: () => new StringShape().coerce(),
    number: () => new NumberShape().coerce(),
    boolean: () => new BooleanShape().coerce(),
    date: () => new StringShape().coerce().isoDate(),
  },

  // =====================
  // VALIDATION UTILITIES
  // =====================
  validate: <T>(value: unknown, shape: BaseShape<T>) => {
    try {
      return { success: true, data: shape.parse(value) } as const;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error)) 
      } as const;
    }
  },
  isValid: <T>(value: unknown, shape: BaseShape<T>) => {
    try {
      shape.parse(value);
      return true;
    } catch {
      return false;
    }
  },

  // =====================
  // OBJECT UTILITIES
  // =====================
  pick: <T extends ObjectShape<any>, K extends keyof InferType<T>>(shape: T, keys: K[]) =>
    shape.pick(keys),
  omit: <T extends ObjectShape<any>, K extends keyof InferType<T>>(shape: T, keys: K[]) =>
    shape.omit(keys),
  merge: <T extends ObjectShape<any>, U extends ObjectShape<any>>(shape1: T, shape2: U) =>
    shape1.merge(shape2),
  extend: <T extends ObjectShape<any>, U extends Record<string, BaseShape<any>>>(shape: T, extensions: U) =>
    shape.merge(c.object(extensions)),

  // =====================
  // ARRAY UTILITIES
  // =====================
  nonEmptyArray: <T extends BaseShape<any>>(shape: T) => 
    c.array(shape).nonEmpty(),
  uniqueArray: <T extends BaseShape<any>>(shape: T) => 
    c.array(shape).unique(),
  minLength: <T extends BaseShape<any>>(shape: T, min: number) => 
    c.array(shape).min(min),
  maxLength: <T extends BaseShape<any>>(shape: T, max: number) => 
    c.array(shape).max(max),

  // =====================
  // STRING SPECIALIZATIONS
  // =====================
  email: () => new StringShape().email(),
  uuid: () => new StringShape().uuid(),
  url: () => new StringShape().url(),
  ip: () => new StringShape().ipAddress(),
  dateString: () => new StringShape().isoDate(),
  hexColor: () => new StringShape().hexColor(),
  creditCard: () => new StringShape().creditCard(),
  regex: (pattern: RegExp) => new StringShape().regex(pattern),

  // =====================
  // NUMBER SPECIALIZATIONS
  // =====================
  int: () => new NumberShape().int(),
  float: () => new NumberShape(),
  positive: () => new NumberShape().positive(),
  negative: () => new NumberShape().negative(),
  port: () => new NumberShape().port(),
  latitude: () => new NumberShape().latitude(),
  longitude: () => new NumberShape().longitude(),
  percentage: () => new NumberShape().percentage(),

  // =====================
  // LOGICAL OPERATORS
  // =====================
  and: <T extends BaseShape<any>, U extends BaseShape<any>>(shape1: T, shape2: U) => 
    new AnyShape<InferType<T> & InferType<U>>().refine(
      v => shape1.safeParse(v).success && shape2.safeParse(v).success,
      'Must satisfy both schemas'
    ),
  or: <T extends BaseShape<any>, U extends BaseShape<any>>(shape1: T, shape2: U) => 
    c.union([shape1, shape2]),
  not: <T extends BaseShape<any>>(shape: T) => 
    new AnyShape<unknown>().refine(
      v => !shape.safeParse(v).success,
      'Must not match the schema'
    ),

  // =====================
  // RANDOM GENERATORS
  // =====================
  random: (length: number = 64, ext: boolean = false): string => {
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    if (ext) chars += "!@#$%^&*()_+-={}[]|:;<>,.?/~`";
    
    let result = "";
    const charsLength = chars.length;
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * charsLength));
    }
    
    return result;
  },
  randomInt: (min: number = 1, max: number = 1000): number => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  randomUuid: (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // =====================
  // CUSTOM VALIDATION
  // =====================
  custom: <T>(validator: (value: unknown) => value is T, message?: string) => 
    new AnyShape<T>().refine(validator, message ?? 'Custom validation failed'),
  refine: <T extends BaseShape<any>>(
    shape: T,
    predicate: (value: InferType<T>) => boolean,
    message: string,
    code?: string
  ) => shape.refine(predicate, message, code),
};