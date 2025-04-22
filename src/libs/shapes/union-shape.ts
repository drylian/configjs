import { BaseShape } from './base-shape';
import type { COptionsConfig } from '../types';
import { ConfigShapeError } from '../error';

export class UnionShape<T extends BaseShape<any>[]> extends BaseShape<
  T[number] extends BaseShape<infer U> ? U : never
> {
  public readonly _type = "union";

  constructor(private readonly shapes: T) {
    super();
  }

  parse(value: unknown, opts?: COptionsConfig): any {
    const errors: ConfigShapeError[] = [];
    
    for (const shape of this.shapes) {
      try {
        return shape.parseWithPath(value, this._prop);
      } catch (error) {
        if (error instanceof ConfigShapeError) {
          errors.push(error);
        } else {
          errors.push(new ConfigShapeError({
            code: 'UNKNOWN_ERROR',
            message: String(error),
            path: this._prop,
            value
          }));
        }
      }
    }

    this.createError((value: unknown, path?: string) => ({
      code: opts?.code ?? 'NO_MATCHING_UNION_MEMBER',
      message: opts?.message ?? 'Value did not match any union member',
      path: path || '',
      value,
      meta: {
        ...opts?.meta,
        errors: errors.map(err => ({
          code: err.code,
          message: err.message,
          path: err.path
        }))
      }
    }), value);
  }
}