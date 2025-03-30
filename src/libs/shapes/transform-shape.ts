import { BaseShapeAbstract } from "./base-abstract";

export class TransformShape<T, U> extends BaseShapeAbstract<U> {
    constructor(
        private readonly _shape: BaseShapeAbstract<T>,
        private readonly _transform: (value: T) => U
    ) {
        super();
    }

    parse(value: unknown): U {
        const parsed = this._shape.parse(value);
        return this._transform(parsed);
    }
}