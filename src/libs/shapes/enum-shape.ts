import type { ErrorCreator } from '../error';
import { BaseShape } from './base-shape';

const createEnumError = (options: {
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

export class EnumShape<T extends (string | number)> extends BaseShape<T> {
  public readonly _type = "enum";

  private readonly _values: readonly T[];

  constructor(values: readonly T[]) {
    super();
    this._values = values;
  }

  parse(value: unknown): T {
    if (!this._values.includes(value as T)) {
      this.createError(
        createEnumError({
          code: 'INVALID_ENUM_VALUE',
          message: `Value must be one of: ${this._values.join(', ')}`,
          meta: { validValues: this._values }
        }),
        value
      );
    }
    return this._checkImportant(this._applyRefinements(value as T, this._key));
  }
}