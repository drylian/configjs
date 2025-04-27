import { AbstractShape, type PrimitiveShapes } from "@caeljs/tsh";

export const processShapes = <T extends Record<string, PrimitiveShapes>>(shapes: T, prefix = '') => {
    Object.keys(shapes).forEach(key => {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        const shapeOrShapes = shapes[key];

        if (shapeOrShapes instanceof AbstractShape) {
            //@ts-expect-error ignore, tsh abstract 
            if ("_prop" in shapeOrShapes && "prop" in shapeOrShapes && shapeOrShapes._prop === "_unconfigured_property") shapeOrShapes.prop(fullPath);
            shapeOrShapes._key = fullPath;
        } else if (typeof shapeOrShapes === 'object' && shapeOrShapes !== null) {
            processShapes(shapeOrShapes as never, fullPath);
        }
    });
}