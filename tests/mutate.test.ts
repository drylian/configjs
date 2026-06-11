import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { c, JsonDriver, Kfg } from "../src";

const tmpDir = path.resolve(process.cwd(), "tests", ".tmp-mutate");
fs.mkdirSync(tmpDir, { recursive: true });
const tmpFile = (n: string) => path.join(tmpDir, n);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("Kfg.mutate (transactional)", () => {
	test("mutates in place and persists", () => {
		const filePath = tmpFile("a.json");
		const config = new Kfg(new JsonDriver({ path: filePath }), {
			count: c.number({ default: 0 }),
		});
		config.load();
		config.mutate((d) => {
			d.count = d.count + 5;
		});
		expect(config.get("count")).toBe(5);
		expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).count).toBe(5);
	});

	test("reads the latest on-disk state, not the stale in-memory cache", () => {
		const filePath = tmpFile("b.json");
		const schema = { count: c.number({ default: 0 }) };
		const a = new Kfg(new JsonDriver({ path: filePath }), schema);
		const b = new Kfg(new JsonDriver({ path: filePath }), schema);
		a.load();
		b.load();

		// b writes behind a's back
		b.mutate((d) => {
			d.count = 100;
		});

		// a still thinks count is 0, but mutate must read fresh and build on 100
		a.mutate((d) => {
			d.count = d.count + 1;
		});
		expect(a.get("count")).toBe(101);
	});

	test("validation failure inside mutate leaves the file untouched", () => {
		const filePath = tmpFile("c.json");
		const config = new Kfg(new JsonDriver({ path: filePath }), {
			port: c.number({ minimum: 1, maximum: 65535, default: 8080 }),
		});
		config.load();
		config.mutate((d) => {
			d.port = 3000;
		});

		expect(() =>
			config.mutate((d) => {
				d.port = -1;
			}),
		).toThrow();
		// Last valid value preserved on disk
		expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).port).toBe(3000);
	});

	test("returning a replacement object works too", () => {
		const filePath = tmpFile("d.json");
		const config = new Kfg(new JsonDriver({ path: filePath }), {
			name: c.string({ default: "x" }),
			count: c.number({ default: 0 }),
		});
		config.load();
		config.mutate((d) => ({ ...d, name: "y", count: 9 }));
		expect(config.get("name")).toBe("y");
		expect(config.get("count")).toBe(9);
	});

	test("works without an explicit prior load()", () => {
		const filePath = tmpFile("e.json");
		const config = new Kfg(new JsonDriver({ path: filePath }), {
			count: c.number({ default: 0 }),
		});
		config.mutate((d) => {
			d.count = 3;
		});
		expect(config.get("count")).toBe(3);
	});
});
