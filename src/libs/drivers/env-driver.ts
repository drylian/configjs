import { ConfigJSDriver } from '../driver';
import fs from 'node:fs';
import { StringShape, NumberShape, EnumShape, ArrayShape, BooleanShape, AbstractShape, ImportantCheck } from "../../shapes";
import { ConfigJS } from '../../ConfigJS';
import { getShapeDefault, type infer as InferShapeType } from '@caeljs/tsh';

const LINE = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\n]*))?.*$/gm;

const fileDelay = (path: string, instance: ConfigJS<any, any>, delay: number, save?: Record<string, string>) => {
    const cached_at = Number(instance.cached_at.toString());
    setTimeout(() => {
        if (save) {
            writeEnvFile(path, save);
        } else if (instance.cached_at === cached_at) {
            instance.cached = undefined;
        }
    }, delay);
};

const parseEnvContent = (content: string): Record<string, string> => {
    const env: Record<string, string> = {};
    content.replace(/\r\n?/g, '\n').replace(LINE, (_, key, dq, sq, unq) => {
        env[key] = dq ?? sq ?? unq?.trim() ?? "";
        return "";
    });
    return env;
};

const readEnvFile = (path: string): Record<string, string> => {
    if (!fs.existsSync(path)) return {};
    const content = fs.readFileSync(path, "utf8");
    return parseEnvContent(content);
};

