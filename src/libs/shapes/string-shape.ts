// string-shape.ts
import { BaseShape } from './base-shape';

const ERRORS = {
  NOT_STRING: (value: unknown, path?: string) => ({
    code: 'NOT_STRING',
    path: path || '',
    message: 'Expected a string',
    value
  }),
  MIN_LENGTH: (min: number, value: unknown, path?: string) => ({
    code: 'STRING_TOO_SHORT',
    path: path || '',
    message: `String must be at least ${min} characters long`,
    value,
    meta: { minLength: min, actualLength: typeof value === 'string' ? value.length : undefined }
  }),
  MAX_LENGTH: (max: number, value: unknown, path?: string) => ({
    code: 'STRING_TOO_LONG',
    path: path || '',
    message: `String must be at most ${max} characters long`,
    value,
    meta: { maxLength: max, actualLength: typeof value === 'string' ? value.length : undefined }
  }),
  REGEX_MISMATCH: (regex: RegExp, value: unknown, path?: string) => ({
    code: 'REGEX_MISMATCH',
    path: path || '',
    message: `String must match pattern ${regex}`,
    value,
    meta: { pattern: regex.toString() }
  })
};

export class StringShape extends BaseShape<string> {
  public readonly _type = "string";

  private _minLength?: number;
  private _maxLength?: number;
  private _regex?: RegExp;
  private _coerce = false;

  parse(value: unknown): string {
    if (this._coerce) {
      if (value === null || value === undefined) {
        value = '';
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        value = String(value);
      } else if (typeof value === 'object') {
        value = JSON.stringify(value);
      } else {
        value = String(value);
      }
    }

    if (typeof value !== 'string') {
      this.createError(ERRORS.NOT_STRING, value);
    }

    if (this._minLength !== undefined && value.length < this._minLength) {
      this.createError(
        (val, path) => ERRORS.MIN_LENGTH(this._minLength!, val, path), 
        value
      );
    }

    if (this._maxLength !== undefined && value.length > this._maxLength) {
      this.createError(
        (val, path) => ERRORS.MAX_LENGTH(this._maxLength!, val, path), 
        value
      );
    }

    if (this._regex !== undefined && !this._regex.test(value)) {
      this.createError(
        (val, path) => ERRORS.REGEX_MISMATCH(this._regex!, val, path), 
        value
      );
    }

    return this._checkImportant(value);
  }

  min(length: number): this {
    this._minLength = length;
    return this.refine(
      (val) => val.length >= length,
      `String must be at least ${length} characters long`,
      'STRING_TOO_SHORT'
    );
  }

  coerce(): this {
    this._coerce = true;
    return this;
  }

  max(length: number): this {
    this._maxLength = length;
    return this.refine(
      (val) => val.length <= length,
      `String must be at most ${length} characters long`,
      'STRING_TOO_LONG'
    );
  }

  regex(pattern: RegExp): this {
    this._regex = pattern;
    return this.refine(
      (val) => pattern.test(val),
      `String must match pattern ${pattern}`,
      'REGEX_MISMATCH'
    );
  }
}