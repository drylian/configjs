import type { COptionsConfig } from "../types";
import { BaseShape } from "./base-shape";

export class BooleanShape extends BaseShape<boolean> {
  public readonly _type = "boolean";
  private _coerce = false;

  coerce(): this {
    this._coerce = true;
    return this;
  }

  parse(value: unknown, opts?: COptionsConfig): boolean {
    if (typeof value === "undefined" && typeof this._default !== "undefined") value = this._default;
    if (typeof value === "undefined" && this._optional) return undefined as never;
    if (value === null && this._nullable) return null as never;

    if (this._coerce) {
      // Coerce strings with case insensitivity
      if (typeof value === 'string') {
        const normalized = value.toLowerCase().trim();
        // Loose string coercion
        if (['yes', 'y', 's', '1', 'true'].includes(normalized)) {
          value = true;
        } else if (['no', 'n', '0', 'false'].includes(normalized)) {
          value = false;
        } else if (!isNaN(Number(normalized))) {
          value = Number(normalized) !== 0;
        } else {
          value = Boolean(value);
        }
      }

      // Numbers: coerce NaN and zero to false
      else if (typeof value === "number") {
        value = !isNaN(value) && value !== 0;
      }

      // null/undefined -> false
      else if (value === null || value === undefined) {
        value = false;
      }

      // objects, symbols, other types
      else {
        value = Boolean(value);
      }
    }

    if (typeof value !== 'boolean') {
      this.createError((value: unknown, path?: string) => ({
        code: opts?.code ?? 'NOT_BOOLEAN',
        message: opts?.message ?? 'Expected a boolean',
        path: path || '',
        value,
        key:this._key,
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
