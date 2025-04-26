import { ConfigJSDriver } from '../driver';
import fs from 'node:fs';
import { type infer as InferShapeType, StringShape, NumberShape, EnumShape, ArrayShape, BooleanShape, AbstractShape, ImportantCheck } from "../../shapes";
import { ConfigJS } from '../../ConfigJS';
import { getShapeDefault } from '@caeljs/tsh';

const LINE = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\n]*))?.*$/gm;
const fileDelay = (path: string, instance: ConfigJS<any, any>, delay: number, save?: Record<string, string>) => {
    const cached_at = Number(instance.cached_at.toString());
    setTimeout(() => {
        if (save) {
            writeEnvFile(path, save);
        } else {
            if (instance.cached_at !== cached_at) return;
            instance.cached = undefined;
        }
    }, delay);
}

const parseEnvContent = (content: string): Record<string, string> => {
    const obj: Record<string, string> = {};
    content.replace(/\r\n?/g, '\n').replace(LINE, (_, key, dq, sq, unq) => {
        obj[key] = dq ?? sq ?? unq?.trim() ?? undefined;
        return "";
    });
    return obj;
};

const readEnvFile = (path: string): Record<string, string> => {
    if (!fs.existsSync(path)) return {};
    const content = fs.readFileSync(path, "utf8");
    return parseEnvContent(content);
};

const writeEnvFile = (path: string, data: Record<string, string>) => {
    const existing = readEnvFile(path);
    const content = Object.entries({ ...existing, ...data })
        .map(([key, value]) => {
            if (existing[key] && !data[key]) return `${key}=`;
            // Escape quotes and newlines in values
            const escapedValue = value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
            return `${key}="${escapedValue}"`;
        })
        .join("\n");

    fs.writeFileSync(path, content + "\n", "utf8");
};