const writeEnvFile = (path: string, data: Record<string, string>) => {
    const existing = readEnvFile(path);
    const merged = { ...existing, ...data };

    const entries = Object.entries(merged)
        .filter(([_, v]) => v !== undefined)
        .map(([key, value]) => {
            const sanitized = value
                .replace(/\\/g, '\\\\')
                .replace(/\n/g, '\\n')
                .replace(/"/g, '\\"');
            return `${key}="${sanitized}"`;
        });

    fs.writeFileSync(path, entries.join("\n") + "\n", "utf8");
};

const convertEnvValue = (shape: AbstractShape<any>, value: string): any => {
    try {
        if (shape instanceof ArrayShape) {
            return JSON.parse(value);
        }
        if ('coerce' in shape && typeof shape.coerce === 'function') {
            return shape.coerce().parse(value);
        }
        return shape.parse(value);
    } catch (error) {
        throw error;
    }
};

export const envDriver = new ConfigJSDriver({
    async: false,
    supported: [StringShape, NumberShape, EnumShape, ArrayShape, BooleanShape],

    supported_check(shape) {
        return this.driver.supported.some(Supported => shape instanceof Supported);
    },

    config: {
        /**
         * File locale of env
         */
        filepath: ".env",
        /**
         * Allow to inject config in processEnv
         * e.g:
         * 
         * ```ts
         * process.env["key"] = true // is same instance.set("key", true)
         *  
         * // and
         * 
         * process.env["key"] // is same instance.get("key")
         * 
         * // Warning: Node JS not support this feature
         * ```
         */
        processEnv: typeof Bun !== "undefined" ? true : false,
        /**
         * When reading the env or saving it using the config,
         * the driver caches the env information for milliseconds,
         * so as not to need to reread/save it several times in
         * a few milliseconds of time.
         * @default 100
         */
        delay: 100,
    },

    get(shape) {
        const conf = shape.conf();
        if (!this.driver.supported_check.bind(this)(shape)) {
            console.warn(`[EnvDriver] Unsupported shape: ${shape._prop}`);
            return getShapeDefault(shape);
        }
        const contents = this.cached ?? readEnvFile(this.config.filepath);
        if (!this.cached) this.cached = contents;

        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);

        const rawValue = contents[conf.prop] ?? contents[conf.key];
        try {
            return rawValue !== undefined ? convertEnvValue(shape, rawValue) : getShapeDefault(shape);
        } catch (err) {
            console.warn(`[EnvDriver] Error parsing "${shape._prop}": ${(err as Error).message}`);
            return getShapeDefault(shape);
        }
    },

    set(shape, value) {
        if (!this.driver.supported_check.bind(this)(shape)) {
            console.warn(`[EnvDriver] Unsupported shape: ${shape._prop}`);
            return value;
        }
        const contents = this.cached ?? readEnvFile(this.config.filepath);
        if (!this.cached) this.cached = contents;

        let valueToStore: string;
        try {
            valueToStore = shape instanceof ArrayShape
                ? JSON.stringify(value)
                : shape instanceof BooleanShape
                    ? (value ? 'true' : 'false')
                    : String(value);

            this.cached[shape._prop] = valueToStore;
            fileDelay(this.driver.config.filepath, this, this.driver.config.delay, { [shape._prop]: valueToStore });
            return value;
        } catch (error) {
            console.error(`[EnvDriver] Error setting "${shape._prop}":`, error);
            throw error;
        }
    },

    del(shape) {
        const contents = this.cached ?? readEnvFile(this.config.filepath);
        if (!this.cached) this.cached = contents;

        delete contents[shape._prop];
        delete contents[shape._key];
        delete this.cached[shape._prop];
        delete this.cached[shape._key];

        writeEnvFile(this.config.filepath, contents);

        if (this.config.processEnv) {
            delete process.env[shape._prop];
        }

        return true;
    },

    has(shape) {
        const contents = this.cached ?? readEnvFile(this.config.filepath);
        if (!this.cached) this.cached = contents;

        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);

        return shape._prop in contents || shape._prop in process.env;
    },

    save() {
        return true;
    },

    //@ts-expect-error
    insert(this: ConfigJS<ConfigJSDriver<false, any, any>, Record<string, AbstractShape<any>>>, object_shape: Record<string, AbstractShape<any>>, values: Record<string, InferShapeType<AbstractShape<any>>>, updates: Record<string, any>) {
        if (!values || typeof values !== 'object') {
            console.warn('[EnvDriver] Insert requires an object');
            return false;
        }

        updates = updates ?? (this.cached ?? readEnvFile(this.config.filepath));
        if (!this.cached) this.cached = updates;

        try {
            for (const key in values) {
                const shape_or_obj = object_shape[key];
                const val = values[key];

                if (shape_or_obj instanceof AbstractShape) {
                    if (!this.driver.supported_check.bind(this)(shape_or_obj)) {
                        console.warn(`[EnvDriver] Unsupported shape for key: ${key}`);
                        continue;
                    }

                    let envValue = shape_or_obj instanceof ArrayShape
                        ? JSON.stringify(shape_or_obj.parse(val))
                        : shape_or_obj instanceof BooleanShape
                            ? (shape_or_obj.parse(val) ? 'true' : 'false')
                            : String(shape_or_obj.parse(val));

                    updates[shape_or_obj.conf().prop] = envValue;

                    if (this.config.processEnv) {
                        process.env[shape_or_obj.conf().prop] = envValue;
                    }
                } else if (typeof shape_or_obj === 'object' && shape_or_obj !== null) {
                    this.driver.insert.bind(this)(shape_or_obj, val, updates);
                }
            }

            fileDelay(this.driver.config.filepath, this, this.driver.config.delay, updates);
            return true;
        } catch (error) {
            console.error('[EnvDriver] Insert operation error:', error);
            return false;
        }
    },

    root(object_shape, contented?: Record<string, any>) {
        const contents = contented ?? (this.cached ?? readEnvFile(this.config.filepath));
        if (!this.cached) this.cached = contents;

        const result: any = {};

        for (const key in object_shape) {
            const shape = object_shape[key];

            if (shape instanceof AbstractShape) {
                if (!this.driver.supported_check.bind(this)(shape)) {
                    console.warn(`[EnvDriver] Unsupported shape for: ${key}`);
                    continue;
                }

                const conf = shape.conf();
                const rawValue = contents[conf.prop] ?? contents[conf.key];

                try {
                    result[key] = rawValue !== undefined
                        ? convertEnvValue(shape, rawValue)
                        : getShapeDefault(shape);
                } catch (err) {
                    console.warn(`[EnvDriver] Parse error for ${key}, using default.`);
                    result[key] = getShapeDefault(shape);
                }
            } else if (typeof shape === 'object' && shape !== null) {
                //@ts-expect-error recursive
                result[key] = this.driver.root.bind(this)(shape, contents);
            } else {
                result[key] = shape;
            }
        }

        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);
        return result;
    },

    load(shapes) {
        if (this.config.processEnv) {
            for (const shape of shapes) {
                const conf = shape.conf();
                if (!this.driver.supported_check.bind(this)(shape)) continue;
                Object.defineProperty(process.env, conf.prop, {
                    get: () => this.get(conf.key),
                    set: (val) => this.set(conf.key, val),
                    enumerable: true,
                    configurable: true,
                });
            }
        }

        for (const shape of shapes) {
            if (!this.driver.supported_check.bind(this)(shape)) continue;
            const conf = shape.conf();
            const contents = readEnvFile(this.config.filepath);
            const rawValue = contents[conf.prop] ?? contents[conf.key];

            if (rawValue === undefined && conf.save_default) {
                this.set(conf.key, getShapeDefault(shape));
            }

            ImportantCheck.bind(this as never)(rawValue ?? getShapeDefault(shape));
        }

        return true;
    },
});
