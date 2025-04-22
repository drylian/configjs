import type { COptionsConfig, InferType } from "../types";
import { ConfigShapeError, type ErrorCreator } from "../error";
import { BaseShape } from "./base-shape";

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
    if (typeof value === "undefined" && typeof this._default !== "undefined") value = this._default;
    if (typeof value === "undefined" && this._optional) return undefined as never;
    if (value === null && this._nullable) return null as never;

    if (!Array.isArray(value)) {
      this.createError((value: unknown, path?: string) => ({
        code: opts?.code ?? 'NOT_ARRAY',
        message: opts?.message ?? 'Expected an array',
        path: path || '',
        value,
        meta: opts?.meta
      }), value);
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
              meta: {
                expected: JSON.stringify(this._shape)
              },
              ...opts
            });
          }
          return item;
        }
      } catch (error) {
        if (error instanceof ConfigShapeError) {
          throw error;
        }
        this.createError((value: unknown, path?: string) => ({
          code: opts?.code ?? 'INVALID_ARRAY_ELEMENT',
          message: opts?.message ?? `Invalid array element at index ${index}`,
          path: path || '',
          value,
          meta: opts?.meta ?? { index }
        }), item);
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

  includes(element: InferType<T>, opts: COptionsConfig = {}) {
    return this.refine(
      (arr:any[]) => arr.includes(element as never),
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

  onion<U extends BaseShape<any>>(shape: U): ArrayShape<U> {
    return new ArrayShape(shape);
  }
}