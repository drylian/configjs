import { BaseShape } from './base-shape';
import { type COptionsConfig, type InferShapeType, type ShapeViewer } from '../types';
import { ConfigShapeError } from '../error';

export class RecordShape<K extends string | number | symbol, V extends BaseShape<any>>
  extends BaseShape<Record<K, InferShapeType<V>>> {
  public readonly _type = "record";

  constructor(
    private readonly _keyShape: BaseShape<K>,
    private readonly _valueShape: V
  ) {
    super();
  }

  getDefaults(): ShapeViewer<Record<K, InferShapeType<V>>> {
    const result: Record<any, any> = {
      ...(this._default ?? {})
    };

    if (typeof this._default !== 'undefined') {
      return this._default as never;
    }

    let key: K = this._keyShape._default as K;
    let value: InferShapeType<V>;

    if (this._valueShape instanceof BaseShape) {
      if (typeof this._valueShape._default !== 'undefined') {
        value = this._valueShape._default;
      } else if ('getDefaults' in this._valueShape) {
        value = (this._valueShape as any).getDefaults();
      } else {
        value = {} as InferShapeType<V>;
      }
    } else {
      value = this._valueShape;
    }

    if (key) result[key] = value;
    return result  as never;
  }

  //@ts-expect-error ignore
  parse(value: unknown, opts?: COptionsConfig): ShapeViewer<Record<K, InferShapeType<V>>> {
    if (typeof value === "undefined" && typeof this._default !== "undefined") value = this._default;
    if (typeof value === "undefined" && this._optional) return undefined as never;
    if (value === null && this._nullable) return null as never;
    
    if (value === null || typeof value !== 'object') {
      this.createError((value: unknown, path?: string) => ({
        code: opts?.code ?? 'NOT_OBJECT',
        message: opts?.message ?? 'Expected an object',
        path: path || '',
        value,
        key:this._key,
        meta: opts?.meta
      }), value);
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
        this.createError((value: unknown, path?: string) => ({
          code: opts?.code ?? 'INVALID_PROPERTY',
          message: opts?.message ?? `Invalid property "${key}"`,
          path: path || '',
          value,
          key:this._key,
          meta: opts?.meta ?? { property: key }
        }), input[key]);
      }
    }

    return this._checkImportant(this._applyOperations(result, this._key)) as never;
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

  propertyValue(key: K, validator: (value: InferShapeType<V>) => boolean, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => key in val && validator(val[key]),
      opts.message ?? `Property "${String(key)}" is invalid`,
      opts.code ?? 'INVALID_PROPERTY_VALUE',
      opts.meta ?? { property: key }
    );
  }

  propertyShape(key: K, shape: BaseShape<any>, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => key in val && shape.parse(val[key]) === val[key],
      opts.message ?? `Property "${String(key)}" has invalid shape`,
      opts.code ?? 'INVALID_PROPERTY_SHAPE',
      opts.meta ?? { property: key }
    );
  }

  nonEmpty(opts: COptionsConfig = {}): this {
    return this.minProperties(1, opts);
  }

  propertyNames(validator: (key: string) => boolean, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => Object.keys(val).every(validator),
      opts.message ?? 'Some property names are invalid',
      opts.code ?? 'INVALID_PROPERTY_NAMES',
      opts.meta
    );
  }

  propertyValues(validator: (value: unknown) => boolean, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => Object.values(val).every(validator),
      opts.message ?? 'Some property values are invalid',
      opts.code ?? 'INVALID_PROPERTY_VALUES',
      opts.meta
    );
  }

  exactPropertiesShape(shape: Record<K, BaseShape<any>>, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => {
        const valKeys = Object.keys(val);
        const shapeKeys = Object.keys(shape);
        
        if (valKeys.length !== shapeKeys.length) return false;
        if (!valKeys.every(k => shapeKeys.includes(k))) return false;
        
        return Object.entries(val).every(([key, value]) => {
          try {
            shape[key as K].parse(value);
            return true;
          } catch {
            return false;
          }
        });
      },
      opts.message ?? 'Record shape does not match required structure',
      opts.code ?? 'INVALID_RECORD_SHAPE',
      opts.meta ?? { requiredShape: shape }
    );
  }
}