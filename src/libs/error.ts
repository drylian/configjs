// error-types.ts
export interface ConfigShapeErrorConstructor {
    code: string;
    path?: string;
    message: string;
    value: unknown;
    meta?: Record<string, unknown>;
}

export type ErrorCreator = (value: unknown, path?: string) => ConfigShapeErrorConstructor;
export class ConfigShapeError extends Error {
  public readonly code: string;
  public readonly path: string;
  public readonly value: unknown;
  public readonly meta?: Record<string, unknown>;

  constructor(options: ConfigShapeErrorConstructor) {
    super(options.message);
    this.name = 'ConfigShapeError';
    this.code = options.code;
    this.path = options.path || '';
    this.value = options.value;
    this.meta = options.meta;
  }

  toJSON() {
    return {
      code: this.code,
      path: this.path,
      message: this.message,
      value: this.value,
      ...(this.meta ? { meta: this.meta } : {})
    };
  }
}