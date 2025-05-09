import type { ConfigJS } from "../../ConfigJS";
import { AbstractConfigJSDriver } from "../driver";
import {
    BooleanShape,
    StringShape,
    NumberShape,
    EnumShape,
    ArrayShape,
    getShapeDefault,
    AbstractShape,
    type InferShapeType
} from '@caeljs/tsh';
import { readFileSync, writeFileSync, statSync, existsSync } from "fs";
import { ImportantCheck, type ConfigPrimitives } from "../../shapes";

export type JsonDriverConfiguration = {
    filepath: string;
    processEnv: boolean;
    cached: boolean;
    cacheTime?: number;
    autoRefresh?: boolean;
    pretty?: boolean | number; // Added pretty option
};

export class JsonDriver extends AbstractConfigJSDriver<false, JsonDriverConfiguration> {
    public readonly async = false as const;
    public supported = [StringShape, NumberShape, EnumShape, ArrayShape, BooleanShape] as never;

    private cache: Record<string, any> = {};
    private lastCacheUpdate = 0;
    private lastFileCheck = 0;
    private fileModifiedTime = 0;

    constructor(ins: ConfigJS<typeof AbstractConfigJSDriver<boolean, any>, any>) {
        super(ins, {
            filepath: "config.json",
            cached: true,
            processEnv: typeof Bun !== "undefined",
            cacheTime: 1000 * 60 * 5,
            autoRefresh: true,
            pretty: 2 // Default to 2-space indentation
        });
        
        if (this.config.cached) {
            this.loadCache(true);
        }
    }

    private stringify(data: any): string {
        const spaces = typeof this.config.pretty === 'number' 
            ? this.config.pretty 
            : this.config.pretty ? 2 : undefined;
        return JSON.stringify(data, null, spaces);
    }

    private loadCache(force = false): void {
        const now = Date.now();
        if (!force && !this.isCacheExpired() &&
            (!this.config.autoRefresh || !this.hasFileChanged())) return;

        try {
            const content = readFileSync(this.config.filepath, "utf8");
            this.cache = JSON.parse(content);
            this.lastCacheUpdate = now;
            if (this.config.autoRefresh) this.updateFileStats();
        } catch {
            this.cache = {};
        }
    }

    private isCacheExpired(): boolean {
        return this.config.cacheTime
            ? Date.now() - this.lastCacheUpdate > this.config.cacheTime
            : false;
    }

    private hasFileChanged(): boolean {
        if (!this.config.autoRefresh) return false;
        const now = Date.now();
        if (now - this.lastFileCheck < 1000) return false;
        this.lastFileCheck = now;
        try {
            const stats = statSync(this.config.filepath);
            return stats.mtimeMs > this.fileModifiedTime;
        } catch {
            return false;
        }
    }

    private updateFileStats(): void {
        try {
            const stats = statSync(this.config.filepath);
            this.fileModifiedTime = stats.mtimeMs;
        } catch {
            this.fileModifiedTime = 0;
        }
    }

    public clearCache(): void {
        this.cache = {};
        this.lastCacheUpdate = 0;
    }

    save(): boolean {
        if (this.config.cached) {
            writeFileSync(this.config.filepath, this.stringify(this.cache), "utf8");
            this.lastCacheUpdate = Date.now();
            if (this.config.autoRefresh) this.updateFileStats();
        }
        return true;
    }

    del(shape: ConfigPrimitives): boolean {
        const key = shape._prop;

        if (this.config.cached) {
            this.loadCache();
            delete this.cache[key];
            this.save();
        } else {
            const parsed = JSON.parse(readFileSync(this.config.filepath, "utf8"));
            delete parsed[key];
            writeFileSync(this.config.filepath, this.stringify(parsed), "utf8");
        }

        if (this.config.processEnv) {
            delete process.env[key];
        }

        return true;
    }

    get(shape: ConfigPrimitives) {
        const conf = shape.conf();

        const data = this.config.cached
            ? (this.loadCache(), this.cache)
            : JSON.parse(readFileSync(this.config.filepath, "utf8"));

        const rawValue = data[conf.prop] ?? data[(conf as any).key];
        if (rawValue === undefined) return getShapeDefault(shape);

        try {
            return shape.parse(rawValue);
        } catch (err) {
            console.warn(`[JsonDriver] Error parsing "${conf.prop}": ${err instanceof Error ? err.message : err}`);
            return getShapeDefault(shape);
        }
    }

