// number-shape.ts
import type { ErrorCreator } from "../error";
import { BaseShape } from "./base-shape";

const createNumberError = (options: {
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

const NUMBER_ERRORS = {
  NOT_NUMBER: createNumberError({
    code: 'NOT_NUMBER',
    message: 'Expected a number'
  }),
  MIN_VALUE: (min: number) => createNumberError({
    code: 'NUMBER_TOO_SMALL',
    message: `Number must be at least ${min}`,
    meta: { min }
  }),
  MAX_VALUE: (max: number) => createNumberError({
    code: 'NUMBER_TOO_LARGE',
    message: `Number must be at most ${max}`,
    meta: { max }
  }),
  NOT_INTEGER: createNumberError({
    code: 'NOT_INTEGER',
    message: 'Number must be an integer'
  }),
  NOT_POSITIVE: createNumberError({
    code: 'NOT_POSITIVE',
    message: 'Number must be positive'
  }),
  NOT_NEGATIVE: createNumberError({
    code: 'NOT_NEGATIVE',
    message: 'Number must be negative'
  }),
  NOT_SAFE_INTEGER: createNumberError({
    code: 'NOT_SAFE_INTEGER',
    message: 'Number must be a safe integer'
  }),
  NOT_FINITE: createNumberError({
    code: 'NOT_FINITE',
    message: 'Number must be finite'
  }),
  NOT_MULTIPLE_OF: (multiple: number) => createNumberError({
    code: 'NOT_MULTIPLE_OF',
    message: `Number must be a multiple of ${multiple}`,
    meta: { multiple }
  }),
  NOT_IN_RANGE: (min: number, max: number) => createNumberError({
    code: 'NOT_IN_RANGE',
    message: `Number must be between ${min} and ${max}`,
    meta: { min, max }
  }),
  NOT_EQUAL: (expected: number) => createNumberError({
    code: 'NOT_EQUAL',
    message: `Number must be equal to ${expected}`,
    meta: { expected }
  })
};

export class NumberShape extends BaseShape<number> {
  public readonly _type = "number";
  public _min?: number;
  public _max?: number;
  public _int = false;
  public _positive = false;
  public _negative = false;
  public _finite = true;
  public _safe = false;
  public _multipleOf?: number;
  public _coerce = false;

  coerce(): this {
    this._coerce = true;
    return this;
  }

  parse(value: unknown): number {
    if (typeof value === "undefined" && this._optional) return undefined as never;
    if (value === null && this._nullable) return null as never;
    
    if (this._coerce) {
      if (value === null || value === undefined || value === '') {
        value = 0;
      } else if (typeof value === 'boolean') {
        value = value ? 1 : 0;
      } else if (typeof value === 'string') {
        value = Number(value);
        if (isNaN(value as number)) {
          this.createError(NUMBER_ERRORS.NOT_NUMBER, value);
        }
      } else if (typeof value === 'number') {
        value = value;
      } else {
        this.createError(NUMBER_ERRORS.NOT_NUMBER, value);
      }
    }

    if (typeof value !== 'number') {
      this.createError(NUMBER_ERRORS.NOT_NUMBER, value);
    }

    let result = value as number;

    return this._checkImportant(this._applyRefinements(result, this._key));
  }

  min(value: number): this {
    this._min = value;
    return this.refine(
      (val) => val >= value,
      `Number must be at least ${value}`,
      'NUMBER_TOO_SMALL',
      { min: value }
    );
  }

  max(value: number): this {
    this._max = value;
    return this.refine(
      (val) => val <= value,
      `Number must be at most ${value}`,
      'NUMBER_TOO_LARGE',
      { max: value }
    );
  }

  range(min: number, max: number): this {
    this._min = min;
    this._max = max;
    return this.refine(
      (val) => val >= min && val <= max,
      `Number must be between ${min} and ${max}`,
      'NOT_IN_RANGE',
      { min, max }
    );
  }

  int(): this {
    this._int = true;
    return this.refine(
      Number.isInteger,
      'Number must be an integer',
      'NOT_INTEGER'
    );
  }

  positive(): this {
    this._positive = true;
    return this.refine(
      (val) => val > 0,
      'Number must be positive',
      'NOT_POSITIVE'
    );
  }

  nonNegative(): this {
    return this.min(0);
  }

  negative(): this {
    this._negative = true;
    return this.refine(
      (val) => val < 0,
      'Number must be negative',
      'NOT_NEGATIVE'
    );
  }

  nonPositive(): this {
    return this.max(0);
  }

  finite(): this {
    this._finite = true;
    return this.refine(
      Number.isFinite,
      'Number must be finite',
      'NOT_FINITE'
    );
  }

  safe(): this {
    this._safe = true;
    return this.refine(
      Number.isSafeInteger,
      'Number must be a safe integer',
      'NOT_SAFE_INTEGER'
    );
  }

  multipleOf(value: number): this {
    this._multipleOf = value;
    return this.refine(
      (val) => val % value === 0,
      `Number must be a multiple of ${value}`,
      'NOT_MULTIPLE_OF',
      { multiple: value }
    );
  }

  equals(value: number): this {
    return this.refine(
      (val) => val === value,
      `Number must be equal to ${value}`,
      'NOT_EQUAL',
      { expected: value }
    );
  }

  notEquals(value: number): this {
    return this.refine(
      (val) => val !== value,
      `Number must not be equal to ${value}`,
      'EQUALS_FORBIDDEN_VALUE',
      { forbidden: value }
    );
  }

  oneOf(values: number[]): this {
    return this.refine(
      (val) => values.includes(val),
      `Number must be one of: ${values.join(', ')}`,
      'NOT_IN_VALUES',
      { options: values }
    );
  }

  notOneOf(values: number[]): this {
    return this.refine(
      (val) => !values.includes(val),
      `Number must not be one of: ${values.join(', ')}`,
      'IN_FORBIDDEN_VALUES',
      { forbidden: values }
    );
  }

  port(): this {
    return this.int().min(0).max(65535);
  }

  latitude(): this {
    return this.min(-90).max(90);
  }

  longitude(): this {
    return this.min(-180).max(180);
  }
}