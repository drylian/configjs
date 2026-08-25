import * as path from "node:path";
import { ValueErrorType } from "@sinclair/typebox/errors";
import { KfgDriver } from "../kfg-driver";
import type { SchemaDefinition } from "../types";
import { colors } from "../utils/colors";
import { flattenObject, getProperty, unflattenObject } from "../utils/object";

/** Configuration accepted by both the sync and async JSON drivers. */
export interface JsonDriverConfig {
	path?: string;
	keyroot?: boolean;
	allow_backup?: boolean | string;
	lock_timeout?: number;
	mutate_set?: boolean;
}

export function isValidJson(content: string): boolean {
	if (!content.trim()) return false;
	try {
		JSON.parse(content);
		return true;
	} catch {
		return false;
	}
}

export abstract class JsonDriverBase<Async extends boolean> extends KfgDriver<
	JsonDriverConfig,
	Async
> {
	protected comments: Record<string, string> = {};

	constructor(name: string, config: JsonDriverConfig, isAsync: Async) {
		super({ name, config, async: isAsync });
	}

	/** Parses raw file content into a config object (comments/keyroot/defaults). */
	protected parseContent(
		content: string | undefined,
		schema: SchemaDefinition,
	): Record<string, any> {
		const defaultData = this.buildDefault(schema);
		let loadedData: Record<string, any> = content?.trim()
			? JSON.parse(content)
			: {};

		if (this.config.keyroot) {
			const flat = loadedData;
			const cleanFlat: Record<string, any> = {};
			this.comments = {};
			for (const key in flat) {
				if (key.endsWith(":comment")) {
					this.comments[key.replace(/:comment$/, "")] = flat[key];
				} else {
					cleanFlat[key] = flat[key];
				}
			}
			loadedData = unflattenObject(cleanFlat);
		} else {
			this.comments = this.stripComments(loadedData);
		}

		return this.merge(defaultData, loadedData);
	}

	/** Safe-write options derived from the driver config. */
	protected writeOptions() {
		return {
			backup: this.config.allow_backup ?? true,
			verify: isValidJson,
			lockTimeout: this.config.lock_timeout,
		};
	}

	/** Parses content read inside a transaction, tolerating a corrupted file. */
	protected parseCurrent(
		currentContent: string | undefined,
		schema: SchemaDefinition,
	): Record<string, any> {
		return this.parseContent(
			currentContent && isValidJson(currentContent)
				? currentContent
				: undefined,
			schema,
		);
	}

	/** Serializes a config object to the on-disk JSON string (comments/keyroot). */
	protected serializeData(
		data: Record<string, any>,
		options?: { path?: string; description?: string },
	): string {
		if (options?.path && options?.description) {
			this.comments[options.path] = options.description;
		}

		let dataToSave: Record<string, any>;
		if (this.config.keyroot) {
			dataToSave = flattenObject(data);
			for (const key in this.comments) {
				dataToSave[`${key}:comment`] = this.comments[key];
			}
		} else {
			dataToSave = JSON.parse(JSON.stringify(data));
			this.injectComments(dataToSave, this.comments);
		}
		return JSON.stringify(dataToSave, null, 2);
	}

	formatError(errors: any[]): string {
		const missing: string[] = [];
		const invalid: string[] = [];
		const fileLabel = this.config.path || "config.json";

		const reportedMissingPaths = new Set<string>();

		for (const err of errors) {
			const jsonPath = err.path;
			const isMissing =
				err.type === ValueErrorType.ObjectRequiredProperty ||
				err.message.toLowerCase().includes("required");
			if (isMissing) {
				reportedMissingPaths.add(jsonPath);
			}
		}

		for (const err of errors) {
			const jsonPath = err.path;
			const key = jsonPath.split("/").pop() || "unknown";

			const isMissing =
				err.type === ValueErrorType.ObjectRequiredProperty ||
				err.message.toLowerCase().includes("required");

			if (
				!isMissing &&
				reportedMissingPaths.has(jsonPath) &&
				err.value === undefined
			) {
				continue;
			}

			if (err.schema?.custom_error) {
				invalid.push(`in ${fileLabel} fix:\n${err.schema.custom_error}`);
			} else if (isMissing) {
				const example = this.jsonMissingExample(err.schema, key);
				missing.push(`in ${fileLabel} add:\n${example}`);
			} else {
				const expectedType = err.schema?.type || "unknown";
				const received = JSON.stringify(err.value);
				const expected = this.jsonExpectedExample(err.schema, key, jsonPath);
				const receivedKey = this.config.keyroot
					? jsonPath.replace(/^\//, "").replace(/\//g, ".")
					: key;
				invalid.push(
					`in ${fileLabel} fix:\n${colors.gray("received:")}\n${this.colorizeJson(this.wrapJson({ [receivedKey]: err.value }), "received")}\n${colors.gray("expected:")}\n${expected}\n(type: ${expectedType}, received: ${received})`,
				);
			}
		}

		const sections: string[] = [
			colors.bold("[KFG] Invalid JSON configuration."),
		];
		if (missing.length > 0) {
			sections.push("Required entries not configured:");
			sections.push(...missing);
		}
		if (invalid.length > 0) {
			sections.push("Invalid values:");
			sections.push(...invalid);
		}
		sections.push("Fix the JSON file and run load() again.");
		return sections.join("\n");
	}

	protected jsonExpectedValue(schema: any): unknown {
		if (!schema || typeof schema !== "object") return "<unknown>";
		if (schema.default !== undefined) return schema.default;

		switch (schema.type) {
			case "string":
				return "<string>";
			case "number":
				return "<number>";
			case "integer":
				return "<integer>";
			case "boolean":
				return "<boolean>";
			case "array":
				return [];
			case "object": {
				const out: Record<string, unknown> = {};
				if (schema.properties && typeof schema.properties === "object") {
					for (const prop of Object.keys(schema.properties)) {
						out[prop] = this.jsonExpectedValue(schema.properties[prop]);
					}
				}
				return out;
			}
			default:
				return `<${schema.type || "unknown"}>`;
		}
	}

	protected wrapJson(value: unknown): string {
		return JSON.stringify(value, null, 2);
	}

	protected colorizeJson(
		jsonText: string,
		mode: "expected" | "received",
	): string {
		const color = mode === "expected" ? colors.green : colors.red;
		return jsonText
			.split("\n")
			.map((line) => {
				const trimmed = line.trim();
				if (
					trimmed === "{" ||
					trimmed === "}" ||
					trimmed === "}," ||
					trimmed === "{,"
				) {
					return colors.gray(line);
				}
				if (!trimmed) return line;
				return color(line);
			})
			.join("\n");
	}

	protected jsonMissingExample(schema: any, key: string): string {
		if (this.config.keyroot) {
			return this.colorizeJson(
				this.wrapJson(this.flattenExpectedSchema(schema, key)),
				"expected",
			);
		}
		return this.colorizeJson(
			this.wrapJson({ [key]: this.jsonExpectedValue(schema) }),
			"expected",
		);
	}

	protected jsonExpectedExample(
		schema: any,
		key: string,
		jsonPath?: string,
	): string {
		if (this.config.keyroot) {
			const fullKey = jsonPath
				? jsonPath.replace(/^\//, "").replace(/\//g, ".")
				: key;
			return this.colorizeJson(
				this.wrapJson(this.flattenExpectedSchema(schema, fullKey)),
				"expected",
			);
		}
		return this.colorizeJson(
			this.wrapJson({ [key]: this.jsonExpectedValue(schema) }),
			"expected",
		);
	}

	protected flattenExpectedSchema(
		schema: any,
		prefix: string,
	): Record<string, unknown> {
		if (!schema || typeof schema !== "object") {
			return { [prefix]: "<unknown>" };
		}

		if (
			schema.type === "object" &&
			schema.properties &&
			typeof schema.properties === "object"
		) {
			const out: Record<string, unknown> = {};
			for (const prop of Object.keys(schema.properties)) {
				const nestedPrefix = prefix ? `${prefix}.${prop}` : prop;
				Object.assign(
					out,
					this.flattenExpectedSchema(schema.properties[prop], nestedPrefix),
				);
			}
			if (Object.keys(out).length > 0) {
				return out;
			}
		}

		return { [prefix]: this.jsonExpectedValue(schema) };
	}

	// Helper to get path
	protected getFilePath(): string {
		return path.resolve(process.cwd(), this.config.path || "config.json");
	}

	// Helper to strip comments
	protected stripComments(data: any): Record<string, string> {
		const comments: Record<string, string> = {};

		const recurse = (obj: any, prefix: string) => {
			if (!obj || typeof obj !== "object") return;

			for (const key of Object.keys(obj)) {
				if (key.endsWith(":comment")) {
					const realKey = key.replace(/:comment$/, "");
					const fullPath = prefix ? `${prefix}.${realKey}` : realKey;
					comments[fullPath] = obj[key];
					delete obj[key];
				} else if (typeof obj[key] === "object") {
					recurse(obj[key], prefix ? `${prefix}.${key}` : key);
				}
			}
		};
		recurse(data, "");
		return comments;
	}

	protected injectComments(data: any, comments: Record<string, string>) {
		for (const [path, comment] of Object.entries(comments)) {
			const keys = path.split(".");
			const last = keys.pop()!;
			const parentPath = keys.join(".");

			const target = parentPath ? getProperty(data, parentPath) : data;
			if (target && typeof target === "object") {
				target[`${last}:comment`] = comment;
			}
		}
	}
}
