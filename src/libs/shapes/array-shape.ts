import type { COptionsConfig, InferType } from "../types";
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
  NOT_ARRAY: (opts?: COptionsConfig) => createArrayError({
    code: opts?.code ?? 'NOT_ARRAY',
    message: opts?.message ?? 'Expected an array',
    meta: opts?.meta
  }),
  INVALID_ELEMENT: (index: number, opts?: COptionsConfig) => createArrayError({
    code: opts?.code ?? 'INVALID_ARRAY_ELEMENT',
    message: opts?.message ?? `Invalid array element at index ${index}`,
    meta: opts?.meta ?? { index }
  }),
  EMPTY_ARRAY: (opts?: COptionsConfig) => createArrayError({
    code: opts?.code ?? 'EMPTY_ARRAY',
    message: opts?.message ?? 'Array must not be empty',
    meta: opts?.meta
  }),
  MIN_LENGTH: (min: number, opts?: COptionsConfig) => createArrayError({
    code: opts?.code ?? 'ARRAY_TOO_SHORT',
    message: opts?.message ?? `Array must contain at least ${min} elements`,
    meta: opts?.meta ?? { min }
  }),
  MAX_LENGTH: (max: number, opts?: COptionsConfig) => createArrayError({
    code: opts?.code ?? 'ARRAY_TOO_LONG',
    message: opts?.message ?? `Array must contain at most ${max} elements`,
    meta: opts?.meta ?? { max }
  }),
  EXACT_LENGTH: (length: number, opts?: COptionsConfig) => createArrayError({
    code: opts?.code ?? 'INVALID_ARRAY_LENGTH',
    message: opts?.message ?? `Array must contain exactly ${length} elements`,
    meta: opts?.meta ?? { length }
  })
};

export class ArrayShape<T extends BaseShape<any>> extends BaseShape<Array<InferType<T>>> {
  public readonly _type = "array";
  public _minLength?: number;
  public _maxLength?: number;
  public _exactLength?: number;
  public _nonEmpty = false;

  constructor(public readonly _shape: T) {
    super();
  }

  parse(value: unknown, opts?: COptionsConfig): Array<InferType<T>> {
    if (typeof value === "undefined" && this._default) value = this._default;
    if (typeof value === "undefined" && this._optional) return undefined as never;
    if (value === null && this._nullable) return null as never;

    if (!Array.isArray(value)) {
      this.createError(ARRAY_ERRORS.NOT_ARRAY(opts), value);
    }

    const result = value.map((item, index) => {
      try {
        if (this._shape instanceof BaseShape) {
          return this._shape.parseWithPath(item, `${this._prop}[${index}]`);
        } else {
          if (item !== this._shape) {
            throw new ConfigShapeError({
              code: 'INVALID_LITERAL',
              path: `${this._prop}[${index}]`,
              message: `Expected ${JSON.stringify(this._shape)}`,
              value: item,
              ...opts
            });
          }
          return item;
        }
      } catch (error) {
        if (error instanceof ConfigShapeError) {
          throw error;
        }
        this.createError(ARRAY_ERRORS.INVALID_ELEMENT(index, opts), item);
      }
    });

    return this._checkImportant(this._applyOperations(result, this._key));
  }

  min(min: number, opts: COptionsConfig = {}): this {
    this._minLength = min;
    return this.refine(
      (arr) => arr.length >= min,
      opts.message ?? `Array must contain at least ${min} elements`,
      opts.code ?? 'ARRAY_TOO_SHORT',
      opts.meta ?? { min }
    );
  }

  max(max: number, opts: COptionsConfig = {}): this {
    this._maxLength = max;
    return this.refine(
      (arr) => arr.length <= max,
      opts.message ?? `Array must contain at most ${max} elements`,
      opts.code ?? 'ARRAY_TOO_LONG',
      opts.meta ?? { max }
    );
  }

  length(length: number, opts: COptionsConfig = {}): this {
    this._exactLength = length;
    return this.refine(
      (arr) => arr.length === length,
      opts.message ?? `Array must contain exactly ${length} elements`,
      opts.code ?? 'INVALID_ARRAY_LENGTH',
      opts.meta ?? { length }
    );
  }

  nonEmpty(opts: COptionsConfig = {}): this {
    this._nonEmpty = true;
    return this.refine(
      (arr) => arr.length > 0,
      opts.message ?? 'Array must not be empty',
      opts.code ?? 'EMPTY_ARRAY',
      opts.meta
    );
  }

  unique(opts: COptionsConfig = {}): this {
    return this.refine(
      (arr) => new Set(arr).size === arr.length,
      opts.message ?? 'Array must contain unique elements',
      opts.code ?? 'DUPLICATE_ITEMS',
      opts.meta
    );
  }

  includes(element: InferType<T>, opts: COptionsConfig = {}): this {
    return this.refine(
      (arr) => arr.includes(element),
      opts.message ?? `Array must include ${JSON.stringify(element)}`,
      opts.code ?? 'MISSING_ELEMENT',
      opts.meta ?? { element }
    );
  }

  excludes(element: InferType<T>, opts: COptionsConfig = {}): this {
    return this.refine(
      (arr) => !arr.includes(element),
      opts.message ?? `Array must not include ${JSON.stringify(element)}`,
      opts.code ?? 'FORBIDDEN_ELEMENT',
      opts.meta ?? { element }
    );
  }
}