import { readFile } from "node:fs/promises";
import type { SchemaDefinition } from "../types";
import {
	safeMutateFile,
	safeReadFile,
	safeWriteFile,
} from "../utils/safe-write-async";
import {
	isValidJson,
	JsonDriverBase,
	type JsonDriverConfig,
} from "./json-driver-base";

/**
 * Persists the configuration to a JSON file without blocking the event loop.
 *
 * Same file format and same safeguards as `JsonDriver` — they share every bit
 * of parsing, serialization and error formatting — but all I/O is
 * promise-based, including waiting for the write lock. In a server, a `set`
 * that has to queue behind another writer no longer stalls everything else.
 *
 * Because the driver is async, `Kfg`'s methods return promises:
 *
 * ```ts
 * const kfg = new Kfg(new JsonAsyncDriver({ path: "config.json" }), schema);
 * await kfg.load();
 * await kfg.set("server.port", 8080);
 * kfg.get("server.port"); // reads stay synchronous — they hit the cache
 * ```
 *
 * `lazy` and `Kfg.pool` are not available here: both materialize state on
 * first access, which cannot be done behind a synchronous `get()`.
 */
export class JsonAsyncDriver extends JsonDriverBase<true> {
	constructor(config: JsonDriverConfig = {}) {
		super("json-async-driver", config, true);
	}

	async load(schema: SchemaDefinition): Promise<Record<string, any>> {
		const filePath = this.getFilePath();

		// Falls back to (and restores from) the backup when the main file is
		// corrupted; returns undefined when there is nothing usable.
		const content = await safeReadFile(filePath, {
			backup: this.config.allow_backup ?? true,
			validate: isValidJson,
		});

		return this.parseContent(content, schema);
	}

	async save(
		data: Record<string, any>,
		options?: { path?: string; description?: string },
	): Promise<void> {
		await safeWriteFile(
			this.getFilePath(),
			this.serializeData(data, options),
			this.writeOptions(),
		);
	}

	/**
	 * Locked read-modify-write. The lock is held across the whole cycle, so
	 * concurrent writers queue instead of losing each other's updates — and
	 * waiting for it yields rather than blocking.
	 */
	async transaction(
		schema: SchemaDefinition,
		fn: (current: Record<string, any>) => Record<string, any>,
	): Promise<void> {
		const filePath = this.getFilePath();

		await safeMutateFile(
			filePath,
			() => readIfPresent(filePath),
			(currentContent) =>
				this.serializeData(fn(this.parseCurrent(currentContent, schema))),
			this.writeOptions(),
		);
	}
}

/** Reads a file, treating "not there yet" as an empty result. */
async function readIfPresent(filePath: string): Promise<string | undefined> {
	try {
		return await readFile(filePath, "utf-8");
	} catch {
		return undefined;
	}
}
