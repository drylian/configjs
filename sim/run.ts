// Orchestrates concurrency simulations and reports findings.
import * as fs from "node:fs";
import * as path from "node:path";

const dir = path.resolve(process.cwd(), "sim", ".tmp");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

function section(t: string) {
	console.log(`\n=== ${t} ===`);
}

// ---------------------------------------------------------------------------
section("1. renameSync over an existing file (Windows atomic-replace check)");
{
	const target = path.join(dir, "rename.txt");
	fs.writeFileSync(target, "OLD");
	fs.writeFileSync(`${target}.tmp`, "NEW");
	try {
		fs.renameSync(`${target}.tmp`, target);
		console.log("result:", fs.readFileSync(target, "utf-8"), "(expected NEW)");
	} catch (e: any) {
		console.log("FAILED:", e.code, e.message);
	}
}

// ---------------------------------------------------------------------------
section("2. Multi-process concurrent writers (10 procs x 30 set each)");
{
	const target = path.join(dir, "shared.json");
	const N = 10;
	const ITERS = 30;
	const useMutate = process.env.USE_MUTATE === "1";
	console.log(`  mode: ${useMutate ? "mutate() transactional" : "load()+set()"}`);
	const procs = Array.from({ length: N }, (_, i) =>
		Bun.spawn(["bun", "sim/writer.ts", target, `w${i}`, String(ITERS)], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, USE_MUTATE: useMutate ? "1" : "0" },
		}),
	);

	const results = await Promise.all(
		procs.map(async (p) => {
			const out = await new Response(p.stdout).text();
			const err = await new Response(p.stderr).text();
			await p.exited;
			return { code: p.exitCode, out: out.trim(), err: err.trim() };
		}),
	);

	let totalRetries = 0;
	let crashed = 0;
	for (const r of results) {
		if (r.code !== 0) {
			crashed++;
			console.log("  proc nonzero exit:", r.code, r.err);
			continue;
		}
		try {
			const parsed = JSON.parse(r.out);
			totalRetries += parsed.retried;
		} catch {
			console.log("  unparseable proc output:", r.out, r.err);
		}
	}

	// Validate final file integrity.
	const raw = fs.readFileSync(target, "utf-8");
	let valid = false;
	let counters: Record<string, number> = {};
	try {
		const obj = JSON.parse(raw);
		valid = true;
		counters = obj.counters ?? {};
	} catch (e: any) {
		console.log("  FINAL FILE CORRUPTED:", e.message);
	}

	const sum = Object.values(counters).reduce((a, b) => a + b, 0);
	console.log(`  procs crashed: ${crashed}/${N}`);
	console.log(`  total lock retries: ${totalRetries}`);
	console.log(`  final JSON valid: ${valid}`);
	console.log(`  counters: ${JSON.stringify(counters)}`);
	console.log(`  sum of counters: ${sum} (each proc did ${ITERS} writes)`);
	console.log(
		`  LOST UPDATES: ${N * ITERS - sum} (expected ${N * ITERS} if no read-modify-write races)`,
	);
	// leftover lock/tmp files?
	const leftovers = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".lock") || f.endsWith(".tmp"));
	console.log(`  leftover lock/tmp files: ${JSON.stringify(leftovers)}`);
}

// ---------------------------------------------------------------------------
section("3. Reader observes only complete files during a write storm");
{
	const target = path.join(dir, "torn.json");
	fs.writeFileSync(target, JSON.stringify({ n: 0 }));
	const writer = Bun.spawn(
		["bun", "sim/writer.ts", target, "tw", "50"],
		{ stdout: "pipe", stderr: "pipe" },
	);

	let reads = 0;
	let tornOrMissing = 0;
	const start = Date.now();
	while (Date.now() - start < 800) {
		try {
			const raw = fs.readFileSync(target, "utf-8");
			JSON.parse(raw);
			reads++;
		} catch {
			tornOrMissing++;
		}
	}
	await writer.exited;
	console.log(`  successful parses: ${reads}`);
	console.log(`  torn/missing reads: ${tornOrMissing}`);
}

// ---------------------------------------------------------------------------
section("4. Both main file AND backup corrupted");
{
	const target = path.join(dir, "doomed.json");
	const { c, JsonDriver, Kfg } = await import("../src");
	const driver = new JsonDriver({ path: target });
	const config = new Kfg(driver, { name: c.string({ default: "init" }) });
	config.load();
	config.set("name", "value1");
	// Corrupt both
	fs.writeFileSync(target, "{broken");
	fs.writeFileSync(`${target}.bak`, "{also broken");
	try {
		const driver2 = new JsonDriver({ path: target });
		const config2 = new Kfg(driver2, { name: c.string({ default: "init" }) });
		config2.load();
		console.log("  load() recovered to default:", config2.get("name"));
	} catch (e: any) {
		console.log("  load() threw:", e.message.split("\n")[0]);
	}
}

console.log("\nDone.");
