import * as fs from "node:fs";
import * as path from "node:path";
import { ValueErrorType } from "@sinclair/typebox/errors";
import { KfgDriver } from "../kfg-driver";
import type { SchemaDefinition } from "../types";
import { colors } from "../utils/colors";
import { flattenObject, getProperty, unflattenObject } from "../utils/object";
import {
	safeMutateFileSync,
	safeReadFileSync,
	safeWriteFileSync,
} from "../utils/safe-write";

function isValidJson(content: string): boolean {
	if (!content.trim()) return false;
	try {
		JSON.parse(content);
		return true;
	} catch {
		return false;
	}
}

export class JsonDriver extends KfgDriver<
	{
		path?: string;
		keyroot?: boolean;
		allow_backup?: boolean | string;
		lock_timeout?: number;
		mutate_set?: boolean;
	},
	false
> {
	private comments: Record<string, string> = {};

	constructor(
		config: {
			path?: string;
			keyroot?: boolean;
			allow_backup?: boolean | string;
			lock_timeout?: number;
			mutate_set?: boolean;
		} = {},
	) {
		super({ name: "json-driver", config, async: false });
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

	/** Parses raw file content into a config object (comments/keyroot/defaults). */
	private parseContent(
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

	/** Serializes a config object to the on-disk JSON string (comments/keyroot). */
	private serializeData(
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

	save(
		data: Record<string, any>,
		options?: { path?: string; description?: string },
	): void {
		const filePath = this.getFilePath();
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		safeWriteFileSync(filePath, this.serializeData(data, options), {
			backup: this.config.allow_backup ?? true,
			verify: isValidJson,
			lockTimeout: this.config.lock_timeout,
		});
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
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		safeMutateFileSync(
			filePath,
			() =>
				fs.existsSync(filePath)
					? fs.readFileSync(filePath, "utf-8")
					: undefined,
			(currentContent) => {
				const current = this.parseContent(
					currentContent && isValidJson(currentContent)
						? currentContent
						: undefined,
					schema,
				);
				const next = fn(current);
				return this.serializeData(next);
			},
			{
				backup: this.config.allow_backup ?? true,
				verify: isValidJson,
				lockTimeout: this.config.lock_timeout,
			},
		);
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

	private jsonExpectedValue(schema: any): unknown {
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

	private wrapJson(value: unknown): string {
		return JSON.stringify(value, null, 2);
	}

	private colorizeJson(
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

	private jsonMissingExample(schema: any, key: string): string {
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

	private jsonExpectedExample(
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

	private flattenExpectedSchema(
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
	private getFilePath(): string {
		return path.resolve(process.cwd(), this.config.path || "config.json");
	}

	// Helper to strip comments
	private stripComments(data: any): Record<string, string> {
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

	private injectComments(data: any, comments: Record<string, string>) {
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
