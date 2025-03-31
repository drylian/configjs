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
  })
};

export class NumberShape extends BaseShape<number> {
  public readonly _type = "number";
  public _min?: number;
  public _max?: number;
  public _int = false;
  public _coerce = false;

  coerce(): this {
    this._coerce = true;
    return this;
  }

  parse(value: unknown): number {
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

    return this._checkImportant(this._applyRefinements(value, this._key));
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

  int(): this {
    this._int = true;
    return this.refine(
      Number.isInteger,
      'Number must be an integer',
      'NOT_INTEGER'
    );
  }
}