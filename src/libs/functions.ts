import { AbstractShape } from "../ConfigJS";
import type { PrimitiveShapes } from "./types";

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
            processShapes(shapeOrShapes, fullPath);
        }
    });
}
export function getShapeDefault(shape: PrimitiveShapes | any): any {
    if (shape instanceof AbstractShape) {
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
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (typeof a !== typeof b || a === null || b === null) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
        const keysA = Object.keys(a as object);
        const keysB = Object.keys(b as object);

        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
            if (!(key in (b as object))) return false;
            if (!deepEqual((a as any)[key], (b as any)[key])) return false;
        }
        return true;
    }

    return false;
}
