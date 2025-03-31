import type { InferType } from "../types";
import { ConfigShapeError, type ErrorCreator } from "../error";
import { BaseShape } from "./base-shape";

const createArrayError = (options: {
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

const ARRAY_ERRORS = {
  NOT_ARRAY: createArrayError({
    code: 'NOT_ARRAY',
    message: 'Expected an array'
  }),
  INVALID_ELEMENT: (index: number) => createArrayError({
    code: 'INVALID_ARRAY_ELEMENT',
    message: `Invalid array element at index ${index}`,
    meta: { index }
  })
};

export class ArrayShape<T extends BaseShape<any>> extends BaseShape<Array<InferType<T>>> {
  public readonly _type = "array";
  constructor(private readonly _shape: T) {
    super();
  }

  parse(value: unknown): Array<InferType<T>> {
    if (!Array.isArray(value)) {
      this.createError(ARRAY_ERRORS.NOT_ARRAY, value);
    }

    return this._checkImportant(value.map((item, index) => {
      try {
        if (this._shape instanceof BaseShape) {
          return this._shape.parseWithPath(item, `${this._prop}[${index}]`);
        } else {
          if (item !== this._shape) {
            throw new ConfigShapeError({
              code: 'INVALID_LITERAL',
              path: `${this._prop}[${index}]`,
              message: `Expected ${JSON.stringify(this._shape)}`,
              value: item
            });
          }
          return item;
        }
      } catch (error) {
        if (error instanceof ConfigShapeError) {
          throw error;
        }
        this.createError(ARRAY_ERRORS.INVALID_ELEMENT(index), item);
      }
    }));

  }
}