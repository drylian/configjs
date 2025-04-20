import { StringShape } from './shapes/string-shape';
import { NumberShape } from './shapes/number-shape';
import { BooleanShape } from './shapes/boolean-shape';
import { ObjectShape } from './shapes/object-shape';
import { ArrayShape } from './shapes/array-shape';
import type { BaseShape } from './shapes/base-shape';
import { RecordShape } from './shapes/record-shape';
import { EnumShape } from './shapes/enum-shape';

//@ts-expect-error typed declaration diff
declare function Enum<const T extends readonly (string | number)[]>(
  keys: T
): EnumShape<T[number]>;

//@ts-expect-error typed declaration diff
declare function Enum<const T extends Record<string, string | number>>(
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
  enum: Enum,
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
  },
  /**
   * Random string
   * 
   * @utils
   */
  random: (length: number = 64, ext: boolean = false): string => {
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    if (ext) {
      chars += "!@#$%^&*()_+-={}[]|:;<>,.?/~`";
    }

    let result = "";
    const charsLength = chars.length;

    const buffer = new Array(4);

    for (let i = 0; i < length; i++) {
      for (let j = 0; j < 4; j++) {
        buffer[j] = Math.random();
      }

      const combinedRandom = buffer.reduce((acc, val, idx) => {
        return acc + (val / (idx + 1));
      }, 0) % 1;

      const randomIndex = Math.floor(combinedRandom * charsLength);
      result += chars[randomIndex];
    }

    return result;
  },
  /**
   * Random int (default 1 ~ 1000)
   * 
   * @utils
   */
  randomInt: (min: number = 1, max: number = 1000): number => {
    if (min > max) [min, max] = [max, min]; // Swap if min > max

    min = Math.ceil(min);
    max = Math.floor(max);

    const buffer = new Array(4);
    for (let i = 0; i < 4; i++) {
      buffer[i] = Math.random();
    }

    const combinedRandom = buffer.reduce((acc, val, idx) => {
      return acc + (val / (idx + 1));
    }, 0) % 1;

    return Math.floor(combinedRandom * (max - min + 1)) + min;
  }

};