import { BaseShapeAbstract } from "./base-abstract";
import { OptionalShape } from "./optional-shape";
import { NullableShape } from "./nullable-shape";
import { TransformShape } from "./transform-shape";
import { ConfigShapeError, type ErrorCreator } from "../error";

export abstract class BaseShape<T> extends BaseShapeAbstract<T> {
  abstract readonly _type: string;

  protected createError(creator: ErrorCreator, value: unknown, path = ''): never {
    const fullPath = this._prop !== '_unconfigured_property'
      ? `${path ? `${path}.` : ''}${this._prop}`
      : path;
    const data = creator(value, fullPath);
    throw new ConfigShapeError({
      ...data,
      meta: {
        ...this.conf(),
        ...data.meta ?? {}
      }
    });
  }

  optional(): OptionalShape<T> {
    return new OptionalShape(this);
  }

  nullable(): NullableShape<T> {
    return new NullableShape(this);
  }

  transform<U>(fn: (value: T) => U): BaseShape<U> {
    //@ts-expect-error ingore
    return new TransformShape(this, fn);
  }

  conf() {
    return {
      key: this._key,
      prop: this._prop,
      type: this._type,
      default: this._default,
      description: this._description,
      important: this._important,
      save_default: this._save_default,
    };
  }

  refine(
    predicate: (value: T) => boolean,
    message: string,
    code = 'VALIDATION_ERROR',
    meta?: Record<string, unknown>
  ): this {
    this._refinements.push({ fn: predicate, message, code, meta });
    return this;
  }

  parseWithDefault(value: unknown): T {
    if (typeof value === "undefined" && typeof this._default !== "undefined") {
      return this._applyTransforms(this._default);
    }
    return this.parse(value);
  }

  _checkImportant(value: T): T {
    if ((typeof value === "undefined" || value === null) && this._important) {
      throw new ConfigShapeError({
        code: 'IMPORTANT_PROPERTY',
        path: `${this._key} - (prop: '${this._prop}')`,
        message: `The property '${this._prop}' is marked as required but was not provided. Please define this value before proceeding.`,
        value,
        meta: {
          ...this.conf()
        }
      });
    }
    return value;
  }

  parseWithPath(value: unknown, path = ''): T {
    try {
      const parsed = this.parseWithDefault(value);
      return this._applyRefinements(parsed, path);
    } catch (error) {
      if (error instanceof ConfigShapeError) {
        throw error;
      }
      throw new ConfigShapeError({
        code: 'PARSE_ERROR',
        path: this._prop !== '_unconfigured_property'
          ? `${path ? `${path}.` : ''}${this._prop}`
          : path,
        message: error instanceof Error ? error.message : 'Unknown error',
        value,
        meta: {
          ...this.conf()
        }
      });
    }
  }

  _applyTransforms(value: T): T {
    return this._transforms.reduce((val, transform) => transform(val), value);
  }

  _applyRefinements(value: T, path: string): T {
    for (const refinement of this._refinements) {
      if (!refinement.fn(value)) {
        throw new ConfigShapeError({
          code: refinement.code || 'VALIDATION_ERROR',
          path: this._prop !== '_unconfigured_property'
            ? `${path ? `${path}.` : ''}${this._prop}`
            : path,
          message: refinement.message,
          value,
          meta: {
            ...this.conf(),
            ...refinement.meta ?? {},
          }
        });
      }
    }
    return this._applyTransforms(value);
  }
}