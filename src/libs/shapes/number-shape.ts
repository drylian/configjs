import type { COptionsConfig } from "../types";
import { BaseShape } from "./base-shape";

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
  public _decimalPlaces?: number;
  public _precision?: number;

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
          this.createError((value: unknown, path?: string) => ({
            code: opts?.code ?? 'NOT_NUMBER',
            message: opts?.message ?? 'Expected a number',
            path: path || '',
            value,
            meta: opts?.meta
          }), value);
        }
      } else if (typeof value === 'number') {
        value = value;
      } else {
        this.createError((value: unknown, path?: string) => ({
          code: opts?.code ?? 'NOT_NUMBER',
          message: opts?.message ?? 'Expected a number',
          path: path || '',
          value,
          meta: opts?.meta
        }), value);
      }
    }

    if (typeof value !== 'number') {
      this.createError((value: unknown, path?: string) => ({
        code: opts?.code ?? 'NOT_NUMBER',
        message: opts?.message ?? 'Expected a number',
        path: path || '',
        value,
        meta: opts?.meta
      }), value);
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

  decimal(places: number, opts: COptionsConfig = {}): this {
    this._decimalPlaces = places;
    return this.refine(
      (val) => {
        const str = val.toString();
        const decimalIndex = str.indexOf('.');
        return decimalIndex === -1 ? true : str.length - decimalIndex - 1 <= places;
      },
      opts.message ?? `Number must have at most ${places} decimal places`,
      opts.code ?? 'TOO_MANY_DECIMALS',
      opts.meta ?? { maxDecimalPlaces: places }
    );
  }

  precision(digits: number, opts: COptionsConfig = {}): this {
    this._precision = digits;
    return this.refine(
      (val) => {
        const str = val.toString().replace(/^0\.?0*|\./, '');
        return str.length <= digits;
      },
      opts.message ?? `Number must have at most ${digits} significant digits`,
      opts.code ?? 'TOO_MANY_DIGITS',
      opts.meta ?? { maxPrecision: digits }
    );
  }

  exactDecimal(places: number, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => {
        const str = val.toString();
        const decimalIndex = str.indexOf('.');
        return decimalIndex !== -1 && str.length - decimalIndex - 1 === places;
      },
      opts.message ?? `Number must have exactly ${places} decimal places`,
      opts.code ?? 'INVALID_DECIMAL_PLACES',
      opts.meta ?? { requiredDecimalPlaces: places }
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

  percentage(opts: COptionsConfig = {}): this {
    return this.min(0, opts).max(100, opts);
  }

  probability(opts: COptionsConfig = {}): this {
    return this.min(0, opts).max(1, opts);
  }

  byte(opts: COptionsConfig = {}): this {
    return this.int(opts).min(0, opts).max(255, opts);
  }

  natural(opts: COptionsConfig = {}): this {
    return this.int(opts).min(0, opts);
  }

  whole(opts: COptionsConfig = {}): this {
    return this.int(opts).min(1, opts);
  }
}