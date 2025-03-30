import { BaseShapeAbstract } from "./base-abstract";

export class OptionalShape<T> extends BaseShapeAbstract<T | undefined> {
    constructor(private readonly _shape: BaseShapeAbstract<T>) {
        super();
    }

    parse(value: unknown): T | undefined {
        if (value === undefined) return undefined;
        return this._shape.parse(value);
    }
}
