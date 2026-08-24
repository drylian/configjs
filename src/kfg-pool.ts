import { AsyncLocalStorage } from "node:async_hooks";
import { KfgScopeError } from "./errors";
import { Kfg } from "./kfg";
import type { KfgApi, KfgLoadOptions } from "./kfg-api";
import type { KfgDriver } from "./kfg-driver";
import type {
	DeepGet,
	inPromise,
	Paths,
	RootPaths,
	SchemaDefinition,
	StaticSchema,
} from "./types";

/** A synchronous driver — the only kind a pool accepts. */
export type SyncDriver = KfgDriver<any, false>;

export interface KfgPoolOptions<D extends SyncDriver> {
	/** Builds the driver for a given scope id (e.g. one file per guild). */
	driver: (id: string) => D;
	/** Load options forwarded to every instance the pool creates. */
	load?: KfgLoadOptions<D>;
	/**
	 * Scope used when no scope is active. Off by default: without it, a
	 * scope-less operation throws `KfgScopeError`. Meant as a migration aid —
	 * turn it on while call sites are still being moved into scopes.
	 */
	defaultScope?: string;
	/**
	 * Called every time an operation falls back to `defaultScope`. Lets the host
	 * capture its own stack trace on demand; the pool never captures one itself
	 * (too expensive per access). Without a hook, the pool warns once and keeps
	 * an aggregate count in `missingScopeCount`.
	 */
	onMissingScope?: (operation: string, defaultScope: string) => void;
	/**
	 * External scope resolver, consulted when no `run()` is active. Use it when
	 * the host already owns the ambient context (its own AsyncLocalStorage, a
	 * request store, ...) and should stay the single source of truth. An
	 * enclosing `run()` still wins, since it is explicit at the call site.
	 */
	resolve?: () => string | null | undefined;
	/**
	 * Overrides the per-instance `forceExit`, which the pool forces to `false`
	 * by default. Only set it if a broken scope really should exit the process.
	 */
	forceExit?: boolean;
	/**
	 * Maximum number of instances kept in memory. Beyond it, the
	 * least-recently-used ones are evicted. Each instance holds a full config
	 * cache, so an unbounded pool grows with the number of scopes ever touched.
	 */
	max?: number;
	/** Milliseconds of idleness after which an instance is evicted. */
	ttl?: number;
}

/**
 * A set of `Kfg` instances keyed by scope id, exposing the exact same API as a
 * single instance.
 *
 * Every read/write is routed to the instance for the currently active scope,
 * resolved in this order: an enclosing `run()`, then `options.resolve()`, then
 * `options.defaultScope`.
 * `for(id)` addresses an instance explicitly and is a first-class entry point —
 * background jobs and dashboards have no ambient scope to rely on.
 *
 * Pools are synchronous-only: a scope is materialized on demand, and a sync
 * driver is what makes that transparent to callers.
 */
