import { BaseShape } from "./libs/shapes/base-shape";
export * from "./libs/factory";
export * from "./libs/drivers/env-driver";
export * from "./libs/driver";
export * from "./libs/error";
export * from "./libs/types";
import { type AnyConfigDriver, type AnyConfigJSNestedShapes, type ConfigJSPaths, type ConfigJSResult, type GetValueType, type ConfigInferNestedType } from "./libs/types";

export class ConfigJS<const ConfigDriver extends AnyConfigDriver<boolean, any>, Shapes extends AnyConfigJSNestedShapes> {
    public readonly async: ConfigDriver['async'];
    public readonly cached: ConfigInferNestedType<Shapes>;
    public readonly shapes: Shapes;

    constructor(public readonly driver: ConfigDriver & { async: ConfigDriver['async'] }, shapes: Shapes) {
        this.processShapes(shapes);
        this.shapes = shapes;
        this.cached = {} as ConfigInferNestedType<Shapes>;
        this.async = this.driver.async;
    }

    private processShapes(shapes: AnyConfigJSNestedShapes, prefix = '') {
        Object.keys(shapes).forEach(key => {
            const fullPath = prefix ? `${prefix}.${key}` : key;
            const shapeOrShapes = shapes[key];
            
            if (shapeOrShapes instanceof BaseShape) {
                if (shapeOrShapes._prop === "_unconfigured_property") {
                    shapeOrShapes.prop(fullPath);
                }
                shapeOrShapes._key = fullPath;
            } else if (typeof shapeOrShapes === 'object' && shapeOrShapes !== null) {
                this.processShapes(shapeOrShapes, fullPath);
            }
        });
    }

    public getSchema<Path extends ConfigJSPaths<Shapes>>(path: Path) {
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
        
        return current;
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
        return this.driver.get.bind(this)(schema) as ConfigJSResult<typeof this.async, GetValueType<Shapes, Path>>;
    }

    public set<Path extends ConfigJSPaths<Shapes>>(
        path: Path,
        value: GetValueType<Shapes, Path>
    ) {
        const schema = this.getSchema(path);
        return this.driver.set.bind(this)(schema, value as never) as ConfigJSResult<typeof this.async, ConfigInferNestedType<Shapes>[Path]>;
    }

    public del<Path extends ConfigJSPaths<Shapes>>(path: Path){
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