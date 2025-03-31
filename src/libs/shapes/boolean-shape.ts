import type { ErrorCreator } from "../error";
import { BaseShape } from "./base-shape";

const createBooleanError = (options: {
  code: string;
  message: string;
}): ErrorCreator => {
  return (value: unknown, path?: string) => ({
    ...options,
    path: path || '',
    value
  });
};

const BOOLEAN_ERRORS = {
  NOT_BOOLEAN: createBooleanError({
    code: 'NOT_BOOLEAN',
    message: 'Expected a boolean'
  })
};

export class BooleanShape extends BaseShape<boolean> {
  public readonly _type = "boolean";

  private _coerce = false;

  coerce(): this {
    this._coerce = true;
    return this;
  }

  parse(value: unknown): boolean {
    if (this._coerce) {
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return value.length > 0;
      if (value === null || value === undefined) return false;
      return Boolean(value);
    }
    if (typeof value !== 'boolean') {
      this.createError(BOOLEAN_ERRORS.NOT_BOOLEAN, value);
    }
    return this._checkImportant(this._applyRefinements(value, this._key));
  }
}