import { AbstractShape, t } from "@caeljs/tsh";
import type {
  InferShapeType,
  inferType,
  TshViewer,
} from "@caeljs/tsh";
import { processShapes } from "./libs/functions";
export * from "./libs/types";
export * from "./libs/functions";
export * from "./libs/driver";
export * from "./libs/drivers";
import * as c from "./shapes";
import type { ConfigPrimitives } from "./shapes";

export { c };
export { t };
import {
  type ConfigJSOptions,
  type ConfigJSPartials,
  type ConfigJSPaths,
  type ConfigJSResolvePath,
  type ConfigJSResolver,
  type ConfigJSResource,
  type ConfigJSRoots,
  type If,
} from "./libs/types";
import type { AbstractConfigJSDriver } from "./libs/driver";

/**
 * Configuration management class that provides a type-safe interface
 * for accessing and manipulating configuration values using shapes.
 *
 * @template ConfigDriver - The driver type used for configuration storage
 * @template Shapes - The nested shapes structure defining the configuration schema
 */
export class ConfigJS<
  const ConfigDriver extends typeof AbstractConfigJSDriver<any, any>,
  Shapes extends ConfigJSOptions,
> {
  /** Internal cache */
  #cache: any;

  /**
   * Gets the cached raw data from the driver
   */
  public get cached() {
    return this.#cache;
  }

  /**
   * Sets the cached raw data and updates the cache timestamp
   */
  public set cached(data) {
    this.#cache = data;
    this.cached_at = Date.now();
  }

  /**
   * Timestamp of the last cache update
   */
  public cached_at = 0;

  /**
   * Indicates whether the driver operates asynchronously
   */
  public readonly async: ConfigDriver['prototype']['async'];
  public driver: ConfigDriver['prototype'];
  /**
   * The shapes structure defining the configuration schema
   */
  public readonly shapes: Shapes;

  /**
   * Creates a new ConfigJS instance
   * @param driver - The configuration driver to use
   * @param shapes - The nested shapes structure defining the configuration schema
   */
  constructor(
    driver: ConfigDriver,
    shapes: Shapes,
  ) {
    //@ts-expect-error ignore abstract call error
    this.driver = new driver(this);
    processShapes(shapes as never);
    this.shapes = shapes;
    this.async = this.driver.async;
  }

  /**
   * Retrieves the schema for a given configuration path
   * @param path - Dot-notation path to the configuration property
   * @returns The shape instance for the specified path
   * @throws If the path is invalid or doesn't point to a configuration property
   */
  //@ts-ignore ignore
  public getSchema<Path extends ConfigJSPaths<Shapes>>(
    path: Path,
  ): If<ConfigJSResolvePath<Shapes, Path> extends AbstractShape<any> ? true : false, ConfigJSResolvePath<Shapes, Path>, AbstractShape<any>> {
    const parts = path.split(".");
    let current: any = this.shapes;

    for (const part of parts) {
      if (!current || !(part in current)) {
        throw `[ConfigJS]: Key property "${path}" not found in shapes of config instance`;
      }
      current = current[part];
    }

    if (!(current instanceof AbstractShape)) {
      throw `[ConfigJS]: Property "${path}" is not a configuration property`;
    }

    return current as never;
  }

  /**
   * Gets the driver's configuration options
   */
  public get config(): ConfigDriver['prototype']['config'] {
    return this.driver.config;
  }

  /**
   * Sets the driver's configuration options
   */
  public set config(value) {
    this.driver.config = value;
  }

  /**
   * Gets the configuration value for a path (without type conversion/validation)
   * @param path - Dot-notation path to the configuration property
   * @returns The raw configuration value
   */
  public conf<Path extends ConfigJSPaths<Shapes>>(path: Path): t.TshConfig<ConfigJSResolvePath<Shapes, Path>> {
    //@ts-ignore ignore
    const schema = this.getSchema(path);
    //@ts-ignore ignore
    return schema.conf() as never;
  }
  /**
   * Gets a configuration value
   * @param path - Dot-notation path to the configuration property
   * @returns The configuration value (type depends on driver's async flag)
   */
  public get<Path extends ConfigJSPaths<Shapes>>(path: Path) {
    const schema = this.getSchema(path);
    return this.driver.get(schema as never) as ConfigJSResolver<
      ConfigDriver['prototype']["async"],
      ConfigJSResource<Shapes, Path>
    >;
  }

  /**
   * Inserts values into a root configuration property
   * @param path - Dot-notation path to the root configuration property
   * @param values - Values to insert (must match the shape structure)
   * @returns Operation result (type depends on driver's async flag)
   * @throws If the path is invalid or points to a non-root property
   */
  public insert<Path extends ConfigJSRoots<Shapes>>(
    path: Path,
    values: TshViewer<ConfigJSPartials<ConfigJSResource<Shapes, Path>>>,
  ) {
    const parts = path.split(".");
    let current: any = this.shapes;

    for (const part of parts) {
      if (!current || !(part in current)) {
        throw `[ConfigJS]: Key property "${path}" not found in shapes of config instance`;
      }
      current = current[part];
    }

    if (current instanceof AbstractShape) {
      throw `[ConfigJS]: Property "${path}" is not a root property`;
    }

    const filtered = Object.keys(values).reduce(
      (acc: any, key) => {
        if (key in current) {
          acc[key] = current[key];
        }
        return acc;
      },
      {} as Partial<typeof this.shapes>,
    );

    return this.driver.insert(
      filtered,
      values as never,
    ) as ConfigJSResolver<ConfigDriver['prototype']["async"], boolean>;
  }

  /**
   * Gets all values from a root configuration property
   * @param path - Dot-notation path to the root configuration property
   * @returns All values under the specified path (type depends on driver's async flag)
   * @throws If the path is invalid or points to a non-root property
   */
  public root<Path extends ConfigJSRoots<Shapes>>(path: Path) {
    const parts = path.split(".");
    let current: any = this.shapes;

    for (const part of parts) {
      if (!current || !(part in current)) {
        throw `[ConfigJS]: Key property "${path}" not found in shapes of config instance`;
      }
      current = current[part];
    }

    if (current instanceof AbstractShape) {
      throw `[ConfigJS]: Property "${path}" is not a root property`;
    }
    return this.driver.root(current) as ConfigJSResolver<
      ConfigDriver['prototype']["async"],
      inferType<Shapes[Path]>
    >;
  }

  /**
   * Gets all configuration values
   * @returns All configuration values (type depends on driver's async flag)
   */
  public all() {
    return this.driver.root(
      this.shapes as never,
    ) as ConfigJSResolver<
      ConfigDriver['prototype']["async"],
      inferType<Shapes>
    >;
  }

  /**
   * Defines/overwrites all configuration values
   * @param values - Complete set of configuration values
   * @returns Operation result (type depends on driver's async flag)
   */
  public define(values: TshViewer<ConfigJSPartials<inferType<Shapes>>>) {
    const filtered = Object.keys(values).reduce(
      (acc: any, key) => {
        if (key in this.shapes) {
          acc[key] = this.shapes[key];
        }
        return acc;
      },
      {} as Partial<typeof this.shapes>,
    );

    return this.driver.insert(
      filtered as never,
      values as never,
    ) as ConfigJSResolver<ConfigDriver['prototype']["async"], boolean>;
  }

  /**
   * Sets a configuration value
   * @param path - Dot-notation path to the configuration property
   * @param value - Value to set
   * @returns The set value (type depends on driver's async flag)
   */
  public set<Path extends ConfigJSPaths<Shapes>>(
    path: Path,
    value: ConfigJSResource<Shapes, Path>,
  ) {
    const schema = this.getSchema(path);
    return this.driver.set(
      schema as never,
      value as never,
    ) as ConfigJSResolver<ConfigDriver['prototype']["async"], ConfigJSResource<Shapes, Path>>;
  }

  /**
   * Deletes a configuration value
   * @param path - Dot-notation path to the configuration property
   * @returns Operation result (type depends on driver's async flag)
   */
  public del<Path extends ConfigJSPaths<Shapes>>(path: Path) {
    const schema = this.getSchema(path);
    return this.driver.del(schema as never);
  }

  /**
   * Gets all available configuration paths
   * @returns Array of dot-notation paths to all configuration properties
   */
  public keys(): ConfigJSPaths<Shapes>[] {
    const result: string[] = [];

    const collectKeys = (obj: any, prefix = "") => {
      Object.keys(obj).forEach((key) => {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        if (obj[key] instanceof AbstractShape) {
          result.push(fullPath);
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          collectKeys(obj[key], fullPath);
        }
      });
    };

    collectKeys(this.shapes);
    return result as ConfigJSPaths<Shapes>[];
  }

  /**
   * Checks if configuration properties exist
   * @param ConfigJSPaths - One or more dot-notation paths to check
   * @returns Operation result (type depends on driver's async flag)
   */
  public has<Path extends ConfigJSPaths<Shapes>>(...ConfigJSPaths: Path[]) {
    const schemas = ConfigJSPaths.map((p) => this.getSchema(p));
    return this.driver.has(...(schemas as never[]));
  }

  /**
   * Loads configuration data with optional driver-specific options
   * @param opts - Optional driver-specific configuration options
   * @returns Operation result (type depends on driver's async flag)
   */
  public load<DriverConfig extends ConfigDriver['prototype']["config"]>(
    opts: Partial<DriverConfig> = {},
  ) {
    this.cached = {};
    if ('cache' in this.driver) this.driver.cache = {};
    if ('cached' in this.driver) this.driver.cached = {};
    this.config = {
      ...this.config,
      ...opts,
    };

    const getAllShapes = (obj: any): AbstractShape<any>[] => {
      return Object.values(obj).flatMap((value) =>
        value instanceof AbstractShape
          ? [value]
          : typeof value === "object" && value !== null
            ? getAllShapes(value)
            : [],
      );
    };

    return this.driver.load(getAllShapes(this.shapes) as never);
  }

  /**
   * Saves the current configuration state
   * @returns Operation result (type depends on driver's async flag)
   */
  public save() {
    const getAllShapes = (obj: any): AbstractShape<any>[] => {
      return Object.values(obj).flatMap((value) =>
        value instanceof AbstractShape
          ? [value]
          : typeof value === "object" && value !== null
            ? getAllShapes(value)
            : [],
      );
    };

    return this.driver.save(getAllShapes(this.shapes) as never);
  }
}
