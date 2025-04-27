import fs from 'node:fs';
import { ConfigJSDriver } from '../driver';
import { StringShape,NumberShape,EnumShape,ArrayShape,BooleanShape,AbstractShape, ImportantCheck, RecordShape, ObjectShape } from "../../shapes";
import { getShapeDefault, type infer as InferShapeType } from '@caeljs/tsh';
import type { ConfigJS } from '../../ConfigJS';

const fileDelay = (path: string, instance: ConfigJS<any, any>, delay: number, save?: Record<string, any>) => {
    const cached_at = Number(instance.cached_at.toString());
    setTimeout(() => {
        if (save) {
            writeJsonFile(path, save);
        }
        if (instance.cached_at !== cached_at) return;
        instance.cached = undefined;
    }, delay);
}

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

const writeJsonFile = (path: string, data: Record<string, any>, pretty = false) => {
    try {
        const contents = readJsonFile(path);
        const content = JSON.stringify({ ...contents, ...data }, null, pretty ? 3 : 0);
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
        pretty: true,
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
            console.warn(`[JSONDriver] Unsupported shape type for key: ${shape._prop}`);
            return conf.default;
        }

        const contents = Object(this.cached || readJsonFile(this.config.filepath)) as Record<string, any>;
        if (!this.cached) this.cached = contents;
        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);
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
        const contents = Object(this.cached || readJsonFile(this.config.filepath)) as Record<string, any>;
        if (!this.cached) this.cached = contents;

        try {
            this.cached[shape._prop] = newValue;
            fileDelay(this.driver.config.filepath, this, this.driver.config.delay, { [shape._prop]: newValue });
            return newValue;
        } catch (error) {
            console.error(`[JSONDriver] Error setting value for "${shape._prop}" (key:${shape._key}):`, error);
            return newValue;
        }
    },

    del(shape) {
        const contents = Object(this.cached || readJsonFile(this.config.filepath)) as Record<string, any>;
        if (!this.cached) this.cached = contents;
        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);
        delete contents[shape._prop];
        delete contents[shape._key];
        delete this.cached[shape._prop];
        delete this.cached[shape._key];
        writeJsonFile(this.config.filepath, contents);
        return true;
    },

    has(shape) {
        const contents = Object(this.cached || readJsonFile(this.config.filepath)) as Record<string, any>;
        if (!this.cached) this.cached = contents;
        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);
        return shape._prop in contents || shape._key in contents;
    },

    save() {
        return true;
    },

    //@ts-expect-error additional contents in respo
    insert(this: ConfigJS<ConfigJSDriver<false, any, any>, Record<string, AbstractShape<any>>>, object_shape: Record<string, AbstractShape<any>>, values: Record<string, InferShapeType<AbstractShape<any>>>, updates: Record<string, any>) {
        if (!values || typeof values !== 'object') {
            console.warn('[JSONDriver] Insert requires an object of values');
            return false;
        }

        try {
            if (!updates) updates = Object(this.cached || readJsonFile(this.config.filepath)) as Record<string, any>;
            if (!this.cached) this.cached = updates;
            for (const key in values) {
                const shape = object_shape[key];

                if (!shape || !(shape instanceof AbstractShape)) {
                    console.warn(`[JSONDriver] No shape found for key: ${key}`);
                    continue;
                }
                if (!this.driver.supported_check.bind(this)(shape)) {
                    console.warn(`[JSONDriver] Unsupported shape type for key: ${key}`);
                    continue;
                }

                const config = shape.conf();

                try {
                    updates[config.prop] = shape.parse(values[key]);
                } catch (err) {
                    const error = err as Error;
                    console.warn(`[JSONDriver] Error parsing value for ${key}(${config.prop}): ${error.message}`);
                    continue;
                }
            }

            fileDelay(this.driver.config.filepath, this, this.driver.config.delay, updates);
            return true;
        } catch (error) {
            console.error('[JSONDriver] Error in insert operation:', error);
            return false;
        }
    },

    root(object_shape, contented?: Record<string, any>) {
        const result: any = {};
        if (!contented) contented = Object(this.cached || readJsonFile(this.config.filepath)) as Record<string, any>;
        if (!this.cached) this.cached = contented;

        for (const key in object_shape) {
            const shape_or_object = object_shape[key];

            if (shape_or_object instanceof AbstractShape) {
                if (!this.driver.supported_check.bind(this)(shape_or_object)) {
                    console.warn(`[JSONDriver] Unsupported shape type for key: ${key}`);
                    continue;
                }

                const conf = shape_or_object.conf();
                const rawValue = contented[conf.prop] ?? contented[conf.key];

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
                result[key] = this.driver.root.bind(this)(shape_or_object, contented);
            } else {
                result[key] = shape_or_object;
            }
        }
        fileDelay(this.driver.config.filepath, this, this.driver.config.delay);
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
            ImportantCheck.bind(shape)(rawValue ?? getShapeDefault(shape))
        });

        return true;
    },
});

export default jsonDriver;