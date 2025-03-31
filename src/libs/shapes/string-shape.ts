// string-shape.ts
import { BaseShape } from './base-shape';

export class StringShape extends BaseShape<string> {
  public readonly _type = "string";
  public _min?:number;
  public _max?:number;
  public _email?:boolean = false;
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
      this.createError((v, p) => ({
        code: 'NOT_STRING',
        path: p || '',
        message: 'Expected a string',
        value: v
      }), value);
    }

    return this._checkImportant(this._applyRefinements(value, this._key));
  }

  min(length: number): this {
    this._min = length;
    return this.refine(
      (val) => val.length >= length,
      `String must be at least ${length} characters long`,
      'STRING_TOO_SHORT',
      {
        min: length
      }
    );
  }

  coerce(): this {
    this._coerce = true;
    return this;
  }

  max(length: number): this {
    this._max = length;
    return this.refine(
      (val) => val.length <= length,
      `String must be at most ${length} characters long`,
      'STRING_TOO_LONG',
      {
        max: length
      }
    );
  }

  regex(pattern: RegExp): this {
    return this.refine(
      (val) => pattern.test(val),
      `String must match pattern ${pattern}`,
      'REGEX_MISMATCH',
      {
        regex: pattern.source
      }
    );
  }

  email(): this {
    this._email = true;
    return this.refine(
      (val) => /^[a-zA-Z0-9.!#$%&'*+\=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(val),
      `Email is invalid`,
      'INVALID_EMAIL'
    );
  }
}