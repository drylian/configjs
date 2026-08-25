import {
	type TObject,
	type TProperties,
	type TSchema,
	Type,
} from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { SchemaDefinition } from "../types";
/**
 * Adds smart defaults to a TypeBox schema.
 * @param schemaNode The schema to add the defaults to.
 * @param createmsNodes Optional sink collecting the nodes whose default is a
 * `createms` timestamp, so a cached schema can refresh them on reuse.
 */
export function addSmartDefaults(
	schemaNode: TObject,
	createmsNodes?: TSchema[],
): void {
	if (schemaNode.type !== "object" || !schemaNode.properties) {
		return;
	}
	let allChildrenOptional = true;
	for (const key in schemaNode.properties) {
		const prop = schemaNode.properties[key];

		// Ignore Unsafe schemas (used by cfs) as they are not standard TypeBox schemas
		if (prop[Symbol.for("TypeBox.Kind") as any] === "Unsafe") {
			continue;
		}

		if ((prop as any)[Symbol.for("isRandom")] && prop.default === undefined) {
			const max = (prop as any).max ?? 100;
			(prop as any).default = Math.floor(Math.random() * (max + 1));
		}
		if ((prop as any).createms) {
			(prop as any).default = Date.now();
			createmsNodes?.push(prop);
		}

		// Only recurse if the property is a valid TypeBox object schema
		if (prop.type === "object" && prop[Symbol.for("TypeBox.Kind") as any]) {
			addSmartDefaults(prop as TObject, createmsNodes);
		}
		const hasDefault = prop.default !== undefined;
		// Behavioral check for optionality
		const isOptional = Value.Check(Type.Object({ temp: prop }), {});
		if (!hasDefault && !isOptional) {
			allChildrenOptional = false;
		}
	}
	if (allChildrenOptional && schemaNode.default === undefined) {
		(schemaNode as any).default = {};
	}
}
/**
 * Builds a TypeBox schema from a schema definition.
 * @param definition The schema definition.
 * @returns The TypeBox schema.
 */
export function buildTypeBoxSchema(definition: SchemaDefinition): TObject {
	if (definition[Symbol.for("TypeBox.Kind") as any] === "Object") {
		return definition as TObject;
	}

	const properties: TProperties = {};
	for (const key in definition) {
		const value = definition[key] as any;

		const isObject =
			typeof value === "object" &&
			value !== null &&
			!value[Symbol.for("TypeBox.Kind")];
		if (isObject) {
			properties[key] = buildTypeBoxSchema(value);
		} else {
			properties[key] = value as TSchema;
		}
	}
	return Type.Object(properties, { additionalProperties: true });
}

type CompiledEntry = {
	compiled: TObject;
	/** Nodes whose default is a `createms` timestamp, refreshed on every reuse. */
	createmsNodes: TSchema[];
};

/**
 * Compiled schemas, keyed by the identity of the definition object they came
 * from. Building a schema walks the whole tree and runs a `Value.Check` per
 * property, which is by far the most expensive part of `load()` — and a pool
 * would otherwise pay it once per scope.
 */
const compiledCache = new WeakMap<object, CompiledEntry>();

/** `makeSchemaOptional` results, so `only_importants` also reuses one object. */
const optionalCache = new WeakMap<object, SchemaDefinition>();

/**
 * Compiles a schema definition into a TypeBox object with smart defaults
 * applied, memoized by the definition's identity.
 *
 * The compiled schema is only read during validation, so instances can safely
 * share it. Time-based `createms` defaults are the one part that must not be
 * frozen, and are recomputed on every call.
 */
export function compileSchema(definition: SchemaDefinition): TObject {
	const cached = compiledCache.get(definition as object);
	if (cached) {
		for (const node of cached.createmsNodes) {
			(node as any).default = Date.now();
		}
		return cached.compiled;
	}

	const compiled = buildTypeBoxSchema(definition);
	const createmsNodes: TSchema[] = [];
	addSmartDefaults(compiled, createmsNodes);

	compiledCache.set(definition as object, { compiled, createmsNodes });
	return compiled;
}

/** Memoized {@link makeSchemaOptional}, keyed by the definition's identity. */
export function optionalSchema(definition: SchemaDefinition): SchemaDefinition {
	const cached = optionalCache.get(definition as object);
	if (cached) return cached;

	const optional = makeSchemaOptional(definition);
	optionalCache.set(definition as object, optional);
	return optional;
}

/**
 * Builds a default object from a schema definition.
 * It converts the definition to a TypeBox schema, adds smart defaults,
 * and then generates the default value using TypeBox's Value.Default.
 * This ensures that nested defaults and priorities are handled correctly.
 * @param definition The schema definition.
 * @returns The default object.
 */
export function buildDefaultObject(
	definition: SchemaDefinition,
): Record<string, any> {
	const schema = compileSchema(definition);
	return Value.Default(schema, {}) as Record<string, any>;
}

/**
 * Makes a schema optional.
 * @param definition The schema definition.
 * @returns The optional schema.
 */
export function makeSchemaOptional(
	definition: SchemaDefinition,
): SchemaDefinition {
	const isSchemaOptional = (schema: TSchema): boolean => {
		return Value.Check(Type.Object({ temp: schema }), {});
	};

	const hasImportantRequirement = (node: any): boolean => {
		if (!node || typeof node !== "object") return false;

		if (node[Symbol.for("TypeBox.Kind")]) {
			const schemaNode = node as TSchema & { important?: boolean };
			if (schemaNode.important) return true;

			if (schemaNode.type === "object" && (schemaNode as any).properties) {
				return Object.values((schemaNode as any).properties).some((child) =>
					hasImportantRequirement(child),
				);
			}
			return false;
		}

		return Object.values(node).some((child) => hasImportantRequirement(child));
	};

	const makeTypeBoxOptional = (schema: TSchema): TSchema => {
		const schemaAny = schema as any;

		if (schemaAny.type === "object" && schemaAny.properties) {
			const nextProperties: Record<string, TSchema> = {};
			for (const propKey of Object.keys(schemaAny.properties)) {
				nextProperties[propKey] = makeTypeBoxOptional(
					schemaAny.properties[propKey],
				);
			}

			const clone: any = { ...schemaAny, properties: nextProperties };
			clone.required = Object.keys(nextProperties).filter(
				(propKey) => !isSchemaOptional(nextProperties[propKey]),
			);
			if (clone.required.length === 0) {
				delete clone.required;
			}

			const shouldKeepRequired =
				(clone as { important?: boolean }).important === true ||
				hasImportantRequirement(clone) ||
				isSchemaOptional(clone as TSchema);

			return shouldKeepRequired
				? (clone as TSchema)
				: Type.Optional(clone as TSchema);
		}

		const shouldKeepRequired =
			(schemaAny as { important?: boolean }).important === true ||
			hasImportantRequirement(schemaAny) ||
			isSchemaOptional(schema);

		return shouldKeepRequired ? schema : Type.Optional(schema);
	};

	const newDefinition: Record<string, any> = {};
	for (const key in definition) {
		const value = (definition as any)[key];
		if (value?.[Symbol.for("TypeBox.Kind")]) {
			newDefinition[key] = makeTypeBoxOptional(value as TSchema);
		} else if (typeof value === "object" && value !== null) {
			const next = makeSchemaOptional(value);
			newDefinition[key] = hasImportantRequirement(value)
				? next
				: Type.Optional(buildTypeBoxSchema(next as SchemaDefinition));
		} else {
			newDefinition[key] = value;
		}
	}
	return newDefinition;
}