const convertEnvValue = (shape: AbstractShape<any>, value: string): any => {
    try {
        // Special handling for array values
        if (shape instanceof ArrayShape) {
            return JSON.parse(value);
        }

        // For other shapes, use the parse method with coercion if available
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
        return this.driver.supported.some(SupportedShape => shape instanceof SupportedShape);
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
            console.warn(`[EnvDriver] Unsupported shape type for key: ${shape._prop}`);
            return getShapeDefault(shape);
        }
        const contents = Object(this.cached || readEnvFile(this.config.filepath)) as Record<string, string>;
        if (!this.cached) this.cached = contents;

        // update delay
        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);
        const rawValue = contents[conf.prop] ?? contents[conf.key];

        try {
            return rawValue !== undefined
                ? convertEnvValue(shape, rawValue) ?? getShapeDefault(shape)
                : getShapeDefault(shape);
        } catch (err) {
            const error = err as Error;
            console.warn(`[EnvDriver] Error parsing value for ${shape._prop}: ${error.message}`);
            return getShapeDefault(shape);
        }
    },

    set(shape, newValue) {
        if (!this.driver.supported_check.bind(this)(shape)) {
            console.warn(`[EnvDriver] Unsupported shape type for key: ${shape._prop}`);
            return newValue;
        }
        const contents = Object(this.cached || readEnvFile(this.config.filepath)) as Record<string, string>;
        if (!this.cached) this.cached = contents;
        try {
            let valueToStore: string = shape.parse(newValue);

            if (shape instanceof ArrayShape) {
                valueToStore = JSON.stringify(newValue);
            } else if (shape instanceof BooleanShape) {
                valueToStore = newValue ? 'true' : 'false';
            } else {
                valueToStore = String(newValue);
            }

            this.cached[shape._prop] = valueToStore;
            fileDelay(this.driver.config.filepath, this, this.driver.config.delay, { [shape._prop]: valueToStore });
            return newValue;
        } catch (error) {
            console.error(`[EnvDriver] Error setting value for "${shape._prop}" (key:${shape._key}):`, error);
            throw error;
        }
    },

    del(shape) {
        const contents = Object(this.cached || readEnvFile(this.config.filepath)) as Record<string, any>;
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
        const contents = Object(this.cached || readEnvFile(this.config.filepath)) as Record<string, any>;
        if (!this.cached) this.cached = contents;
        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);
        return shape._prop in contents || shape._prop in process.env;
    },

    save() {
        // not need, this is maked to use in async drivers
        return true;
    },

    //@ts-expect-error
    insert(this: ConfigJS<ConfigJSDriver<false, any, any>, Record<string, AbstractShape<any>>>, object_shape: Record<string, AbstractShape<any>>, values: Record<string, InferShapeType<AbstractShape<any>>>, updates: Record<string, any>) {
        if (!values || typeof values !== 'object') {
            console.warn('[EnvDriver] Insert requires an object of values');
            return false;
        }
        if (!updates) updates = Object(this.cached || readEnvFile(this.config.filepath)) as Record<string, string>;
        if (!this.cached) this.cached = updates;

        try {
            for (const key in values) {
                const property = key;
                const shape_or_object = object_shape[key];

                if (shape_or_object instanceof AbstractShape) {
                    const config = shape_or_object.conf();
                    if (!this.driver.supported_check.bind(this)(shape_or_object)) {
                        console.warn(`[EnvDriver] Unsupported shape type for key: ${property}`);
                        continue;
                    }

                    try {
                        const parsedValue = shape_or_object.parse(values[key]);
                        let envValue: string;

                        if (shape_or_object instanceof ArrayShape) {
                            envValue = JSON.stringify(parsedValue);
                        } else if (shape_or_object instanceof BooleanShape) {
                            envValue = parsedValue ? 'true' : 'false';
                        } else {
                            envValue = String(parsedValue);
                        }

                        updates[config.prop] = envValue;

                        if (this.config.processEnv) {
                            process.env[config.prop] = envValue;
                        }
                    } catch (err) {
                        const error = err as Error;
                        console.warn(`[EnvDriver] Error parsing value for ${property} (${config.prop}): ${error.message}`);
                        continue;
                    }
                } else if (typeof shape_or_object === 'object' && shape_or_object !== null) {
                    this.driver.insert.bind(this)(shape_or_object, values[key], updates);
                } else {
                    console.warn(`[EnvDriver] Invalid shape for key: ${property}`);
                    continue;
                }
            }

            fileDelay(this.driver.config.filepath, this, this.driver.config.delay, updates);
            return true;
        } catch (error) {
            console.error('[EnvDriver] Error in insert operation:', error);
            return false;
        }
    },

    root(object_shape, contented?: Record<string, any>) {
        const result: any = {};
        if (!contented) contented = Object(this.cached || readEnvFile(this.config.filepath)) as Record<string, string>;
        if (!this.cached) this.cached = contented;

        for (const key in object_shape) {
            const shape_or_object = object_shape[key];

            if (shape_or_object instanceof AbstractShape) {
                if (!this.driver.supported_check.bind(this)(shape_or_object)) {
                    console.warn(`[EnvDriver] Unsupported shape type for key: ${key}`);
                    continue;
                }

                const conf = shape_or_object.conf();
                const rawValue = contented[conf.prop] ?? contented[conf.key];

                try {
                    result[key] = rawValue !== undefined
                        ? convertEnvValue(shape_or_object, rawValue) ?? getShapeDefault(shape_or_object)
                        : getShapeDefault(shape_or_object);
                } catch (err) {
                    const error = err as Error;
                    console.warn(`[EnvDriver] Error parsing value for ${key}: ${error.message}, using default`);
                    result[key] = getShapeDefault(shape_or_object);
                }
            } else if (typeof shape_or_object === 'object' && shape_or_object !== null) {
                //@ts-expect-error recursive declaration
                result[key] = this.driver.root.bind(this)(shape_or_object, contented);
            } else {
                result[key] = shape_or_object;
            }
        }

        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);
        return result;
    },

    load(shapes) {
        if (this.config.processEnv) {
            shapes.forEach(shape => {
                const conf = shape.conf();
                if (!this.driver.supported_check.bind(this)(shape)) return;
                Object.defineProperty(process.env, conf.prop, {
                    get: () => {
                        return this.get(conf.key);
                    },
                    set: (value) => {
                        this.set(conf.key, value);
                    },
                    enumerable: true,
                    configurable: true
                });
            });
        }
        shapes.forEach(shape => {
            if (!this.driver.supported_check.bind(this)(shape)) return;
            const conf = shape.conf();
            const contents = readEnvFile(this.config.filepath);
            const rawValue = contents[conf.prop] ?? contents[conf.key];

            if (typeof rawValue == "undefined" && conf.save_default && (conf.default || "getDefaults" in shape)) {
                this.set(conf.key, getShapeDefault(shape))
            }
            ImportantCheck.bind(this as never)(rawValue ?? getShapeDefault(shape))
        });

        return true;
    },
});
export default envDriver;
