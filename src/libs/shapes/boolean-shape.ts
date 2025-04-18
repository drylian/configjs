import type { ErrorCreator } from "../error";
import type { COptionsConfig } from "../types";
import { BaseShape } from "./base-shape";

const createBooleanError = (options: {
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

const BOOLEAN_ERRORS = {
  NOT_BOOLEAN: (opts?: COptionsConfig) => createBooleanError({
    code: opts?.code ?? 'NOT_BOOLEAN',
    message: opts?.message ?? 'Expected a boolean',
    meta: opts?.meta
  }),
  INVALID_BOOLEAN_STRING: (opts?: COptionsConfig) => createBooleanError({
    code: opts?.code ?? 'INVALID_BOOLEAN_STRING',
    message: opts?.message ?? 'String must be "true", "false", "1", or "0"',
    meta: opts?.meta
  })
};

export class BooleanShape extends BaseShape<boolean> {
  public readonly _type = "boolean";
  private _coerce = false;
  private _strictStrings = false;

  coerce(): this {
    this._coerce = true;
    return this;
  }

  strictStrings(): this {
    this._strictStrings = true;
    return this;
  }

  parse(value: unknown, opts?: COptionsConfig): boolean {
    if (typeof value === "undefined" && this._default) value = this._default;
    if (typeof value === "undefined" && this._optional) return undefined as never;
    if (value === null && this._nullable) return null as never;
    
    if (this._coerce) {
      if (this._strictStrings && typeof value === 'string') {
        if (value === 'true' || value === '1') return true;
        if (value === 'false' || value === '0') return false;
        this.createError(BOOLEAN_ERRORS.INVALID_BOOLEAN_STRING(opts), value);
      }
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return value.length > 0;
      if (value === null || value === undefined) return false;
      return Boolean(value);
    }

    if (typeof value !== 'boolean') {
      this.createError(BOOLEAN_ERRORS.NOT_BOOLEAN(opts), value);
    }

    return this._checkImportant(this._applyOperations(value, this._key));
  }

  isTrue(opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => val === true,
      opts.message ?? 'Value must be true',
      opts.code ?? 'NOT_TRUE',
      opts.meta
    );
  }

  isFalse(opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => val === false,
      opts.message ?? 'Value must be false',
      opts.code ?? 'NOT_FALSE',
      opts.meta
    );
  }

  truthy(opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => Boolean(val),
      opts.message ?? 'Value must be truthy',
      opts.code ?? 'NOT_TRUTHY',
      opts.meta
    );
  }

  falsy(opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => !val,
      opts.message ?? 'Value must be falsy',
      opts.code ?? 'NOT_FALSY',
      opts.meta
    );
  }
}