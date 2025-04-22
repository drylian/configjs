import { BaseShapeAbstract } from "./base-abstract";
import { ConfigShapeError, type ErrorCreator } from "../error";
import type { COptionsConfig } from "../types";
import { type ExpandRecursively } from '../types';

export abstract class BaseShape<T> extends BaseShapeAbstract<T> {
  abstract readonly _type: string;

  protected createError(creator: ErrorCreator, value: unknown, path = '', opts?: COptionsConfig): never {
    const fullPath = this._prop !== '_unconfigured_property'
      ? `${path ? `${path}.` : ''}${this._prop}`
      : path;
    const data = creator(value, fullPath);
    throw new ConfigShapeError({
      ...data,
      code: opts?.code ?? data.code,
      message: opts?.message ?? data.message,
      meta: {
        ...this.conf() as object,
        ...data.meta ?? {},
        ...opts?.meta ?? {}
      }
    });
  }

  conf() {
    const result = {
      ...this._getConfig(),
      type: this._type,
    };
    return result as ExpandRecursively<typeof result> ;
  }

  parseWithDefault(value: unknown): T {
    if (typeof value === "undefined" && typeof this._default !== "undefined") {
      return this._applyOperations(this._default, '') as T;
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
          ...this.conf()as object,
        }
      });
    }
    return value;
  }

  parseWithPath(value: unknown, path = ''): T {
    try {
      const parsed = this.parseWithDefault(value);
      this._checkImportant(parsed);
      return this._applyOperations(parsed, path) as T;
    } catch (error) {
      if (error instanceof ConfigShapeError) {
        throw error;
      }
      throw new ConfigShapeError({
        code: 'PARSE_ERROR',
        path: this._prop !== '_unconfigured_property'
          ? `${path ? `${path}.` : ''}${this._prop}`
          : path,
        message: (error instanceof Error ? error.message : 'Unknown error'),
        value,
        meta: {
          ...this.conf() as object,
          message:(error instanceof Error ? error.message : 'Unknown error')
        }
      });
    }
  }
}