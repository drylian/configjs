import { processShapes } from "./libs/functions";
import { BaseShape } from "./libs/shapes/base-shape";
export * from "./libs/factory";
export * from "./libs/error";
export * from "./libs/types";
export * from "./libs/shapes/array-shape";
export * from "./libs/shapes/base-abstract";
export * from "./libs/shapes/base-shape";
export * from "./libs/shapes/boolean-shape";
export * from "./libs/shapes/enum-shape";
export * from "./libs/shapes/number-shape";
export * from "./libs/shapes/object-shape";
export * from "./libs/shapes/record-shape";
export * from "./libs/shapes/string-shape";
export * from "./libs/driver";
export * from "./libs/drivers";
import { type AnyConfigDriver, type AnyConfigJSNestedShapes, type ConfigJSPaths, type ConfigJSResult, type GetValueType, type ConfigInferNestedType, type ConfigJSRootPaths, type RecursiveConfigJSResult } from "./libs/types";

export class ConfigJS<const ConfigDriver extends AnyConfigDriver<boolean, any>, Shapes extends AnyConfigJSNestedShapes> {
    /** Internal cache */
    #cache: any;
    /**
     * Information cached by the driver,
     * normally information not processed
     * by the shapes, raw data.
     */
    public get cached() {
        return this.#cache;
    };
    public set cached(data) {
        this.#cache = data;
        this.cached_at = Date.now();
    }
    /**
     * Last update of cache
     */
    public cached_at = 0;
    public readonly async: ConfigDriver['async'];
    public readonly shapes: Shapes;

    constructor(public readonly driver: ConfigDriver & { async: ConfigDriver['async'] }, shapes: Shapes) {
        processShapes(shapes);
        this.shapes = shapes;
        this.async = this.driver.async;
    }

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

    public get config() {
        return this.driver.config;
    }

    public set config(value) {
        this.driver.config = value;
    }

    public conf<Path extends ConfigJSPaths<Shapes>>(path: Path) {
        const schema = this.getSchema(path);
        return schema.conf();
    }

    public get<Path extends ConfigJSPaths<Shapes>>(path: Path) {
        const schema = this.getSchema(path);
        return this.driver.get.bind(this)(schema) as ConfigJSResult<ConfigDriver['async'], GetValueType<Shapes, Path>>;
    }

    public insert<Path extends ConfigJSRootPaths<Shapes>>(path: Path, values: RecursiveConfigJSResult<Shapes, Path>) {
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
        return this.driver.insert.bind(this)(current, values as never) as ConfigJSResult<ConfigDriver['async'], boolean>;
    }

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
        return this.driver.root.bind(this)(current) as ConfigJSResult<ConfigDriver['async'], RecursiveConfigJSResult<Shapes, Path>>;
    }

    public set<Path extends ConfigJSPaths<Shapes>>(
        path: Path,
        value: GetValueType<Shapes, Path>
    ) {
        const schema = this.getSchema(path);
        return this.driver.set.bind(this)(schema, value as never) as ConfigJSResult<ConfigDriver['async'], ConfigInferNestedType<Shapes>[Path]>;
    }

    public del<Path extends ConfigJSPaths<Shapes>>(path: Path) {
        const schema = this.getSchema(path);
        return this.driver.del.bind(this)(schema);
    }

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

    public has<Path extends ConfigJSPaths<Shapes>>(...ConfigJSPaths: Path[]) {
        const schemas = ConfigJSPaths.map(p => this.getSchema(p));
        return this.driver.has.bind(this)(...schemas);
    }

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