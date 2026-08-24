type ValidationIssue = {
	path?: string;
	message?: string;
	schema?: { type?: string; custom_error?: string } & Record<string, unknown>;
	value?: unknown;
};

function normalizePath(path?: string): string {
	if (!path || path === "/") return "(root)";
	return path.replace(/^\//, "").replace(/\//g, ".");
}

function typeOfValue(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

export function notLoadedMessage(operation: string): string {
	return `[KFG] Configuration not loaded. Call load() before ${operation}.`;
}

export function defaultValidationMessage(issues: ValidationIssue[]): string {
	const lines = issues.map((issue) => {
		const path = normalizePath(issue.path);
		if (issue.schema?.custom_error) {
			return `- ${path}: ${issue.schema.custom_error}`;
		}
		const expected = issue.schema?.type ? ` expected ${issue.schema.type}` : "";
		const received =
			issue.value !== undefined ? `, received ${typeOfValue(issue.value)}` : "";
		const detail = issue.message ? ` (${issue.message})` : "";
		return `- ${path}:${expected}${received}${detail}`;
	});

	return [
		"[KFG] Invalid configuration.",
		"Please fix the entries below and load again:",
		...lines,
	].join("\n");
}

/**
 * Thrown when a pooled operation runs with no active scope and no
 * `defaultScope` configured. Carries the attempted operation so the caller can
 * tell which call site is missing its scope.
 */
export class KfgScopeError extends Error {
	public readonly operation: string;

	constructor(operation: string) {
		super(
			`[KFG] No active scope while ${operation}. Use pool.run(id, fn), pool.for(id), or configure a defaultScope.`,
		);
		this.name = "KfgScopeError";
		this.operation = operation;
	}
}

/**
 * Thrown when configuration fails validation.
 *
 * Extends `Error` and keeps the formatted message in `.message` exactly as
 * before, so anything reading the string still works; the structured fields are
 * additive, and let a host attribute the failure to one scope (e.g. mark a
 * single tenant as broken) instead of taking the process down.
 */
export class KfgValidationError extends Error {
	/** Whether the failure came from the schema or from a `refines` validator. */
	public readonly kind: "schema" | "refine";
	/** Raw TypeBox errors ("schema") or the formatted failure lines ("refine"). */
	public readonly errors: unknown[];
	/** Dot paths that failed, when they could be determined. */
	public readonly paths: string[];
	/** Scope id of the instance that failed, when it belongs to a pool. */
	public readonly scope: string | undefined;

	constructor(
		message: string,
		options: {
			kind: "schema" | "refine";
			errors: unknown[];
			paths?: string[];
			scope?: string | undefined;
		},
	) {
		super(message);
		this.name = "KfgValidationError";
		this.kind = options.kind;
		this.errors = options.errors;
		this.paths = options.paths ?? [];
		this.scope = options.scope;
	}
}

/** Extracts dot paths from raw TypeBox validation issues. */
export function issuePaths(issues: ValidationIssue[]): string[] {
	return issues.map((issue) => normalizePath(issue.path));
}
