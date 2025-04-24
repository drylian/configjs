import { AbstractShape, type PrimitiveShapes } from "../shapes";

export const processShapes = <T extends Record<string, PrimitiveShapes>>(shapes: T, prefix = '') => {
    Object.keys(shapes).forEach(key => {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        const shapeOrShapes = shapes[key];

        if (shapeOrShapes instanceof AbstractShape) {
            if (shapeOrShapes._prop === "_unconfigured_property") {
                shapeOrShapes.prop(fullPath);
            }
            shapeOrShapes._key = fullPath;
        } else if (typeof shapeOrShapes === 'object' && shapeOrShapes !== null) {
            processShapes(shapeOrShapes as never, fullPath);
        }
    });
}