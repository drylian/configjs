import * as fs from "node:fs";
import * as path from "node:path";
import { ValueErrorType } from "@sinclair/typebox/errors";
import { KfgDriver } from "../kfg-driver";
import type { SchemaDefinition, TSchema } from "../types";
import { colors } from "../utils/colors";
import { parse, removeEnvKey, updateEnvContent } from "../utils/env";
import { flattenObject } from "../utils/object";
import { safeMutateFileSync, safeWriteFileSync } from "../utils/safe-write";

export type EnvSource = "file" | "process" | "default" | "injected";

export class EnvDriver extends KfgDriver<
	{
		path?: string;
		forceexit?: boolean;
		forceExit?: boolean;
		debug?: boolean;
		allow_backup?: boolean | string;
		lock_timeout?: number;
		mutate_set?: boolean;
	},
	false
> {
	private tracing: Record<string, { source: EnvSource; key: string }> = {};

	constructor(
		config: {
			path?: string;
			forceexit?: boolean;
			forceExit?: boolean;
			debug?: boolean;
			allow_backup?: boolean | string;
		} = {},
	) {
		const forceExit = config.forceExit ?? config.forceexit ?? true;
		super({ name: "env-driver", config, async: false, forceExit });
	}

	load(schema: SchemaDefinition): Record<string, any> {
		const filePath = this.getFilePath();
		const fileContent = fs.existsSync(filePath)
			? fs.readFileSync(filePath, "utf-8")
			: "";
		const envFileValues = parse(fileContent);

		const processEnv = Object.fromEntries(
			Object.entries(process.env).filter(([, v]) => v !== undefined),
		) as Record<string, string>;

		// Reset tracing on each load
		this.tracing = {};

		const envData = this.traverseSchema(schema, envFileValues, processEnv);
		const defaultData = this.buildDefault(schema);

		const merged = this.merge(defaultData, envData);

		if (this.config.debug) {
			this.printTrace();
		}

		return merged;
	}

	save(
		data: Record<string, any>,
		options?: { path?: string; description?: string },
	): void {
		const filePath = this.getFilePath();
		const flatData = flattenObject(data);

		// If atomic update requested via options.path (called by Kfg.set when update not implemented)
		if (options?.path) {
			const value = flatData[options.path];
			this.update(options.path, value, options.description);
			return;
		}

		// Full save: read current, update all keys, write back
		let currentContent = fs.existsSync(filePath)
			? fs.readFileSync(filePath, "utf-8")
			: "";

		for (const [dotPath, value] of Object.entries(flatData)) {
			const envKey = this.pathToEnvKey(dotPath);
			currentContent = updateEnvContent(currentContent, envKey, value);
		}

		this.safeWrite(filePath, currentContent);
	}

	update(key: string, value: any, description?: string): void {
		const filePath = this.getFilePath();
		let content = fs.existsSync(filePath)
			? fs.readFileSync(filePath, "utf-8")
			: "";

		// Plain objects are stored as one env var per leaf (APP_META_OWNER=...),
		// matching how traverseSchema reads nested values back.
		const entries: [string, any][] =
			value !== null && typeof value === "object" && !Array.isArray(value)
				? Object.entries(flattenObject(value)).map(([subPath, subValue]) => [
						`${key}.${subPath}`,
						subValue,
					])
				: [[key, value]];

		for (const [dotPath, entryValue] of entries) {
			const envKey = this.pathToEnvKey(dotPath);
			content = updateEnvContent(content, envKey, entryValue, description);
			this.tracing[dotPath] = { source: "injected", key: envKey };
		}
		this.safeWrite(filePath, content);
	}

	delete(key: string): void {
		const envKey = this.pathToEnvKey(key);
		const filePath = this.getFilePath();
		if (!fs.existsSync(filePath)) {
			return;
		}
		const currentContent = fs.readFileSync(filePath, "utf-8");
		const newContent = removeEnvKey(currentContent, envKey);
		this.safeWrite(filePath, newContent);
		delete this.tracing[key];
	}

	private safeWrite(filePath: string, content: string): void {
		safeWriteFileSync(filePath, content, {
			backup: this.config.allow_backup ?? true,
			lockTimeout: this.config.lock_timeout,
		});
	}

	/**
	 * Locked read-modify-write against the .env file: re-reads the file fresh,
	 * merges with process.env + defaults, hands it to `fn`, then writes every
	 * resulting key back — all under one lock, so concurrent writers can't lose
	 * updates.
	 */
	transaction(
		schema: SchemaDefinition,
		fn: (current: Record<string, any>) => Record<string, any>,
	): void {
		const filePath = this.getFilePath();
		const processEnv = Object.fromEntries(
			Object.entries(process.env).filter(([, v]) => v !== undefined),
		) as Record<string, string>;

		safeMutateFileSync(
			filePath,
			() =>
				fs.existsSync(filePath)
					? fs.readFileSync(filePath, "utf-8")
					: undefined,
			(currentContent) => {
				const fileValues = parse(currentContent ?? "");
				this.tracing = {};
				const envData = this.traverseSchema(schema, fileValues, processEnv);
				const merged = this.merge(this.buildDefault(schema), envData);

				const next = fn(merged);

				let content = currentContent ?? "";
				for (const [dotPath, value] of Object.entries(flattenObject(next))) {
					content = updateEnvContent(
						content,
						this.pathToEnvKey(dotPath),
						value,
					);
				}
				return content;
			},
			{
				backup: this.config.allow_backup ?? true,
				lockTimeout: this.config.lock_timeout,
			},
		);
	}

	formatError(errors: any[]): string {
		const missing: string[] = [];
		const invalid: string[] = [];
		const fileLabel = this.config.path || ".env";

		const reportedMissingPaths = new Set<string>();
		for (const err of errors) {
			const isMissing =
				err.type === ValueErrorType.ObjectRequiredProperty ||
				err.message.toLowerCase().includes("required");
			if (isMissing) reportedMissingPaths.add(err.path);
		}

		for (const err of errors) {
			const jsonPath = err.path;
			const envKey =
				err.schema?.prop ||
				jsonPath.replace(/^\//, "").replace(/\//g, "_").toUpperCase();
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

			const expectedType = err.schema?.type || "unknown";
			const expected =
				err.schema?.default !== undefined
					? JSON.stringify(err.schema.default)
					: `<${expectedType}>`;

			if (err.schema?.custom_error) {
				invalid.push(`in ${fileLabel} fix:\n${err.schema.custom_error}`);
			} else if (isMissing) {
				missing.push(colors.green(`+ ${envKey}=${expected}`));
			} else {
				const received =
					typeof err.value === "string" ? `"${err.value}"` : String(err.value);
				invalid.push(
					`in ${fileLabel} fix:\n${colors.gray("received:")}\n${colors.red(`- ${envKey}=${received}`)}\n${colors.gray("expected:")}\n${colors.green(`+ ${envKey}=${expected}`)}`,
				);
			}
		}

		const sections: string[] = [
			colors.bold("[KFG] Invalid environment configuration."),
		];
		if (missing.length > 0) {
			sections.push(`in ${fileLabel} add:`);
			sections.push(...missing);
		}
		if (invalid.length > 0) {
			sections.push("Invalid variable values:");
			sections.push(...invalid);
		}
		sections.push("Update your .env values and run load() again.");
		return sections.join("\n");
	}

	private getFilePath(): string {
		return path.resolve(process.cwd(), this.config.path || ".env");
	}

	private pathToEnvKey(path: string): string {
		return path.replace(/\./g, "_").toUpperCase();
	}

	private traverseSchema(
		schema: SchemaDefinition,
		envFileValues: Record<string, string>,
		processEnv: Record<string, string>,
		prefix: string[] = [],
	) {
		const builtConfig: Record<string, any> = {};

		for (const key in schema) {
			const currentPath = [...prefix, key];
			const definition = schema[key] as TSchema | SchemaDefinition;

			const isTypeBoxSchema = (def: any): def is TSchema =>
				!!def[Symbol.for("TypeBox.Kind")];

			if (isTypeBoxSchema(definition)) {
				// TypeBox Object with properties → recurse like a plain nested object
				// so APP_NAME=... and APP_PORT=... are read instead of a single APP=...
				if (
					(definition as any).type === "object" &&
					(definition as any).properties
				) {
					const nestedConfig = this.traverseSchema(
						(definition as any).properties as SchemaDefinition,
						envFileValues,
						processEnv,
						currentPath,
					);
					if (Object.keys(nestedConfig).length > 0) {
						builtConfig[key] = nestedConfig;
					}
				} else {
					const prop = definition.prop as string | undefined;
					const envKey = prop || currentPath.join("_").toUpperCase();
					const dotPath = currentPath.join(".");

					let value: any = processEnv[envKey];
					let source: EnvSource = "process";

					if (value === undefined) {
						value = envFileValues[envKey];
						source = "file";
					}

					if (value === undefined) {
						value = definition.default;
						source = "default";
					}

					if (value !== undefined) {
						this.tracing[dotPath] = { source, key: envKey };
						builtConfig[key] = this.coerceType(value, definition);
					}
				}
			} else if (typeof definition === "object" && definition !== null) {
				const nestedConfig = this.traverseSchema(
					definition as SchemaDefinition,
					envFileValues,
					processEnv,
					currentPath,
				);
				if (Object.keys(nestedConfig).length > 0) {
					builtConfig[key] = nestedConfig;
				}
			}
		}

		return builtConfig;
	}

	private coerceType(value: any, schema: TSchema) {
		if (value === undefined) return undefined;

		const type = (schema as any).type;
		if (type === "number") {
			// Keep non-numeric strings as-is so validation reports them
			// instead of silently coercing "" / "abc" to 0 / NaN.
			if (typeof value === "string" && value.trim() === "") return value;
			const num = Number(value);
			return Number.isNaN(num) ? value : num;
		}
		if (type === "boolean") {
			if (typeof value === "boolean") return value;
			const normalized = String(value).trim().toLowerCase();
			if (["true", "1", "yes", "on", "y"].includes(normalized)) return true;
			if (["false", "0", "no", "off", "n"].includes(normalized)) return false;
			// Unknown token: return the original so validation rejects it
			// rather than silently treating it as false.
			return value;
		}

		if (type === "array" && typeof value === "string") {
			const trimmedValue = value.trim();
			if (trimmedValue.startsWith("[") && trimmedValue.endsWith("]")) {
				try {
					return JSON.parse(trimmedValue);
				} catch {
					/* fallthrough */
				}
			}
		}

		if (type === "object" && typeof value === "string") {
			const trimmedValue = value.trim();
			if (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) {
				try {
					return JSON.parse(trimmedValue);
				} catch {
					/* fallthrough */
				}
			}
		}

		return value;
	}

	private printTrace() {
		console.log(colors.bold("\n[KFG] Environment Trace:"));
		for (const [path, info] of Object.entries(this.tracing)) {
			const sourceColor =
				info.source === "process"
					? colors.cyan
					: info.source === "file"
						? colors.green
						: info.source === "injected"
							? colors.yellow
							: colors.gray;

			console.log(
				`${colors.gray(path.padEnd(25))} -> ${colors.bold(info.key.padEnd(20))} [${sourceColor(info.source)}]`,
			);
		}
		console.log("");
	}
}
