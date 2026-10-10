import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const WEB = join(import.meta.dir, "..", "..");
const FORBIDDEN = /FCFA|\+2376|\bXAF\b/;
// The business's own support line, not a market rule.
const EXEMPT = ["src/app/(public)/contact/page.tsx"];

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === "test" ? [] : walk(path);
		return /\.(test|fixture)\.tsx?$/.test(name) ? [] : [path];
	});
}

describe("market data is served, never literal", () => {
	test("no FCFA, XAF or +2376 in src/ or messages/ (tests and src/test fixtures excepted)", () => {
		const offenders = [
			...walk(join(WEB, "src")),
			...walk(join(WEB, "messages")),
		]
			.filter((file) => !EXEMPT.some((e) => file.endsWith(e)))
			.filter((file) => FORBIDDEN.test(readFileSync(file, "utf8")));
		expect(offenders.map((f) => f.slice(WEB.length))).toEqual([]);
	});
});
