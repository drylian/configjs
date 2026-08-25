import type { TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
	defaultValidationMessage,
	issuePaths,
	KfgValidationError,
	notLoadedMessage,
} from "./errors";
import type { KfgApi, KfgLoadOptions, KfgOptions } from "./kfg-api";
import type { KfgDriver } from "./kfg-driver";
import { KfgPool, type KfgPoolOptions, type SyncDriver } from "./kfg-pool";
import type {
	DeepGet,
	inPromise,
	Paths,
	RootPaths,
	SchemaDefinition,
	StaticSchema,
} from "./types";
import {
	cloneBranch,
	deepMerge,
	deleteProperty,
	getProperty,
	pathSegments,
	setProperty,
} from "./utils/object";
import { compileSchema, optionalSchema } from "./utils/schema";

export class Kfg<D extends KfgDriver<any, any>, S extends SchemaDefinition>
	implements KfgApi<D, S>
{
	public readonly "~options": KfgOptions<D>;
	public readonly "~driver": D;
	public readonly "~schema": { defined: S; compiled: TObject };
	private "~lastLoadOptions"?: KfgLoadOptions<D> | undefined;

	/** Memoized schema-node lookups by dot path (see getSchemaAtPath). */
	private readonly "~schemaNodeCache" = new Map<string, any>();

	// Internal state
	public "~cache": Record<string, any> = {};
	public "~loaded": boolean = false;

	/**
	 * Proxy to access configuration properties directly.
	 * Example: kfg.config.database.port
	 */
	public readonly config: StaticSchema<S>;
	public get driver(): D {
		return this["~driver"];
	}

	public get schema(): S {
		return this["~schema"].defined;
	}

	/**
	 * Creates a pool of instances keyed by scope id, exposing this same API.
	 * See {@link KfgPool}.
	 */
	public static pool<D extends SyncDriver, S extends SchemaDefinition>(
		schema: S,
		options: KfgPoolOptions<D>,
	): KfgPool<D, S> {
		return new KfgPool<D, S>(schema, options);
	}

	constructor(driver: D, schema: S, options: KfgOptions<D> = {}) {
		this["~driver"] = driver;
		this["~options"] = options;

		if (options.lazy && driver.async) {
			throw new Error(
				"[KFG] `lazy` requires a synchronous driver: an async load cannot be hidden behind a synchronous get().",
			);
		}

		const compiled = compileSchema(schema);

		this["~schema"] = {
			defined: schema,
			compiled: compiled,
		};

		// Initialize proxy
		this.config = new Proxy(
			{},
			{
				get: (_target, prop) => {
					this["~ensureLoaded"]("reading from config proxy");
					return Reflect.get(this["~cache"], prop);
				},
				set: () => {
					throw new Error(
						"[Kfg] Config is read-only via proxy. Use .set() to modify and persist.",
					);
				},
				ownKeys: () => {
					return this["~loaded"] ? Reflect.ownKeys(this["~cache"]) : [];
				},
				getOwnPropertyDescriptor: (_target, prop) => {
					return this["~loaded"]
						? Reflect.getOwnPropertyDescriptor(this["~cache"], prop)
						: undefined;
				},
			},
		) as StaticSchema<S>;
	}

	/**
	 * Loads the configuration from the driver.
	 */
	public load(options?: KfgLoadOptions<D>): inPromise<D["async"], void> {
		this["~lastLoadOptions"] = options;
		if (options) {
			const { only_importants: _onlyImportants, ...driverConfig } =
				options as any;
			this["~driver"].config = {
				...this["~driver"].config,
				...driverConfig,
			};
		}

		const schemaToLoad = options?.only_importants
			? (optionalSchema(this["~schema"].defined) as S)
			: this["~schema"].defined;
		this["~schema"].compiled = compileSchema(schemaToLoad);

		const result = this["~driver"].load(schemaToLoad);

		const process = (rawData: any) => {
			const cleanData = this.validateAndClean(
				rawData,
				this["~schema"].compiled,
				true,
			);
			this["~cache"] = cleanData;
			this["~loaded"] = true;
		};

		if (this["~driver"].async) {
			return (result as Promise<any>).then(process) as any;
		}

		process(result);
		return undefined as any;
	}

	public reload(options?: KfgLoadOptions<D>): inPromise<D["async"], void> {
		this["~loaded"] = false;
		const nextOptions = options ?? this["~lastLoadOptions"];
		return this.load(nextOptions);
	}

	/**
	 * Drops the in-memory cache and marks the instance as not loaded, releasing
	 * the memory it held. Persisted state is untouched: a lazy instance reloads
	 * on the next access, and any other needs an explicit `load()`.
	 */
	public unload(): void {
		this["~cache"] = {};
		this["~loaded"] = false;
	}

	/**
	 * Guards every operation that needs loaded data. With `lazy`, the first
	 * access loads instead of throwing — transparent because it only applies to
	 * synchronous drivers.
	 */
	private "~ensureLoaded"(operation: string): void {
		if (this["~loaded"]) return;
		if (this["~options"].lazy) {
			this.load(this["~options"].load);
			return;
		}
		throw new Error(notLoadedMessage(operation));
	}

	/**
	 * Runs a method body, turning a synchronous throw into a rejected promise
	 * when the driver is async.
	 *
	 * These methods do their validation synchronously before handing anything to
	 * the driver, so without this an async `set` could throw at the call site
	 * even though its signature promises a `Promise` — breaking
	 * `kfg.set(...).catch(...)` while `await kfg.set(...)` happened to work.
	 */
	private "~guard"<T>(run: () => T): T {
		if (!this["~driver"].async) return run();
		try {
			return run();
		} catch (error) {
			return Promise.reject(error) as T;
		}
	}

	/** Effective forceExit: the instance option wins over the driver's. */
	private "~shouldForceExit"(): boolean {
		return this["~options"].forceExit ?? this["~driver"].forceExit;
	}

	public save(): inPromise<D["async"], void> {
		return this["~guard"](() => {
			this["~ensureLoaded"]("saving");
			return this["~driver"].save(this["~cache"]) as any;
		});
	}

	public get<P extends Paths<StaticSchema<S>>>(
		path: P,
	): DeepGet<StaticSchema<S>, P> {
		this["~ensureLoaded"](`reading "${String(path)}"`);
		return getProperty(this["~cache"], path as string);
	}

	public root<P extends RootPaths<StaticSchema<S>>>(
		path: P,
	): DeepGet<StaticSchema<S>, P> {
		return this.get(path as any) as DeepGet<StaticSchema<S>, P>;
	}

	public set<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: DeepGet<StaticSchema<S>, P>,
		descriptionOrOptions?: string | { description?: string },
	): inPromise<D["async"], void> {
		return this["~guard"](() =>
			this.setInternal(path, value, descriptionOrOptions),
		);
	}

	private setInternal<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: DeepGet<StaticSchema<S>, P>,
		descriptionOrOptions?: string | { description?: string },
	): inPromise<D["async"], void> {
		this["~ensureLoaded"](`writing "${String(path)}"`);

		let description =
			typeof descriptionOrOptions === "string"
				? descriptionOrOptions
				: descriptionOrOptions?.description;

		if (!description) {
			const schemaDef = this.getSchemaAtPath(path as string);
			if (schemaDef?.description) {
				description = schemaDef.description;
			}
		}

		// Transactional mode: apply on the freshest persisted state so concurrent
		// writers don't clobber each other (per-key comment is dropped here).
		if (this.mutateSetEnabled()) {
			return this.runMutation((draft) => {
				setProperty(draft as any, path as string, value);
				return draft as any;
			});
		}

		// Apply to a copy-on-write branch: if validation rejects it, the draft is
		// simply discarded and the cache was never touched.
		const draft = cloneBranch(this["~cache"], path as string);
		setProperty(draft, path as string, value);
		this["~cache"] = this.validateAndClean(draft, this["~schema"].compiled);

		if (this["~driver"].update) {
			return this["~driver"].update(path as string, value, description) as any;
		} else {
			return this["~driver"].save(this["~cache"], {
				path: path as string,
				description,
			}) as any;
		}
	}

	public insert<P extends RootPaths<StaticSchema<S>>>(
		path: P,
		partial: Partial<DeepGet<StaticSchema<S>, P>>,
	): inPromise<D["async"], void> {
		return this["~guard"](() => this.insertInternal(path, partial));
	}

	private insertInternal<P extends RootPaths<StaticSchema<S>>>(
		path: P,
		partial: Partial<DeepGet<StaticSchema<S>, P>>,
	): inPromise<D["async"], void> {
		this["~ensureLoaded"](`inserting into "${String(path)}"`);

		const currentObject = getProperty(this["~cache"], path as string);
		if (typeof currentObject !== "object" || currentObject === null) {
			throw new Error(`Cannot insert into non-object at path: ${String(path)}`);
		}

		if (this.mutateSetEnabled()) {
			return this.runMutation((draft) => {
				const target = getProperty(draft as any, path as string);
				if (typeof target !== "object" || target === null) {
					throw new Error(
						`Cannot insert into non-object at path: ${String(path)}`,
					);
				}
				Object.assign(target, partial);
				return draft as any;
			});
		}

		// Replace the target with a merged copy rather than assigning into the
		// cached object, so a rejected insert leaves nothing behind.
		const draft = cloneBranch(this["~cache"], path as string);
		setProperty(draft, path as string, { ...currentObject, ...partial });
		this["~cache"] = this.validateAndClean(draft, this["~schema"].compiled);

		if (this["~driver"].update) {
			return this["~driver"].update(
				path as string,
				getProperty(this["~cache"], path as string),
			) as any;
		} else {
			return this["~driver"].save(this["~cache"]) as any;
		}
	}

	public inject(data: Partial<StaticSchema<S>>): inPromise<D["async"], void> {
		return this["~guard"](() => {
			this["~ensureLoaded"]("injecting data");

			if (this.mutateSetEnabled()) {
				return this.runMutation(
					(draft) => deepMerge(draft as any, data) as any,
				);
			}

			// deepMerge already returns a new tree, so there is nothing to roll back.
			const draft = deepMerge(this["~cache"], data);
			this["~cache"] = this.validateAndClean(draft, this["~schema"].compiled);

			return this["~driver"].save(this["~cache"]) as any;
		});
	}

	public del<P extends Paths<StaticSchema<S>>>(
		path: P,
	): inPromise<D["async"], void> {
		return this["~guard"](() => this.delInternal(path));
	}

	private delInternal<P extends Paths<StaticSchema<S>>>(
		path: P,
	): inPromise<D["async"], void> {
		this["~ensureLoaded"](`deleting "${String(path)}"`);

		if (this.mutateSetEnabled()) {
			return this.runMutation((draft) => {
				deleteProperty(draft as any, path as string);
				return draft as any;
			});
		}

		const draft = cloneBranch(this["~cache"], path as string);
		const deleted = deleteProperty(draft, path as string);

		if (!deleted)
			return (this["~driver"].async ? Promise.resolve() : undefined) as any;

		this["~cache"] = this.validateAndClean(draft, this["~schema"].compiled);

		if (this["~driver"].delete) {
			return this["~driver"].delete(path as string) as any;
		} else {
			return this["~driver"].save(this["~cache"]) as any;
		}
	}

	/**
	 * Transactional read-modify-write. Reads the latest persisted state, runs
	 * `fn` to mutate it, validates, and persists — atomically across processes
	 * when the driver supports it (preventing lost updates from concurrent
	 * writers). Falls back to load→mutate→save when it does not.
	 * `fn` may mutate the draft in place or return a replacement.
	 */
	public mutate(
		fn: (draft: StaticSchema<S>) => StaticSchema<S> | undefined,
	): inPromise<D["async"], void> {
		return this["~guard"](() => this.mutateInternal(fn));
	}

	private mutateInternal(
		fn: (draft: StaticSchema<S>) => StaticSchema<S> | undefined,
	): inPromise<D["async"], void> {
		return this.runMutation((draft) => (fn(draft) ?? draft) as any);
	}

	/** Whether the driver opted into transactional set() via `mutate_set: true`. */
	private mutateSetEnabled(): boolean {
		const driver = this["~driver"] as any;
		return (
			!!driver.config?.mutate_set && typeof driver.transaction === "function"
		);
	}

	/**
	 * Core transactional read-modify-write. `apply` receives the latest persisted
	 * draft (validated) and returns the next state. Uses the driver's atomic
	 * transaction when available, otherwise a best-effort load→apply→save.
	 */
	private runMutation(
		apply: (draft: StaticSchema<S>) => Record<string, any>,
	): inPromise<D["async"], void> {
		const driver = this["~driver"] as any;

		if (typeof driver.transaction === "function") {
			const wrapped = (raw: Record<string, any>) => {
				const clean = this.validateAndClean(raw, this["~schema"].compiled);
				const result = apply(clean as StaticSchema<S>);
				const revalidated = this.validateAndClean(
					result,
					this["~schema"].compiled,
				);
				this["~cache"] = revalidated;
				this["~loaded"] = true;
				return revalidated;
			};
			return driver.transaction(this["~schema"].defined, wrapped) as any;
		}

		// Fallback: best-effort (not atomic across processes).
		const run = () => {
			const draft = structuredClone(this["~cache"]);
			const result = apply(draft as StaticSchema<S>);
			this["~cache"] = this.validateAndClean(result, this["~schema"].compiled);
			return this["~driver"].save(this["~cache"]);
		};

		if (this["~loaded"]) return run() as any;
		const loaded = this.load();
		if (this["~driver"].async) {
			return (loaded as Promise<void>).then(run) as any;
		}
		return run() as any;
	}

	public has<P extends Paths<StaticSchema<S>>>(...paths: P[]): boolean {
		this["~ensureLoaded"]("checking paths");
		return paths.every(
			(path) => getProperty(this["~cache"], path as string) !== undefined,
		);
	}

	public conf<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<S, P> {
		this["~ensureLoaded"](`reading schema for "${String(path)}"`);
		return getProperty(this["~schema"].defined, path as string) as DeepGet<
			S,
			P
		>;
	}

	public schematic<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<S, P> {
		return this.conf(path);
	}

	/**
	 * Resolves a schema node by dot path, descending through `.properties`
	 * when a segment is a compiled TypeBox object (e.g. created with c.Object).
	 *
	 * Memoized per instance: this runs on every `set` that does not carry an
	 * explicit description, and the schema never changes after construction.
	 * `undefined` results are cached too — a path with no schema node is the
	 * common case for free-form sections, and re-walking it every time is the
	 * same wasted work.
	 */
	private getSchemaAtPath(path: string): any {
		const cache = this["~schemaNodeCache"];
		if (cache.has(path)) return cache.get(path);

		const node = this.resolveSchemaAtPath(path);
		cache.set(path, node);
		return node;
	}

	private resolveSchemaAtPath(path: string): any {
		let node: any = this["~schema"].defined;
		for (const segment of pathSegments(path)) {
			if (node === undefined || node === null) return undefined;
			if (
				node[Symbol.for("TypeBox.Kind")] &&
				node.type === "object" &&
				node.properties
			) {
				node = node.properties[segment];
			} else {
				node = node[segment];
			}
		}
		return node;
	}

	private validateAndClean(
		data: any,
		schema: TObject,
		allowForceExit = false,
	): any {
		const current = Value.Default(schema, data) as any;
		Value.Convert(schema, current);

		if (!Value.Check(schema, current)) {
			const errors = [...Value.Errors(schema, current)];

			let message = defaultValidationMessage(errors);
			if (this["~driver"].formatError) {
				const customMessage = this["~driver"].formatError(errors);
				if (customMessage) {
					message = customMessage;
				}
			}

			if (allowForceExit && this["~shouldForceExit"]()) {
				console.error(message);
				process.exit(1);
			}

			throw new KfgValidationError(message, {
				kind: "schema",
				errors,
				paths: issuePaths(errors),
				scope: this["~options"].scope,
			});
		}

		this.applyRefines(current, allowForceExit);
		return current;
	}

	/**
	 * Runs user-supplied `refines` validators (declared via CustomOptions)
	 * against the cleaned data. A refine returns `true` to accept, or
	 * `false`/a string message to reject.
	 */
	private applyRefines(data: any, allowForceExit: boolean): void {
		const failures: string[] = [];
		const failedPaths: string[] = [];

		const walk = (node: any, value: any, dotPath: string): void => {
			if (!node || typeof node !== "object") return;

			const isTypeBox = !!node[Symbol.for("TypeBox.Kind")];
			if (isTypeBox) {
				const refines = (node as any).refines as
					| ((value: unknown) => boolean | string)[]
					| undefined;
				if (Array.isArray(refines) && value !== undefined) {
					for (const refine of refines) {
						const result = refine(value);
						if (result !== true) {
							const label = dotPath || "(root)";
							failedPaths.push(label);
							failures.push(
								`- ${label}: ${typeof result === "string" ? result : "failed refine validation"}`,
							);
						}
					}
				}
				// Descend into nested object schemas
				if ((node as any).type === "object" && (node as any).properties) {
					for (const key of Object.keys((node as any).properties)) {
						walk(
							(node as any).properties[key],
							value?.[key],
							dotPath ? `${dotPath}.${key}` : key,
						);
					}
				}
			} else {
				for (const key of Object.keys(node)) {
					walk(node[key], value?.[key], dotPath ? `${dotPath}.${key}` : key);
				}
			}
		};

		walk(this["~schema"].defined, data, "");

		if (failures.length > 0) {
			const message = ["[KFG] Refine validation failed:", ...failures].join(
				"\n",
			);
			if (allowForceExit && this["~shouldForceExit"]()) {
				console.error(message);
				process.exit(1);
			}
			throw new KfgValidationError(message, {
				kind: "refine",
				errors: failures,
				paths: failedPaths,
				scope: this["~options"].scope,
			});
		}
	}

	public toJSON(): inPromise<D["async"], StaticSchema<S>> {
		return this["~guard"](() => {
			this["~ensureLoaded"]("exporting JSON");
			if (this["~driver"].async) {
				return Promise.resolve(this["~cache"] as StaticSchema<S>) as any;
			}
			return this["~cache"] as any;
		});
	}
}
