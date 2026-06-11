import { FormatRegistry } from "@sinclair/typebox";

/**
 * Central registry of string formats used by `c.*` helpers and `rule()`.
 * Importing this module (side effect) guarantees every format referenced
 * in generated schemas actually validates — unregistered formats are
 * silently accepted by TypeBox.
 */

const IPV4 =
	/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/;
const IPV6 =
	/^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9]))$/;

function register(name: string, check: (value: string) => boolean): void {
	if (!FormatRegistry.Has(name)) {
		FormatRegistry.Set(name, check);
	}
}

register("email", (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
register("uuid", (v) =>
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		v,
	),
);
register("ipv4", (v) => IPV4.test(v));
register("ipv6", (v) => IPV6.test(v));
register("ip", (v) => IPV4.test(v) || IPV6.test(v));
register("uri", (v) => {
	try {
		new URL(v);
		return true;
	} catch {
		return false;
	}
});
register("date-time", (v) => !Number.isNaN(Date.parse(v)));
register(
	"date",
	(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
);
register("time", (v) =>
	/^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/.test(v),
);
register("mac", (v) =>
	/^(?:[0-9A-Fa-f]{2}([:-]))(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}$/.test(v),
);
register("json", (v) => {
	try {
		JSON.parse(v);
		return true;
	} catch {
		return false;
	}
});
register("hex-color", (v) =>
	/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v),
);
register("timezone", (v) => {
	try {
		new Intl.DateTimeFormat(undefined, { timeZone: v });
		return true;
	} catch {
		return false;
	}
});
register("hostname", (v) =>
	/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
		v,
	),
);
