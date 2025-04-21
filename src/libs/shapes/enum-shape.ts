import type { COptionsConfig } from '../types';
import { BaseShape } from './base-shape';

export class EnumShape<T extends (string | number)> extends BaseShape<T> {
  public readonly _type = "enum";
  private readonly _values: readonly T[];

  constructor(values: readonly T[]) {
    super();
    this._values = values;
  }

  parse(value: unknown, opts?: COptionsConfig): Readonly<T> {
    if (typeof value === "undefined" && this._optional && typeof this._default !== "undefined") return undefined as never;
    if (value === null && this._nullable && typeof this._default !== "undefined") return null as never;
    if (!this._values.includes(value as T)) {
      this.createError((value, path?) => ({
        value,
        path: path || "",
        code: opts?.code ?? 'INVALID_ENUM_VALUE',
        message: opts?.message ?? `Value must be one of: ${this._values.join(', ')}`,
        meta: opts?.meta ?? { validValues: this._values }
      }),
        value
      );
    }
    return this._checkImportant(this._applyOperations(value as T, this._key));
  }

  hasValue(value: T, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => val === value,
      opts.message ?? `Value must be ${value}`,
      opts.code ?? 'INVALID_ENUM_VALUE',
      opts.meta ?? { expected: value }
    );
  }

  notValue(value: T, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => val !== value,
      opts.message ?? `Value must not be ${value}`,
      opts.code ?? 'INVALID_ENUM_VALUE',
      opts.meta ?? { forbidden: value }
    );
  }

  oneOf(values: T[], opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => values.includes(val),
      opts.message ?? `Value must be one of: ${values.join(', ')}`,
      opts.code ?? 'INVALID_ENUM_VALUE',
      opts.meta ?? { validValues: values }
    );
  }

  notOneOf(values: T[], opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => !values.includes(val),
      opts.message ?? `Value must not be one of: ${values.join(', ')}`,
      opts.code ?? 'INVALID_ENUM_VALUE',
      opts.meta ?? { forbiddenValues: values }
    );
  }
}