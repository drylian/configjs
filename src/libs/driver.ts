import { type AnyConfigTypedDriver } from "./types";

export class ConfigJSDriver<IsAsync, ExtendConfig extends object, TypedDriver extends AnyConfigTypedDriver<IsAsync extends boolean ? IsAsync : boolean, ExtendConfig>> {
    public readonly async: IsAsync
    public config: ExtendConfig;
    public readonly set: TypedDriver['set'];
    public readonly get: TypedDriver['get'];
    public readonly del: TypedDriver['del'];
    public readonly has: TypedDriver['has'];
    public readonly load: TypedDriver['load'];
    public readonly save: TypedDriver['save'];
    public readonly root: TypedDriver['root'];
    public readonly supported: TypedDriver['supported'];
    public readonly supported_check: TypedDriver['supported_check'];

    constructor(driver: TypedDriver & { async: IsAsync, config: ExtendConfig }) {
        this.async = driver.async
        this.config = driver.config
        this.set = driver.set
        this.get = driver.get
        this.has = driver.has
        this.del = driver.del
        this.load = driver.load
        this.root = driver.root
        this.save = driver.save
        this.supported = driver.supported
        this.supported_check = driver.supported_check
    }
}