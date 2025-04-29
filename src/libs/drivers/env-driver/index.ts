import type { ConfigJS } from "../../../ConfigJS";
import { AbstractConfigJSDriver } from "../../driver";
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
import { readFileSync, writeFileSync, statSync } from "fs";
import { ImportantCheck, type ConfigPrimitives } from "../../../shapes";
import { env } from "./env";

export type EnvDriverConfiguration = {
    filepath: string;
    processEnv: boolean;
    cached: boolean;
    cacheTime?: number;
    autoRefresh?: boolean;
};

export class EnvDriver extends AbstractConfigJSDriver<false, EnvDriverConfiguration> {
    public readonly async = false as const;
    public supported = [StringShape, NumberShape, EnumShape, ArrayShape, BooleanShape] as never;

    private cache: Record<string, any> = {};
    private lastCacheUpdate: number = 0;
    private lastFileCheck: number = 0;
    private fileModifiedTime: number = 0;

    constructor(ins: ConfigJS<typeof AbstractConfigJSDriver<boolean, any>, any>) {
        super(ins, {
            filepath: ".env",
            cached: true,
            processEnv: typeof Bun !== "undefined",
            cacheTime: 1000 * 60 * 5,
            autoRefresh: true
        });

        if (this.config.cached) {
            this.loadCache(true);
        }
    }

    private loadCache(force = false): void {
        const now = Date.now();

        if (!force && !this.isCacheExpired() &&
            (!this.config.autoRefresh || !this.hasFileChanged())) {
            return;
        }

        try {
            const content = readFileSync(this.config.filepath, "utf8");
            this.cache = env.parse(content);
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
            writeFileSync(this.config.filepath, env.stringify(this.cache), "utf8");
            this.lastCacheUpdate = Date.now();
            if (this.config.autoRefresh) this.updateFileStats();
        }
        return true;
    }

    del(shape: ConfigPrimitives): boolean {
        if (this.config.cached) {
            this.loadCache();
            delete this.cache[shape._prop];
            this.save();
        } else {
            const content = readFileSync(this.config.filepath, "utf8");
            const parsed = env.parse(content);
            delete parsed[shape._prop];
            writeFileSync(this.config.filepath, env.stringify(parsed), "utf8");
        }

        if (this.config.processEnv) {
            delete process.env[shape._prop];
        }

        return true;
    }

    get(shape: ConfigPrimitives) {
        const conf = shape.conf();

        const source = this.config.cached
            ? (this.loadCache(), this.cache)
            : env.parse(readFileSync(this.config.filepath, "utf8"));

        const rawValue = source[conf.prop] ?? source[(conf as any).key];
        if (rawValue === undefined) return getShapeDefault(shape);

        try {
            return shape.parse(rawValue);
        } catch (err) {
            console.warn(`[EnvDriver] Error parsing "${conf.prop}": ${err instanceof Error ? err.message : err}`);
            return getShapeDefault(shape);
        }
    }

    set(shape: ConfigPrimitives, value: InferShapeType<ConfigPrimitives>) {
        if (!this.check(shape)) {
            console.warn(`[EnvDriver] Unsupported shape: ${shape._prop}`);
            return value;
        }

        const parsedValue = shape.parse(value);
        const serialized = env.stringify(parsedValue);

        if (this.config.cached) {
            this.loadCache();
            this.cache[shape._prop] = parsedValue;
            this.save();
        } else {
            const content = readFileSync(this.config.filepath, "utf8");
            const parsed = env.parse(content);
            parsed[shape._prop] = parsedValue;
            writeFileSync(this.config.filepath, env.stringify(parsed), "utf8");
        }

        return parsedValue;
    }

    has(...shapes: ConfigPrimitives[]): boolean {
        const data = this.config.cached
            ? (this.loadCache(), this.cache)
            : env.parse(readFileSync(this.config.filepath, "utf8"));

        return shapes.every(shape => shape._prop in data);
    }

    insert(shapeMap: Record<string, ConfigPrimitives>, values: Record<string, any>): boolean {
        if (this.config.cached) this.loadCache();

        const target = this.config.cached
            ? this.cache
            : env.parse(readFileSync(this.config.filepath, "utf8"));

        const processValue = (shape: ConfigPrimitives, value: any): any => {
            if (!this.check(shape)) {
                console.warn("[EnvDriver] Unsupported shape");
                return undefined;
            }
            return shape.parse(value);
        };

        const processLevel = (
            shapeLevel: Record<string, ConfigPrimitives>,
            valueLevel: Record<string, any>,
            prefix = ""
        ) => {
            for (const key in valueLevel) {
                const shape = shapeLevel[key];
                const val = valueLevel[key];

                if (!shape) continue;

                if (typeof shape === "object" && !(shape instanceof AbstractShape)) {
                    processLevel(shape, val, `${prefix}${key}.`);
                } else {
                    const parsed = processValue(shape, val);
                    const propName = shape.conf().prop;
                    target[propName] = parsed;
                }
            }
        };

        processLevel(shapeMap, values);

        if (!this.config.cached) {
            writeFileSync(this.config.filepath, env.stringify(target), "utf8");
        } else {
            this.save();
        }

        return true;
    }

    root(shapeMap: Record<string, ConfigPrimitives>, contents?: Record<string, string>): Record<string, any> {
        if (this.config.cached && !contents) this.loadCache();

        const data = contents ?? (this.config.cached ? this.cache : env.parse(readFileSync(this.config.filepath, "utf8")));

        const parseVal = (shape: ConfigPrimitives, raw: any): any => {
            try {
                return shape.parse(raw ?? getShapeDefault(shape));
            } catch {
                return getShapeDefault(shape);
            }
        };

        const processLevel = (
            shapeLevel: Record<string, ConfigPrimitives>,
            dataLevel: Record<string, any>,
            prefix = ""
        ): Record<string, any> => {
            const level: Record<string, any> = {};

            for (const key in shapeLevel) {
                const shape = shapeLevel[key];

                if (typeof shape === "object" && !(shape instanceof AbstractShape)) {
                    level[key] = processLevel(shape, dataLevel, `${prefix}${key}.`);
                } else {
                    const propName = shape.conf().prop;
                    level[key] = parseVal(shape, dataLevel[propName]);
                }
            }

            return level;
        };

        return processLevel(shapeMap, data);
    }

    load(shapes: ConfigPrimitives[]): boolean {
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

export const envDriver = EnvDriver;
