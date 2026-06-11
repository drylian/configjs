// Child process: hammers a shared JSON config with many set() calls.
// Usage: bun sim/writer.ts <filePath> <id> <iterations>
import { c, JsonDriver, Kfg } from "../src";

const [, , filePath, id, itersRaw] = process.argv;
const iters = Number(itersRaw);

const driver = new JsonDriver({ path: filePath, lock_timeout: 8000 });
const config = new Kfg(driver, {
	counters: c.record(c.string(), c.number(), { default: {} }),
	last_writer: c.string({ default: "none" }),
});

const useMutate = process.env.USE_MUTATE === "1";
config.load();

let ok = 0;
let retried = 0;
for (let i = 0; i < iters; i++) {
	try {
		if (useMutate) {
			config.mutate((draft: any) => {
				draft.counters[id] = (draft.counters[id] ?? 0) + 1;
				draft.last_writer = `${id}:${i}`;
			});
		} else {
			config.load();
			const counters =
				(config.get("counters") as Record<string, number>) ?? {};
			counters[id] = (counters[id] ?? 0) + 1;
			config.set("counters", counters);
			config.set("last_writer", `${id}:${i}`);
		}
		ok++;
	} catch (e: any) {
		// Lock contention that exceeded the timeout — count and retry.
		retried++;
		i--;
		if (retried > iters * 50) {
			console.error(`[${id}] gave up: ${e.message}`);
			process.exit(2);
		}
	}
}

console.log(JSON.stringify({ id, ok, retried }));
