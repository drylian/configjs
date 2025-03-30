import { BaseShapeAbstract } from "./base-abstract";

export class NullableShape<T> extends BaseShapeAbstract<T | null> {

    constructor(private readonly _shape: BaseShapeAbstract<T>) {
        super();
    }

    parse(value: unknown): T | null {
        if (value === null) return null;
        return this._shape.parse(value);
    }
}