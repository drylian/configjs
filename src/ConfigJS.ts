import { processShapes } from "./libs/functions";
import { BaseShape } from "./libs/shapes/base-shape";
export * from "./libs/factory";
export * from "./libs/error";
export * from "./libs/types";
export * from "./libs/functions";
export * from "./libs/shapes/array-shape";
export * from "./libs/shapes/abstract-shape";
export * from "./libs/shapes/base-shape";
export * from "./libs/shapes/boolean-shape";
export * from "./libs/shapes/enum-shape";
export * from "./libs/shapes/number-shape";
export * from "./libs/shapes/object-shape";
export * from "./libs/shapes/record-shape";
export * from "./libs/shapes/string-shape";
export * from "./libs/shapes/any-shape";
export * from "./libs/shapes/union-shape";
export * from "./libs/driver";
export * from "./libs/drivers";
import { type AnyConfigDriver, type AnyConfigJSNestedShapes, type ConfigJSPaths, type ConfigJSResult, type GetValueType, type ConfigInferNestedType, type ConfigJSRootPaths, type RecursiveConfigJSResult, type InferShapeType, type ShapeViewer, type ConfigDeepPartial } from "./libs/types";

/**
 * Configuration management class that provides a type-safe interface
 * for accessing and manipulating configuration values using shapes.
 * 
 * @template ConfigDriver - The driver type used for configuration storage
 * @template Shapes - The nested shapes structure defining the configuration schema
 */
export class ConfigJS<const ConfigDriver extends AnyConfigDriver<boolean, any>, Shapes extends AnyConfigJSNestedShapes> {
    /** Internal cache */
    #cache: any;
    
    /**
     * Gets the cached raw data from the driver
     */
    public get cached() {
        return this.#cache;
    };
    
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
    public readonly async: ConfigDriver['async'];
    
    /**
     * The shapes structure defining the configuration schema
     */
    public readonly shapes: Shapes;

