// number-shape.ts
import type { ErrorCreator } from "../error";
import type { COptionsConfig } from "../types";
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
  NOT_NUMBER: (opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NOT_NUMBER',
    message: opts?.message ?? 'Expected a number',
    meta: opts?.meta
  }),
  MIN_VALUE: (min: number, opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NUMBER_TOO_SMALL',
    message: opts?.message ?? `Number must be at least ${min}`,
    meta: opts?.meta ?? { min }
  }),
  MAX_VALUE: (max: number, opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NUMBER_TOO_LARGE',
    message: opts?.message ?? `Number must be at most ${max}`,
    meta: opts?.meta ?? { max }
  }),
  NOT_INTEGER: (opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NOT_INTEGER',
    message: opts?.message ?? 'Number must be an integer',
    meta: opts?.meta
  }),
  NOT_POSITIVE: (opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NOT_POSITIVE',
    message: opts?.message ?? 'Number must be positive',
    meta: opts?.meta
  }),
  NOT_NEGATIVE: (opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NOT_NEGATIVE',
    message: opts?.message ?? 'Number must be negative',
    meta: opts?.meta
  }),
  NOT_SAFE_INTEGER: (opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NOT_SAFE_INTEGER',
    message: opts?.message ?? 'Number must be a safe integer',
    meta: opts?.meta
  }),
  NOT_FINITE: (opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NOT_FINITE',
    message: opts?.message ?? 'Number must be finite',
    meta: opts?.meta
  }),
  NOT_MULTIPLE_OF: (multiple: number, opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NOT_MULTIPLE_OF',
    message: opts?.message ?? `Number must be a multiple of ${multiple}`,
    meta: opts?.meta ?? { multiple }
  }),
  NOT_IN_RANGE: (min: number, max: number, opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NOT_IN_RANGE',
    message: opts?.message ?? `Number must be between ${min} and ${max}`,
    meta: opts?.meta ?? { min, max }
  }),
  NOT_EQUAL: (expected: number, opts?: COptionsConfig) => createNumberError({
    code: opts?.code ?? 'NOT_EQUAL',
    message: opts?.message ?? `Number must be equal to ${expected}`,
    meta: opts?.meta ?? { expected }
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

  parse(value: unknown, opts?: COptionsConfig): number {
    if (typeof value === "undefined" && this._default) value = this._default;
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
          this.createError(NUMBER_ERRORS.NOT_NUMBER(opts), value);
        }
      } else if (typeof value === 'number') {
        value = value;
      } else {
        this.createError(NUMBER_ERRORS.NOT_NUMBER(opts), value);
      }
    }

    if (typeof value !== 'number') {
      this.createError(NUMBER_ERRORS.NOT_NUMBER(opts), value);
    }

    let result = value as number;

    return this._checkImportant(this._applyOperations(result, this._key));
  }

  min(value: number, opts: COptionsConfig = {}): this {
    this._min = value;
    return this.refine(
      (val) => val >= value,
      opts.message ?? `Number must be at least ${value}`,
      opts.code ?? 'NUMBER_TOO_SMALL',
      opts.meta ?? { min: value }
    );
  }

  max(value: number, opts: COptionsConfig = {}): this {
    this._max = value;
    return this.refine(
      (val) => val <= value,
      opts.message ?? `Number must be at most ${value}`,
      opts.code ?? 'NUMBER_TOO_LARGE',
      opts.meta ?? { max: value }
    );
  }

  range(min: number, max: number, opts: COptionsConfig = {}): this {
    this._min = min;
    this._max = max;
    return this.refine(
      (val) => val >= min && val <= max,
      opts.message ?? `Number must be between ${min} and ${max}`,
      opts.code ?? 'NOT_IN_RANGE',
      opts.meta ?? { min, max }
    );
  }

  int(opts: COptionsConfig = {}): this {
    this._int = true;
    return this.refine(
      Number.isInteger,
      opts.message ?? 'Number must be an integer',
      opts.code ?? 'NOT_INTEGER',
      opts.meta
    );
  }

  positive(opts: COptionsConfig = {}): this {
    this._positive = true;
    return this.refine(
      (val) => val > 0,
      opts.message ?? 'Number must be positive',
      opts.code ?? 'NOT_POSITIVE',
      opts.meta
    );
  }

  nonNegative(opts: COptionsConfig = {}): this {
    return this.min(0, opts);
  }

  negative(opts: COptionsConfig = {}): this {
    this._negative = true;
    return this.refine(
      (val) => val < 0,
      opts.message ?? 'Number must be negative',
      opts.code ?? 'NOT_NEGATIVE',
      opts.meta
    );
  }

  nonPositive(opts: COptionsConfig = {}): this {
    return this.max(0, opts);
  }

  finite(opts: COptionsConfig = {}): this {
    this._finite = true;
    return this.refine(
      Number.isFinite,
      opts.message ?? 'Number must be finite',
      opts.code ?? 'NOT_FINITE',
      opts.meta
    );
  }

  safe(opts: COptionsConfig = {}): this {
    this._safe = true;
    return this.refine(
      Number.isSafeInteger,
      opts.message ?? 'Number must be a safe integer',
      opts.code ?? 'NOT_SAFE_INTEGER',
      opts.meta
    );
  }

  multipleOf(value: number, opts: COptionsConfig = {}): this {
    this._multipleOf = value;
    return this.refine(
      (val) => val % value === 0,
      opts.message ?? `Number must be a multiple of ${value}`,
      opts.code ?? 'NOT_MULTIPLE_OF',
      opts.meta ?? { multiple: value }
    );
  }

  equals(value: number, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => val === value,
      opts.message ?? `Number must be equal to ${value}`,
      opts.code ?? 'NOT_EQUAL',
      opts.meta ?? { expected: value }
    );
  }

  notEquals(value: number, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => val !== value,
      opts.message ?? `Number must not be equal to ${value}`,
      opts.code ?? 'EQUALS_FORBIDDEN_VALUE',
      opts.meta ?? { forbidden: value }
    );
  }

  oneOf(values: number[], opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => values.includes(val),
      opts.message ?? `Number must be one of: ${values.join(', ')}`,
      opts.code ?? 'NOT_IN_VALUES',
      opts.meta ?? { options: values }
    );
  }

  notOneOf(values: number[], opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => !values.includes(val),
      opts.message ?? `Number must not be one of: ${values.join(', ')}`,
      opts.code ?? 'IN_FORBIDDEN_VALUES',
      opts.meta ?? { forbidden: values }
    );
  }

  port(opts: COptionsConfig = {}): this {
    return this.int(opts).min(0, opts).max(65535, opts);
  }

  latitude(opts: COptionsConfig = {}): this {
    return this.min(-90, opts).max(90, opts);
  }

  longitude(opts: COptionsConfig = {}): this {
    return this.min(-180, opts).max(180, opts);
  }
}