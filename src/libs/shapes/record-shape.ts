// record-shape.ts
import { BaseShape } from './base-shape';
import { type InferType } from '../types';
import { ConfigShapeError, type ErrorCreator } from '../error';

const createRecordError = (options: {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}): ErrorCreator => {
  return (value: unknown, path?: string) => ({
    ...options,
    path: path || '',
    value,
    meta: options.meta
  });
};

const RECORD_ERRORS = {
  NOT_OBJECT: createRecordError({
    code: 'NOT_OBJECT',
    message: 'Expected an object'
  }),
  INVALID_PROPERTY: (key: string) => createRecordError({
    code: 'INVALID_PROPERTY',
    message: `Invalid property "${key}"`,
    meta: { property: key }
  })
};

export class RecordShape<K extends string | number | symbol, V extends BaseShape<any>>
  extends BaseShape<Record<K, InferType<V>>> {
  public readonly _type = "record";

  constructor(
    private readonly _keyShape: BaseShape<K>,
    private readonly _valueShape: V
  ) {
    super();
  }

  parse(value: unknown):Record<K, InferType<V>>  {
    if (typeof value === "undefined" && this._optional && typeof this._default !== "undefined") return undefined as never;
    if (value === null && this._nullable && typeof this._default !== "undefined") return null as never;
    if (value === null || typeof value !== 'object') {
      this.createError(RECORD_ERRORS.NOT_OBJECT, value);
    }

    const result: Record<any, any> = {};
    const input = value as Record<any, unknown>;

    for (const key in input) {
      try {
        const parsedKey = this._keyShape.parseWithPath(key, `${this._prop}[key]`);
        result[parsedKey] = this._valueShape.parseWithPath(input[key], `${this._prop}.${String(key)}`);
      } catch (error) {
        if (error instanceof ConfigShapeError) {
          throw error;
        }
        this.createError(RECORD_ERRORS.INVALID_PROPERTY(key), input[key]);
      }
    }
    return this._checkImportant(result);
  }
}