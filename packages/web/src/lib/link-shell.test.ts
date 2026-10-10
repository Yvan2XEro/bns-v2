import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Spec §2/§4: nothing under the seller tree links into the public shell
 * except the two sidebar-footer exits ("/s/{handle}" and "/"), which no
 * forbidden prefix matches. A literal starting /messages, /disputes/,
 * /returns/ or /shop/manage is a context ejection. */
const ROOTS = [
	path.resolve(import.meta.dir, "../app/(seller)"),
	path.resolve(import.meta.dir, "../components/seller"),
	path.resolve(import.meta.dir, "./seller-nav.ts"),
];
const FORBIDDEN = /["'`]\/(messages|disputes\/|returns\/|shop\/manage)/;

function sources(entry: string): string[] {
	if (!statSync(entry).isDirectory())
		return /\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry) ? [entry] : [];
	return readdirSync(entry).flatMap((child) =>
		sources(path.join(entry, child)),
	);
}

describe("the seller tree never exits its shell", () => {
	test("no public-surface href under app/(seller), components/seller or the nav", () => {
		const files = ROOTS.flatMap(sources);
		expect(files.length).toBeGreaterThan(20);
		const offenders: string[] = [];
		for (const file of files) {
			readFileSync(file, "utf8")
				.split("\n")
				.forEach((line, i) => {
					if (FORBIDDEN.test(line))
						offenders.push(`${file}:${i + 1}: ${line.trim()}`);
				});
		}
		expect(offenders).toEqual([]);
	});
});
