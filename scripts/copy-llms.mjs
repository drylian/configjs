// Copies llms.txt into the generated docs output so it ships with GitHub Pages.
// Runs as the `postdocs` npm lifecycle hook (after `typedoc`). Plain Node so it
// works in the docs CI (node + npm, no bun).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const src = resolve("llms.txt");
const dest = resolve("docs", "llms.txt");

if (!existsSync(src)) {
	console.warn(`[copy-llms] ${src} not found — skipping.`);
	process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-llms] copied llms.txt -> ${dest}`);
