import type { KfgDriver } from "./kfg-driver";
import type {
	DeepGet,
	inPromise,
	Paths,
	RootPaths,
	SchemaDefinition,
	StaticSchema,
} from "./types";

/**
 * Options accepted by `load()` / `reload()`: driver config overrides plus the
 * schema-level `only_importants` switch.
 */
export type KfgLoadOptions<D extends KfgDriver<any, any>> = Partial<
	D["config"]
> & {
	only_importants?: boolean;
};

/**
 * The public surface shared by `Kfg` and `KfgPool`.
 *
 * Both implement this interface with the exact same generics, so a pool can be
 * dropped in wherever a single instance was used before without touching call
 * sites — dot-path autocompletion and return types stay identical.
 */
export interface KfgApi<
	D extends KfgDriver<any, any>,
	S extends SchemaDefinition,
> {
	/** Read-only proxy over the loaded configuration. */
	readonly config: StaticSchema<S>;
	/** The driver backing the current configuration. */
	readonly driver: D;
	/** The user-defined schema definition. */
	readonly schema: S;

	load(options?: KfgLoadOptions<D>): inPromise<D["async"], void>;
	reload(options?: KfgLoadOptions<D>): inPromise<D["async"], void>;
	save(): inPromise<D["async"], void>;

	get<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<StaticSchema<S>, P>;
	root<P extends RootPaths<StaticSchema<S>>>(
		path: P,
	): DeepGet<StaticSchema<S>, P>;
	set<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: DeepGet<StaticSchema<S>, P>,
		descriptionOrOptions?: string | { description?: string },
	): inPromise<D["async"], void>;
	insert<P extends RootPaths<StaticSchema<S>>>(
		path: P,
		partial: Partial<DeepGet<StaticSchema<S>, P>>,
	): inPromise<D["async"], void>;
	inject(data: Partial<StaticSchema<S>>): inPromise<D["async"], void>;
	del<P extends Paths<StaticSchema<S>>>(path: P): inPromise<D["async"], void>;
	mutate(
		fn: (draft: StaticSchema<S>) => StaticSchema<S> | undefined,
	): inPromise<D["async"], void>;

	has<P extends Paths<StaticSchema<S>>>(...paths: P[]): boolean;
	conf<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<S, P>;
	schematic<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<S, P>;
	toJSON(): inPromise<D["async"], StaticSchema<S>>;
}
