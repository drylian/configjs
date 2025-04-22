import type { COptionsConfig } from "../types";
import { BaseShape } from "./base-shape";

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
    if (typeof value === "undefined" && typeof this._default !== "undefined") value = this._default;
    if (typeof value === "undefined" && this._optional) return undefined as never;
    if (value === null && this._nullable) return null as never;

    if (this._coerce) {
      if (this._strictStrings && typeof value === 'string') {
        if (typeof value == "string" && value.toLowerCase() === 'true' || value === '1') value = true;
        if (typeof value == "string" && value.toLowerCase() === 'false' || value === '0') value = false;
        this.createError((value: unknown, path?: string) => ({
          code: opts?.code ?? 'INVALID_BOOLEAN_STRING',
          message: opts?.message ?? 'String must be "true", "false", "1", or "0"',
          path: path || '',
          value,
          meta: opts?.meta
        }), value);
      }
      if (typeof value === "number" && isNaN(value) ) value = false;
      if (typeof value == "string" && value.toLowerCase() === 'true' || value === '1') value = true;
      if (typeof value == "string" && value.toLowerCase() === 'false' || value === '0') value = false;
      if (typeof value === 'number') value = value > 0;
      if (typeof value === 'number') value = value < 0;
      if (typeof value === 'string') value = value.length > 0;
      if (value === null || value === undefined) value = false;
      if(typeof value !== "boolean") value = Boolean(value);
    }

    if (typeof value !== 'boolean') {
      this.createError((value: unknown, path?: string) => ({
        code: opts?.code ?? 'NOT_BOOLEAN',
        message: opts?.message ?? 'Expected a boolean',
        path: path || '',
        value,
        meta: opts?.meta
      }), value);
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