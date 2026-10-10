import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Next refuses to boot when two sibling folders use different names for the
 * same dynamic segment ('id' !== 'orderId') — but only at router start, which
 * no int test exercises; it crashed the deployed admin. Pin it statically.
 */
const APP = path.resolve(__dirname, "../../src/app");

function walk(dir: string, conflicts: string[]): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	const dynamic = entries.filter(
		(e) =>
			e.startsWith("[") &&
			e.endsWith("]") &&
			statSync(path.join(dir, e)).isDirectory(),
	);
	const names = new Set(dynamic.map((d) => d.replace(/^\[\.*|\]$/g, "")));
	if (dynamic.length > 1 && names.size > 1)
		conflicts.push(`${path.relative(APP, dir)}: ${dynamic.join(" vs ")}`);
	for (const e of entries) {
		const f = path.join(dir, e);
		if (statSync(f).isDirectory()) walk(f, conflicts);
	}
}

describe("the app router's dynamic segments", () => {
	it("never uses two slug names for the same dynamic path", () => {
		const conflicts: string[] = [];
		walk(APP, conflicts);
		expect(conflicts).toEqual([]);
	});
});