export class KfgPool<D extends SyncDriver, S extends SchemaDefinition>
	implements KfgApi<D, S>
{
	private readonly "~schemaDef": S;
	private readonly "~options": KfgPoolOptions<D>;
	private readonly "~instances" = new Map<string, Kfg<D, S>>();
	/** Ambient scope for run(), following the async call tree. */
	private readonly "~storage" = new AsyncLocalStorage<string>();
	/** Last access per instance, kept in least-recently-used order. */
	private readonly "~lastUsed" = new Map<string, number>();

	/** How many operations have fallen back to `defaultScope`. */
	public missingScopeCount = 0;
	private "~missingScopeWarned" = false;

	constructor(schema: S, options: KfgPoolOptions<D>) {
		this["~schemaDef"] = schema;
		this["~options"] = options;
	}

	// --- Scope management ---

	/** Returns (creating it if needed) the instance for `id`. */
	public for(id: string): Kfg<D, S> {
		this.evictExpired();

		const existing = this["~instances"].get(id);
		if (existing) {
			// Re-insert to move it to the most-recently-used end of the map.
			this["~instances"].delete(id);
			this["~instances"].set(id, existing);
			this["~lastUsed"].delete(id);
			this["~lastUsed"].set(id, Date.now());
			return existing;
		}

		const instance = new Kfg<D, S>(
			this["~options"].driver(id),
			this["~schemaDef"],
			{
				lazy: true,
				load: this["~options"].load,
				// One broken scope must never take the process down: a pool always
				// throws KfgValidationError so the host can isolate that scope.
				forceExit: this["~options"].forceExit ?? false,
				scope: id,
			},
		);
		this["~instances"].set(id, instance);
		this["~lastUsed"].set(id, Date.now());
		this.evictOverflow();
		return instance;
	}

	/** Evicts instances idle for longer than `ttl`, oldest first. */
	private evictExpired(): void {
		const ttl = this["~options"].ttl;
		if (ttl === undefined) return;

		const deadline = Date.now() - ttl;
		for (const [id, used] of this["~lastUsed"]) {
			// The map is kept in least-recently-used order, so the first live
			// entry ends the sweep.
			if (used > deadline) break;
			this.dispose(id);
		}
	}

	/** Evicts the least-recently-used instances down to `max`. */
	private evictOverflow(): void {
		const max = this["~options"].max;
		if (max === undefined) return;

		while (this["~instances"].size > max) {
			const oldest = this["~instances"].keys().next();
			if (oldest.done) break;
			this.dispose(oldest.value);
		}
	}

	/**
	 * Runs `fn` with `id` as the active scope. The scope follows the async call
	 * tree, so everything `fn` awaits sees it too — including code that never
	 * received the id as an argument. Returns whatever `fn` returns.
	 */
	public run<T>(id: string, fn: () => T): T {
		return this["~storage"].run(id, fn);
	}

	/** The scope that would be used right now, or `null` if there is none. */
	public current(): string | null {
		// An enclosing run() is explicit at the call site, so it outranks the
		// host-provided resolver.
		const ambient = this["~storage"].getStore();
		if (ambient !== undefined && ambient !== "") return ambient;

		const resolved = this["~options"].resolve?.();
		if (resolved !== undefined && resolved !== null && resolved !== "") {
			return resolved;
		}
		return null;
	}

	/** Alias of {@link current}. */
	public scope(): string | null {
		return this.current();
	}

	/** Ids of the instances currently held by the pool. */
	public ids(): string[] {
		return [...this["~instances"].keys()];
	}

	/** Number of instances currently held by the pool. */
	public get size(): number {
		return this["~instances"].size;
	}

	/**
	 * Drops the instance for `id` from the pool, releasing its cache. Persisted
	 * state is untouched; the next access builds a fresh instance.
	 */
	public dispose(id: string): boolean {
		this["~lastUsed"].delete(id);
		return this["~instances"].delete(id);
	}

	/**
	 * Marks the instance for `id` as stale so the next access rereads it from
	 * disk, keeping the instance's identity — unlike `dispose`, references
	 * previously handed out by `for(id)` also see the fresh state. Call it after
	 * writing a scope's file behind the pool's back.
	 */
	public invalidate(id: string): void {
		this["~instances"].get(id)?.unload();
	}

	/** Invalidates every instance the pool holds. */
	public invalidateAll(): void {
		for (const instance of this["~instances"].values()) instance.unload();
	}

	/** Runs `fn` for every instance the pool currently holds. */
	public each(fn: (instance: Kfg<D, S>, id: string) => void): void {
		for (const [id, instance] of [...this["~instances"]]) fn(instance, id);
	}

	/** Drops every instance, emptying the pool. */
	public clear(): void {
		this["~instances"].clear();
		this["~lastUsed"].clear();
	}

	/**
	 * Resolves the instance an operation should run against, applying the
	 * `defaultScope` fallback and failing loudly when there is nothing to use.
	 */
	private active(operation: string): Kfg<D, S> {
		const scope = this.current();
		if (scope !== null) return this.for(scope);

		const fallback = this["~options"].defaultScope;
		if (fallback !== undefined) {
			this.noteMissingScope(operation, fallback);
			return this.for(fallback);
		}

		throw new KfgScopeError(operation);
	}

	/** Records a `defaultScope` fallback without paying for a stack trace. */
	private noteMissingScope(operation: string, fallback: string): void {
		this.missingScopeCount++;

		const hook = this["~options"].onMissingScope;
		if (hook) {
			hook(operation, fallback);
			return;
		}

		if (!this["~missingScopeWarned"]) {
			this["~missingScopeWarned"] = true;
			console.warn(
				`[KFG] Operation ran with no active scope (${operation}); falling back to defaultScope "${fallback}". Further occurrences are counted in pool.missingScopeCount.`,
			);
		}
	}

	// --- KfgApi (delegated to the active scope) ---

	public get config(): StaticSchema<S> {
		// Resolved per trap, never captured: holding onto `pool.config` must not
		// pin the scope that happened to be active when it was read.
		return new Proxy(
			{},
			{
				get: (_target, prop) =>
					Reflect.get(
						this.active("reading from config proxy").config as any,
						prop,
					),
				set: () => {
					throw new Error(
						"[Kfg] Config is read-only via proxy. Use .set() to modify and persist.",
					);
				},
				ownKeys: () =>
					Reflect.ownKeys(
						this.active("reading from config proxy").config as any,
					),
				getOwnPropertyDescriptor: (_target, prop) =>
					Reflect.getOwnPropertyDescriptor(
						this.active("reading from config proxy").config as any,
						prop,
					),
			},
		) as StaticSchema<S>;
	}

	public get driver(): D {
		return this.active("reading driver").driver;
	}

	public get schema(): S {
		return this["~schemaDef"];
	}

	public load(options?: KfgLoadOptions<D>): inPromise<D["async"], void> {
		return this.active("loading").load(options);
	}

	public reload(options?: KfgLoadOptions<D>): inPromise<D["async"], void> {
		return this.active("reloading").reload(options);
	}

	public save(): inPromise<D["async"], void> {
		return this.active("saving").save();
	}

	public get<P extends Paths<StaticSchema<S>>>(
		path: P,
	): DeepGet<StaticSchema<S>, P> {
		return this.active(`reading "${String(path)}"`).get(path);
	}

	public root<P extends RootPaths<StaticSchema<S>>>(
		path: P,
	): DeepGet<StaticSchema<S>, P> {
		return this.active(`reading "${String(path)}"`).root(path);
	}

	public set<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: DeepGet<StaticSchema<S>, P>,
		descriptionOrOptions?: string | { description?: string },
	): inPromise<D["async"], void> {
		return this.active(`writing "${String(path)}"`).set(
			path,
			value,
			descriptionOrOptions,
		);
	}

	public insert<P extends RootPaths<StaticSchema<S>>>(
		path: P,
		partial: Partial<DeepGet<StaticSchema<S>, P>>,
	): inPromise<D["async"], void> {
		return this.active(`inserting into "${String(path)}"`).insert(
			path,
			partial,
		);
	}

	public inject(data: Partial<StaticSchema<S>>): inPromise<D["async"], void> {
		return this.active("injecting data").inject(data);
	}

	public del<P extends Paths<StaticSchema<S>>>(
		path: P,
	): inPromise<D["async"], void> {
		return this.active(`deleting "${String(path)}"`).del(path);
	}

	public mutate(
		fn: (draft: StaticSchema<S>) => StaticSchema<S> | undefined,
	): inPromise<D["async"], void> {
		return this.active("mutating").mutate(fn);
	}

	public has<P extends Paths<StaticSchema<S>>>(...paths: P[]): boolean {
		return this.active("checking paths").has(...paths);
	}

	public conf<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<S, P> {
		return this.active(`reading schema for "${String(path)}"`).conf(path);
	}

	public schematic<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<S, P> {
		return this.conf(path);
	}

	public toJSON(): inPromise<D["async"], StaticSchema<S>> {
		return this.active("exporting JSON").toJSON();
	}

	public unload(): void {
		this.active("unloading").unload();
	}
}
