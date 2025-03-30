import { StringShape } from './shapes/string-shape';
import { NumberShape } from './shapes/number-shape';
import { BooleanShape } from './shapes/boolean-shape';
import { ObjectShape } from './shapes/object-shape';
import { ArrayShape } from './shapes/array-shape';
import type { BaseShape } from './shapes/base-shape';
import { RecordShape } from './shapes/record-shape';
import { EnumShape } from './shapes/enum-shape';

export const c = {
  enum: <T extends string | number>(keys: T[]) => new EnumShape(keys),
  string: () => new StringShape(),
  number: () => new NumberShape(),
  boolean: () => new BooleanShape(),
  object: <T extends Record<string, any>>(shape: T) => new ObjectShape(shape),
  array: <T extends BaseShape<any>>(shape: T) => new ArrayShape(shape),
  record: <K extends string | number | symbol, V>(
    keyShape: BaseShape<K>,
    valueShape: V
  ) => new RecordShape(keyShape, valueShape as BaseShape<any>),
  coerce: {
    string: () => new StringShape().coerce(),
    number: () => new NumberShape().coerce(),
    boolean: () => new BooleanShape().coerce(),
  }
};