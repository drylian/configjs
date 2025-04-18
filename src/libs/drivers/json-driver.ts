import fs from 'node:fs';
import { ConfigJSDriver } from '../driver';
import { BaseShapeAbstract } from '../shapes/base-abstract';
import { getShapeDefault } from '../functions';
import { StringShape } from '../shapes/string-shape';
import { NumberShape } from '../shapes/number-shape';
import { EnumShape } from '../shapes/enum-shape';
import { ArrayShape } from '../shapes/array-shape';
import { BooleanShape } from '../shapes/boolean-shape';
import { RecordShape } from '../shapes/record-shape';
import { ObjectShape } from '../shapes/object-shape';

const readJsonFile = (path: string): Record<string, any> => {
    if (!fs.existsSync(path)) return {};
    try {
        const content = fs.readFileSync(path, "utf8");
        return JSON.parse(content);
    } catch (error) {
        console.error(`[JSONDriver] Error reading/parsing JSON file ${path}:`, error);
        return {};
    }
};

const writeJsonFile = (path: string, data: Record<string, any>) => {
    try {
        const content = JSON.stringify(data, null, 2);
        fs.writeFileSync(path, content, "utf8");
    } catch (error) {
        console.error(`[JSONDriver] Error writing JSON file ${path}:`, error);
    }
};

export const jsonDriver = new ConfigJSDriver({
    async: false,
    supported: [StringShape, NumberShape, EnumShape, ArrayShape, BooleanShape, RecordShape, ObjectShape],

    supported_check(shape) {
        return this.driver.supported.some(SupportedShape => shape instanceof SupportedShape);
    },

    config: {
        /**
         * File path of JSON config
         */
        filepath: "config.json",
        /**
         * Whether to pretty-print the JSON file
         */
        pretty: true
    },

    get(shape) {
        const conf = shape.conf();
        if (!this.driver.supported_check.bind(this)(shape)) {
            console.warn(`[JSONDriver] Unsupported shape type for key: ${shape._prop}`);
            return conf.default;
        }

        const contents = readJsonFile(this.config.filepath);
        const rawValue = contents[conf.prop] ?? contents[conf.key];

        try {
            if (rawValue !== undefined) {
                // For JSON, we can directly use the value as it's already parsed
                if (shape instanceof ArrayShape && !Array.isArray(rawValue)) {
                    throw new Error(`Expected array but got ${typeof rawValue}`);
                }
                return shape.parse(rawValue) ?? conf.default;
            }
            return conf.default;
        } catch (err) {
            const error = err as Error;
            console.warn(`[JSONDriver] Error parsing value for ${shape._prop}: ${error.message}`);
            return conf.default;
        }
    },

    set(shape, newValue) {
        if (!this.driver.supported_check.bind(this)(shape)) {
            console.warn(`[JSONDriver] Unsupported shape type for key: ${shape._prop}`);
            return newValue;
        }

        try {
            const contents = readJsonFile(this.config.filepath);
            contents[shape._prop] = newValue;
            writeJsonFile(this.config.filepath, contents);
            return newValue;
        } catch (error) {
            console.error(`[JSONDriver] Error setting value for "${shape._prop}" (key:${shape._key}):`, error);
            return newValue;
        }
    },

    del(shape) {
        const contents = readJsonFile(this.config.filepath);
        delete contents[shape._prop];
        delete contents[shape._key];
        writeJsonFile(this.config.filepath, contents);
        return true;
    },

    has(shape) {
        const contents = readJsonFile(this.config.filepath);
        return shape._prop in contents || shape._key in contents;
    },

    save() {
        return true;
    },

    root(object_shape, contented?: Record<string, any>) {
        const result: any = {};
        const contents = typeof contented !== "undefined" ? contented : readJsonFile(this.config.filepath);

        for (const key in object_shape) {
            const shape_or_object = object_shape[key];

            if (shape_or_object instanceof BaseShapeAbstract) {
                if (!this.driver.supported_check.bind(this)(shape_or_object)) {
                    console.warn(`[JSONDriver] Unsupported shape type for key: ${key}`);
                    continue;
                }

                const conf = shape_or_object.conf();
                const rawValue = contents[conf.prop] ?? contents[conf.key];

                try {
                    result[key] = rawValue !== undefined
                        ? shape_or_object.parse(rawValue) ?? getShapeDefault(shape_or_object)
                        : getShapeDefault(shape_or_object);
                } catch (err) {
                    const error = err as Error;
                    console.warn(`[JSONDriver] Error parsing value for ${key}: ${error.message}`);
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
        shapes.forEach(shape => {
            if (!this.driver.supported_check.bind(this)(shape)) return;
            const conf = shape.conf();
            const contents = readJsonFile(this.config.filepath);
            const rawValue = contents[conf.prop] ?? contents[conf.key];
            if (typeof rawValue == "undefined" && conf.save_default && (conf.default || "getDefaults" in shape)) {
                this.set(conf.key, getShapeDefault(shape))
            }
            shape._checkImportant(rawValue ?? getShapeDefault(shape))
        });

        return true;
    },
});

export default jsonDriver;