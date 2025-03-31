import { BaseShape } from "./shapes/base-shape";
import type { ShapeDef } from "./types";

export const processShapes = <T extends Record<string, ShapeDef<any>>>(shapes: T, prefix = '') => {
    Object.keys(shapes).forEach(key => {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        const shapeOrShapes = shapes[key];
        
        if (shapeOrShapes instanceof BaseShape) {
            if (shapeOrShapes._prop === "_unconfigured_property") {
                shapeOrShapes.prop(fullPath);
            }
            shapeOrShapes._key = fullPath;
        } else if (typeof shapeOrShapes === 'object' && shapeOrShapes !== null) {
            processShapes(shapeOrShapes, fullPath);
        }
    });
}