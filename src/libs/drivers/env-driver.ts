import { ConfigJSDriver } from "../driver";
import fs from 'node:fs';
import { StringShape } from "../shapes/string-shape";
import { NumberShape } from "../shapes/number-shape";
import { EnumShape } from "../shapes/enum-shape";
import { ArrayShape } from "../shapes/array-shape";
import { BooleanShape } from "../shapes/boolean-shape";
import type { BaseShape } from "../shapes/base-shape";
import { BaseShapeAbstract } from "../shapes/base-abstract";
import { getShapeDefault } from "../functions";

const LINE = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\n]*))?.*$/gm;

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

const writeEnvFile = (path: string, data: Record<string, string>, force = false) => {
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

const convertEnvValue = (shape: BaseShape<any>, value: string): any => {
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
        //@ts-expect-error It doesn't pay to install the bun just for that
        processEnv: typeof Bun !== "undefined" ? true : false
    },

    get(shape) {
        const conf = shape.conf();
        if (!this.driver.supported_check.bind(this)(shape)) {
            console.warn(`[EnvDriver] Unsupported shape type for key: ${shape._prop}`);
            return getShapeDefault(shape);
        }

        const contents = readEnvFile(this.config.filepath);
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

        try {
            let valueToStore: string;

            if (shape instanceof ArrayShape) {
                valueToStore = JSON.stringify(newValue);
            } else if (shape instanceof BooleanShape) {
                valueToStore = newValue ? 'true' : 'false';
            } else {
                valueToStore = String(newValue);
            }

            const contents = { [shape._prop]: valueToStore };
            writeEnvFile(this.config.filepath, contents);

            return newValue;
        } catch (error) {
            console.error(`[EnvDriver] Error setting value for "${shape._prop}" (key:${shape._key}):`, error);
            return newValue;
        }
    },

    del(shape) {
        const contents = readEnvFile(this.config.filepath);
        delete contents[shape._prop];
        delete contents[shape._key];
        writeEnvFile(this.config.filepath, contents);

        if (this.config.processEnv) {
            delete process.env[shape._prop];
        }

        return true;
    },

    has(shape) {
        const contents = readEnvFile(this.config.filepath);
        return shape._prop in contents || shape._prop in process.env;
    },

    save() {
        return true;
    },

    root(object_shape, contented?:Record<string,any>) {
        const result: any = {};
        const contents = typeof contented !== "undefined" ? contented : readEnvFile(this.config.filepath);

        for (const key in object_shape) {
            const shape_or_object = object_shape[key];

            if (shape_or_object instanceof BaseShapeAbstract) {
                // Caso base: é um BaseShape
                if (!this.driver.supported_check.bind(this)(shape_or_object)) {
                    console.warn(`[EnvDriver] Unsupported shape type for key: ${key}`);
                    continue;
                }

                const conf = shape_or_object.conf();
                const rawValue = contents[conf.prop] ?? contents[conf.key];

                try {
                    result[key] = rawValue !== undefined
                        ? convertEnvValue(shape_or_object, rawValue) ?? getShapeDefault(shape_or_object)
                        : getShapeDefault(shape_or_object);
                } catch (err) {
                    const error = err as Error;
                    console.warn(`[EnvDriver] Error parsing value for ${key}: ${error.message}`);
                    result[key] = getShapeDefault(shape_or_object);
                }
            } else if (typeof shape_or_object === 'object' && shape_or_object !== null) {
                //@ts-expect-error recursive declaration
                result[key] = this.driver.root.bind(this)(shape_or_object, contents);
            } else {
                result[key] = shape_or_object;
            }
        }

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
            shape._checkImportant(rawValue ?? getShapeDefault(shape))
        });

        return true;
    },
});
export default envDriver;
