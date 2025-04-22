import { BaseShape } from "./base-shape";

export class AnyShape<AnyType extends any = any> extends BaseShape<AnyType> {
    public readonly _type = "any";

    parse(value: unknown): any {
        if (typeof value === "undefined" && typeof this._default !== "undefined") value = this._default;
        if (typeof value === "undefined" && this._optional) return undefined as never;
        if (value === null && this._nullable) return null as never;

        return this._checkImportant(this._applyOperations(value, this._key));
    }
}