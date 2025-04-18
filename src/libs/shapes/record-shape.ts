// record-shape.ts
import { BaseShape } from './base-shape';
import { type COptionsConfig, type InferType } from '../types';
import { ConfigShapeError, type ErrorCreator } from '../error';

const createRecordError = (options: {
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

const RECORD_ERRORS = {
  NOT_OBJECT: (opts?: COptionsConfig) => createRecordError({
    code: opts?.code ?? 'NOT_OBJECT',
    message: opts?.message ?? 'Expected an object',
    meta: opts?.meta
  }),
  INVALID_PROPERTY: (key: string, opts?: COptionsConfig) => createRecordError({
    code: opts?.code ?? 'INVALID_PROPERTY',
    message: opts?.message ?? `Invalid property "${key}"`,
    meta: opts?.meta ?? { property: key }
  })
};

export class RecordShape<K extends string | number | symbol, V extends BaseShape<any>>
  extends BaseShape<Record<K, InferType<V>>> {
  public readonly _type = "record";

  constructor(
    private readonly _keyShape: BaseShape<K>,
    private readonly _valueShape: V
  ) {
    super();
  }

  getDefaults(): Record<K, InferType<V>> {
    const result: Record<any, any> = {
      ...(this._default ?? {})
    };

    // Verifica se há um valor padrão definido no próprio RecordShape
    if (typeof this._default !== 'undefined') {
      return this._default;
    }

    let key: K;
    key = this._keyShape._default as K;

    let value: InferType<V>;
    if (this._valueShape instanceof BaseShape) {
      if (typeof this._valueShape._default !== 'undefined') {
        value = this._valueShape._default;
      } else if ('getDefaults' in this._valueShape) {
        value = (this._valueShape as any).getDefaults();
      } else {
        value = {} as InferType<V>;
      }
    } else {
      value = this._valueShape;
    }

    if (key) result[key] = value;
    return result;
  }

  parse(value: unknown, opts?: COptionsConfig): Record<K, InferType<V>> {
    if (typeof value === "undefined" && this._optional && typeof this._default !== "undefined") return undefined as never;
    if (value === null && this._nullable && typeof this._default !== "undefined") return null as never;
    if (value === null || typeof value !== 'object') {
      this.createError(RECORD_ERRORS.NOT_OBJECT(opts), value);
    }

    const result: Record<any, any> = {};
    const input = value as Record<any, unknown>;

    for (const key in input) {
      try {
        const parsedKey = this._keyShape.parseWithPath(key, `${this._prop}[key]`);
        result[parsedKey] = this._valueShape.parseWithPath(input[key], `${this._prop}.${String(key)}`);
      } catch (error) {
        if (error instanceof ConfigShapeError) {
          throw error;
        }
        this.createError(RECORD_ERRORS.INVALID_PROPERTY(key, opts), input[key]);
      }
    }
    return this._checkImportant(this._applyOperations(result, this._key));
  }

  minProperties(min: number, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => Object.keys(val).length >= min,
      opts.message ?? `Record must have at least ${min} properties`,
      opts.code ?? 'TOO_FEW_PROPERTIES',
      opts.meta ?? { min }
    );
  }

  maxProperties(max: number, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => Object.keys(val).length <= max,
      opts.message ?? `Record must have at most ${max} properties`,
      opts.code ?? 'TOO_MANY_PROPERTIES',
      opts.meta ?? { max }
    );
  }

  exactProperties(count: number, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => Object.keys(val).length === count,
      opts.message ?? `Record must have exactly ${count} properties`,
      opts.code ?? 'INVALID_PROPERTY_COUNT',
      opts.meta ?? { count }
    );
  }

  hasProperty(key: K, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => key in val,
      opts.message ?? `Record must have property "${String(key)}"`,
      opts.code ?? 'MISSING_PROPERTY',
      opts.meta ?? { property: key }
    );
  }

  forbiddenProperty(key: K, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => !(key in val),
      opts.message ?? `Record must not have property "${String(key)}"`,
      opts.code ?? 'FORBIDDEN_PROPERTY',
      opts.meta ?? { property: key }
    );
  }
}