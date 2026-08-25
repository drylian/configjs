import * as fs from "node:fs";
import type { SchemaDefinition } from "../types";
import {
	safeMutateFileSync,
	safeReadFileSync,
	safeWriteFileSync,
} from "../utils/safe-write";
import {
	isValidJson,
	JsonDriverBase,
	type JsonDriverConfig,
} from "./json-driver-base";

export type { JsonDriverConfig };

/**
 * Persists the configuration to a JSON file, synchronously.
 *
 * Every write goes through the safeguard layer: lock file, temp-write +
 * verification + atomic rename, and a backup mirror used to recover a
 * corrupted main file on load. See `JsonAsyncDriver` for the non-blocking
 * counterpart.
 */
export class JsonDriver extends JsonDriverBase<false> {
	constructor(config: JsonDriverConfig = {}) {
		super("json-driver", config, false);
	}

	load(schema: SchemaDefinition): Record<string, any> {
		const filePath = this.getFilePath();
		let content: string | undefined;

		if (fs.existsSync(filePath)) {
			// Falls back to (and restores from) the backup when the main file is corrupted.
			content = safeReadFileSync(filePath, {
				backup: this.config.allow_backup ?? true,
				validate: isValidJson,
			});
			if (content === undefined && fs.readFileSync(filePath, "utf-8").trim()) {
				console.warn(
					`[JsonDriver] Failed to parse ${filePath} and no valid backup found.`,
				);
			}
		}

		return this.parseContent(content, schema);
	}

	save(
		data: Record<string, any>,
		options?: { path?: string; description?: string },
	): void {
		safeWriteFileSync(
			this.getFilePath(),
			this.serializeData(data, options),
			this.writeOptions(),
		);
	}

	/**
	 * Locked read-modify-write: reads the current persisted config, passes it
	 * to `fn`, and atomically writes the result — all under one lock, so
	 * concurrent processes cannot lose updates.
	 */
	transaction(
		schema: SchemaDefinition,
		fn: (current: Record<string, any>) => Record<string, any>,
	): void {
		const filePath = this.getFilePath();

		safeMutateFileSync(
			filePath,
			() =>
				fs.existsSync(filePath)
					? fs.readFileSync(filePath, "utf-8")
					: undefined,
			(currentContent) =>
				this.serializeData(fn(this.parseCurrent(currentContent, schema))),
			this.writeOptions(),
		);
	}
}
