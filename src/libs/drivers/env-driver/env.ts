import { readFileSync, writeFileSync } from "fs";

// Helpers
const isJsonLike = (val: string) =>
    (val.startsWith("{") && val.endsWith("}")) ||
    (val.startsWith("[") && val.endsWith("]"));

const parseValue = (val: string): any => {
    const trimmed = val.trim();

    // Multiline (triple quotes)
    if (trimmed.startsWith('"""') && trimmed.endsWith('"""')) {
        return trimmed.slice(3, -3).replace(/\\n/g, "\n");
    }

    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (!isNaN(Number(trimmed))) return Number(trimmed);

    try {
        if (isJsonLike(trimmed)) return JSON.parse(trimmed);
    } catch {}

    // Return as plain string
    return trimmed.replace(/^"(.*)"$/, '$1'); // remove surrounding quotes
};

const stringifyValue = (val: any): string => {
    if (typeof val === "string") {
        if (val.includes("\n")) {
            return `"""${val.replace(/\n/g, "\\n")}"""`;
        }
        return `"${val.replace(/"/g, '\\"')}"`;
    }
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    return JSON.stringify(val);
};

const parse = (raw: string): Record<string, any> => {
    const lines = raw.replace(/\r\n?/g, '\n').split("\n");

    const result: Record<string, any> = {};
    let currentKey: string | null = null;
    let buffer: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        if (currentKey && trimmed.endsWith('"""')) {
            buffer.push(trimmed.slice(0, -3));
            result[currentKey] = parseValue(`"""${buffer.join("\\n")}"""`);
            currentKey = null;
            buffer = [];
            continue;
        }

        if (currentKey) {
            buffer.push(trimmed);
            continue;
        }

        const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
        if (match) {
            const [, key, rawValue] = match;

            if (rawValue.startsWith('"""') && !rawValue.endsWith('"""')) {
                currentKey = key;
                buffer.push(rawValue.slice(3));
                continue;
            }

            result[key] = parseValue(rawValue);
        }
    }

    return result;
};

const stringify = (data: Record<string, any>): string => {
    return Object.entries(data)
        .map(([key, val]) => `${key}=${stringifyValue(val)}`)
        .join("\n") + "\n";
};

const read = (path: string): Record<string, any> => {
    const content = readFileSync(path, "utf8");
    return parse(content);
};

const write = (path: string, data: Record<string, any>): void => {
    writeFileSync(path, stringify(data), "utf8");
};

// export API
export const env = {
    parse,
    stringify,
    read,
    write
};
