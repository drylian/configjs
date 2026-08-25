/**
 * Cached `path.split(".")` results.
 *
 * Splitting allocates an array on every read, and it is the dominant cost of
 * `getProperty` once the paths vary (measured: 0.114 us -> 0.027 us per read
 * across 360 distinct paths). Paths are almost always literals at the call
 * site, so the working set is small and hit rates are near 100%; the cap keeps
 * a caller that builds paths dynamically from growing the map without bound.
 */
const SEGMENTS_CACHE_MAX = 4096;
const segmentsCache = new Map<string, string[]>();

/** Splits a dot path into segments, memoized. The result must not be mutated. */
export function pathSegments(path: string): string[] {
	const cached = segmentsCache.get(path);
	if (cached !== undefined) return cached;

	const segments = path.split(".");
	// Plain reset rather than LRU eviction: this is a guard against unbounded
	// growth, not a working-set policy, and it keeps reads allocation-free.
	if (segmentsCache.size >= SEGMENTS_CACHE_MAX) segmentsCache.clear();
	segmentsCache.set(path, segments);
	return segments;
}

/**
 * Gets a property from an object using a dot-separated path.
 * @param obj The object to get the property from.
 * @param path The path to the property.
 * @returns The property value.
 */
export function getProperty<T extends Record<string, any>>(
	obj: T,
	path: string,
): any {
	const segments = pathSegments(path);
	let value: any = obj;
	for (let i = 0; i < segments.length; i++) {
		if (value === undefined || value === null) return undefined;
		value = value[segments[i]];
	}
	return value;
}

/**
 * Sets a property on an object using a dot-separated path.
 * @param obj The object to set the property on.
 * @param path The path to the property.
 * @param value The value to set.
 */
export function setProperty<T extends Record<string, any>>(
	obj: T,
	path: string,
	value: any,
): void {
	const keys = path.split(".");
	const lastKey = keys.pop() as string;
	let target: any = obj;
	for (const key of keys) {
		if (key === "__proto__" || key === "constructor" || key === "prototype") {
			// Abort entirely: skipping the segment would silently write the
			// remaining path onto the wrong object.
			return;
		}
		if (target[key] === undefined || target[key] === null) {
			target[key] = {};
		} else if (typeof target[key] !== "object") {
			throw new Error(`Cannot set property on non-object at path: ${key}`);
		}
		target = target[key];
	}
	if (
		lastKey !== "__proto__" &&
		lastKey !== "constructor" &&
		lastKey !== "prototype"
	) {
		target[lastKey] = value;
	}
}

/**
 * Checks if an item is an object.
 * @param item The item to check.
 * @returns True if the item is an object, false otherwise.
 */
export function isObject(item: any): item is Record<string, any> {
	return item !== null && typeof item === "object" && !Array.isArray(item);
}

/**
 * Deeply merges two objects.
 * @param target The target object.
 * @param source The source object.
 * @returns The merged object.
 */
export function deepMerge<T extends object, U extends object>(
	target: T,
	source: U,
): T & U {
	const output = { ...target } as T & U;

	if (isObject(target) && isObject(source)) {
		Object.keys(source).forEach((key) => {
			const sourceValue = source[key as keyof U];
			const targetValue = target[key as keyof T];

			if (isObject(sourceValue) && isObject(targetValue)) {
				(output as any)[key] = deepMerge(
					targetValue as object,
					sourceValue as object,
				);
			} else {
				(output as any)[key] = sourceValue;
			}
		});
	}

	return output;
}

/**
 * Flattens a nested object into a single-level object.
 * @param obj The object to flatten.
 * @param prefix The prefix to use for the keys.
 * @returns The flattened object.
 */
export function flattenObject(
	obj: Record<string, any>,
	prefix = "",
): Record<string, any> {
	return Object.keys(obj).reduce(
		(acc, k) => {
			const pre = prefix.length ? `${prefix}.` : "";
			if (isObject(obj[k]) && Object.keys(obj[k]).length > 0) {
				Object.assign(acc, flattenObject(obj[k], pre + k));
			} else {
				acc[pre + k] = obj[k];
			}
			return acc;
		},
		{} as Record<string, any>,
	);
}

/**
 * Unflattens a single-level object into a nested object.
 * @param obj The object to unflatten.
 * @returns The unflattened object.
 */
export function unflattenObject(obj: Record<string, any>): Record<string, any> {
	const result = {};
	for (const key in obj) {
		setProperty(result, key, obj[key]);
	}
	return result;
}

/**
 * Deletes a property from an object using a dot-separated path.
 * @param obj The object to delete the property from.
 * @param path The path to the property.
 * @returns True if the property was deleted, false otherwise.
 */
export function deleteProperty<T extends Record<string, any>>(
	obj: T,
	path: string,
): boolean {
	const keys = path.split(".");
	const lastKey = keys.pop() as string;
	let target: any = obj;
	for (const key of keys) {
		if (target?.[key] === undefined) {
			return false;
		}
		target = target[key];
	}
	if (typeof target === "object" && target !== null) {
		return delete target[lastKey];
	}
	return false;
}
