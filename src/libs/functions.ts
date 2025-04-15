import { BaseShapeAbstract } from "../ConfigJS";
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
export function getShapeDefault(shape: BaseShape<any> | any): any {
    if (shape instanceof BaseShapeAbstract) {
        if (shape._default !== undefined) {
            return shape._default;
        }
        
        if ('getDefaults' in shape && typeof shape.getDefaults === 'function') {
            return shape.getDefaults();
        }
        
        return shape._default
    }
    
    return shape;
}