    set(shape: ConfigPrimitives, value: InferShapeType<ConfigPrimitives>) {
        if (!this.check(shape)) {
            console.warn(`[JsonDriver] Unsupported shape: ${shape._prop}`);
            return value;
        }

        const parsed = shape.parse(value);

        if (this.config.cached) {
            this.loadCache();
            this.cache[shape._prop] = parsed;
            this.save();
        } else {
            const parsedFile = JSON.parse(readFileSync(this.config.filepath, "utf8"));
            parsedFile[shape._prop] = parsed;
            writeFileSync(this.config.filepath, this.stringify(parsedFile), "utf8");
        }

        return parsed;
    }

    has(...shapes: ConfigPrimitives[]): boolean {
        const data = this.config.cached
            ? (this.loadCache(), this.cache)
            : JSON.parse(readFileSync(this.config.filepath, "utf8"));

        return shapes.every(shape => shape._prop in data && !!data[shape._prop]);
    }

    insert(shapeMap: Record<string, ConfigPrimitives>, values: Record<string, any>): boolean {
        if (this.config.cached) this.loadCache();

        const target = this.config.cached
            ? this.cache
            : JSON.parse(readFileSync(this.config.filepath, "utf8"));

        const process = (
            shapeLevel: Record<string, ConfigPrimitives>,
            valueLevel: Record<string, any>,
            prefix = ""
        ) => {
            for (const key in valueLevel) {
                const shape = shapeLevel[key];
                const value = valueLevel[key];
                if (!shape) continue;

                if (typeof shape === "object" && !(shape instanceof AbstractShape)) {
                    process(shape, value, `${prefix}${key}.`);
                } else {
                    target[shape.conf().prop] = shape.parse(value);
                }
            }
        };

        process(shapeMap, values);

        if (this.config.cached) {
            this.save();
        } else {
            writeFileSync(this.config.filepath, this.stringify(target), "utf8");
        }

        return true;
    }

    root(shapeMap: Record<string, ConfigPrimitives>, contents?: Record<string, any>): Record<string, any> {
        if (this.config.cached && !contents) this.loadCache();
        const data = contents ?? (this.config.cached ? this.cache : JSON.parse(readFileSync(this.config.filepath, "utf8")));

        const parseVal = (shape: ConfigPrimitives, raw: any): any => {
            try {
                return shape.parse(raw ?? getShapeDefault(shape));
            } catch {
                return getShapeDefault(shape);
            }
        };

        const process = (
            shapeLevel: Record<string, ConfigPrimitives>,
            dataLevel: Record<string, any>,
            prefix = ""
        ): Record<string, any> => {
            const result: Record<string, any> = {};

            for (const key in shapeLevel) {
                const shape = shapeLevel[key];

                if (typeof shape === "object" && !(shape instanceof AbstractShape)) {
                    result[key] = process(shape, dataLevel, `${prefix}${key}.`);
                } else {
                    result[key] = parseVal(shape, dataLevel[shape.conf().prop]);
                }
            }

            return result;
        };

        return process(shapeMap, data);
    }

    load(shapes: ConfigPrimitives[]): boolean {
        if(!existsSync(this.config.filepath) || readFileSync(this.config.filepath,"utf8") == "") {
            writeFileSync(this.config.filepath, this.stringify({}),"utf8")
        }
        if (!this.cache) this.cache = {};
        if (this.config.cached) this.loadCache(true);

        if (this.config.processEnv) {
            for (const shape of shapes) {
                const conf = shape.conf();
                Object.defineProperty(process.env, conf.prop, {
                    get: () => this.get(shape),
                    set: val => this.set(shape, val),
                    enumerable: true,
                    configurable: true
                });
            }
        }

        for (const shape of shapes) {
            const conf = shape.conf();
            const value = this.get(shape);

            if (value === getShapeDefault(shape) && conf.save_default) {
                this.set(shape, value);
            }

            ImportantCheck.bind(shape)(value);
        }

        return true;
    }
}

export const jsonDriver = JsonDriver;