    /**
     * Creates a new ConfigJS instance
     * @param driver - The configuration driver to use
     * @param shapes - The nested shapes structure defining the configuration schema
     */
    constructor(public readonly driver: ConfigDriver & { async: ConfigDriver['async'] }, shapes: Shapes) {
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
    public getSchema<Path extends ConfigJSPaths<Shapes>>(path: Path): Shapes[Path] extends BaseShape<any> ? Shapes[Path] : BaseShape<any> {
        const parts = path.split('.');
        let current: any = this.shapes;

        for (const part of parts) {
            if (!current || !(part in current)) {
                throw `[ConfigJS]: Key property "${path}" not found in shapes of config instance`;
            }
            current = current[part];
        }

        if (!(current instanceof BaseShape)) {
            throw `[ConfigJS]: Property "${path}" is not a configuration property`;
        }

        return current as never;
    }

    /**
     * Gets the driver's configuration options
     */
    public get config() {
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
    public conf<Path extends ConfigJSPaths<Shapes>>(path: Path) {
        const schema = this.getSchema(path);
        return schema.conf();
    }

    /**
     * Gets a configuration value
     * @param path - Dot-notation path to the configuration property
     * @returns The configuration value (type depends on driver's async flag)
     */
    public get<Path extends ConfigJSPaths<Shapes>>(path: Path) {
        const schema = this.getSchema(path);
        return this.driver.get.bind(this)(schema) as ConfigJSResult<ConfigDriver['async'], GetValueType<Shapes, Path>>;
    }

    /**
     * Inserts values into a root configuration property
     * @param path - Dot-notation path to the root configuration property
     * @param values - Values to insert (must match the shape structure)
     * @returns Operation result (type depends on driver's async flag)
     * @throws If the path is invalid or points to a non-root property
     */
    public insert<Path extends ConfigJSRootPaths<Shapes>>(path: Path, values: ShapeViewer<ConfigDeepPartial<RecursiveConfigJSResult<Shapes, Path>>>) {
        const parts = path.split('.');
        let current: any = this.shapes;

        for (const part of parts) {
            if (!current || !(part in current)) {
                throw `[ConfigJS]: Key property "${path}" not found in shapes of config instance`;
            }
            current = current[part];
        }

        if ((current instanceof BaseShape)) {
            throw `[ConfigJS]: Property "${path}" is not a root property`;
        }

        const filtered = Object.keys(values).reduce((acc:any, key) => {
            if (key in current) {
                acc[key] = current[key];
            }
            return acc;
        }, {} as Partial<typeof this.shapes>);

        return this.driver.insert.bind(this)(filtered, values as never) as ConfigJSResult<ConfigDriver['async'], boolean>;
    }

    /**
     * Gets all values from a root configuration property
     * @param path - Dot-notation path to the root configuration property
     * @returns All values under the specified path (type depends on driver's async flag)
     * @throws If the path is invalid or points to a non-root property
     */
    public root<Path extends ConfigJSRootPaths<Shapes>>(path: Path) {
        const parts = path.split('.');
        let current: any = this.shapes;

        for (const part of parts) {
            if (!current || !(part in current)) {
                throw `[ConfigJS]: Key property "${path}" not found in shapes of config instance`;
            }
            current = current[part];
        }

        if ((current instanceof BaseShape)) {
            throw `[ConfigJS]: Property "${path}" is not a root property`;
        }
        return this.driver.root.bind(this)(current) as ConfigJSResult<ConfigDriver['async'], ConfigDeepPartial<RecursiveConfigJSResult<Shapes, Path>>>;
    }

    /**
     * Gets all configuration values
     * @returns All configuration values (type depends on driver's async flag)
     */
    public all() {
        return this.driver.root.bind(this)(this.shapes as never) as ConfigJSResult<
            ConfigDriver['async'],
            InferShapeType<Shapes>
        >;
    }

    /**
     * Defines/overwrites all configuration values
     * @param values - Complete set of configuration values
     * @returns Operation result (type depends on driver's async flag)
     */
    public define(values: ShapeViewer<ConfigDeepPartial<InferShapeType<Shapes>>>) {
        const filtered = Object.keys(values).reduce((acc:any, key) => {
            if (key in this.shapes) {
                acc[key] = this.shapes[key];
            }
            return acc;
        }, {} as Partial<typeof this.shapes>);
    
        return this.driver.insert.bind(this)(filtered as never, values as never) as ConfigJSResult<ConfigDriver['async'], boolean>;
    }

    /**
     * Sets a configuration value
     * @param path - Dot-notation path to the configuration property
     * @param value - Value to set
     * @returns The set value (type depends on driver's async flag)
     */
    public set<Path extends ConfigJSPaths<Shapes>>(
        path: Path,
        value: GetValueType<Shapes, Path>
    ) {
        const schema = this.getSchema(path);
        return this.driver.set.bind(this)(schema, value as never) as ConfigJSResult<ConfigDriver['async'], ConfigInferNestedType<Shapes>[Path]>;
    }

    /**
     * Deletes a configuration value
     * @param path - Dot-notation path to the configuration property
     * @returns Operation result (type depends on driver's async flag)
     */
    public del<Path extends ConfigJSPaths<Shapes>>(path: Path) {
        const schema = this.getSchema(path);
        return this.driver.del.bind(this)(schema);
    }

    /**
     * Gets all available configuration paths
     * @returns Array of dot-notation paths to all configuration properties
     */
    public keys(): ConfigJSPaths<Shapes>[] {
        const result: string[] = [];

        const collectKeys = (obj: any, prefix = '') => {
            Object.keys(obj).forEach(key => {
                const fullPath = prefix ? `${prefix}.${key}` : key;
                if (obj[key] instanceof BaseShape) {
                    result.push(fullPath);
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
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
        const schemas = ConfigJSPaths.map(p => this.getSchema(p));
        return this.driver.has.bind(this)(...schemas);
    }

    /**
     * Loads configuration data with optional driver-specific options
     * @param opts - Optional driver-specific configuration options
     * @returns Operation result (type depends on driver's async flag)
     */
    public load<DriverConfig extends ConfigDriver['config']>(opts: Partial<DriverConfig> = {}) {
        this.config = {
            ...this.config,
            ...opts,
        };

        const getAllShapes = (obj: any): BaseShape<any>[] => {
            return Object.values(obj).flatMap(value =>
                value instanceof BaseShape
                    ? [value]
                    : typeof value === 'object' && value !== null
                        ? getAllShapes(value)
                        : []
            );
        };

        return this.driver.load.bind(this)(getAllShapes(this.shapes));
    }

    /**
     * Saves the current configuration state
     * @returns Operation result (type depends on driver's async flag)
     */
    public save() {
        const getAllShapes = (obj: any): BaseShape<any>[] => {
            return Object.values(obj).flatMap(value =>
                value instanceof BaseShape
                    ? [value]
                    : typeof value === 'object' && value !== null
                        ? getAllShapes(value)
                        : []
            );
        };

        return this.driver.save.bind(this)(getAllShapes(this.shapes));
    }
}