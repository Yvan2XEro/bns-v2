import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The rider page is reached by an SMS link with no sign-in, and chat apps and
 * carriers fetch a link to build its preview. Every POST here moves a real
 * parcel (picked up, failed attempt, handover), so none may run on render.
 * With no component-render harness (AGENTS.md) the property is pinned at the
 * source level, as `not-me-banner.test.ts` does: the calls must exist (the
 * paired positive) and each must sit inside a press handler, with no effect
 * anywhere to run one on mount.
 */
const files = readdirSync(import.meta.dir)
	.filter((name) => name.endsWith(".tsx"))
	.map((name) => ({
		name,
		source: readFileSync(join(import.meta.dir, name), "utf8"),
	}));
const read = (name: string) =>
	files.find((file) => file.name === name)?.source ?? "";

describe("the rider page never moves a parcel on render", () => {
	test("no file declares an effect", () => {
		expect(files.length).toBeGreaterThan(3);
		for (const { name, source } of files) {
			expect(source, name).not.toMatch(/useEffect|useLayoutEffect/);
		}
	});

	test("the four mutations exist, each called from a handler declared before the render", () => {
		const source = read("rider-actions.tsx");
		const calls = [...source.matchAll(/\.mutate\(/g)].map((m) => m.index ?? 0);
		expect(calls).toHaveLength(4);
		for (const index of calls) {
			const handler = source.lastIndexOf("const on", index);
			expect(handler).toBeGreaterThan(-1);
			expect(source.slice(handler, index)).not.toContain("return (");
		}
	});

	test("no other file mutates", () => {
		for (const { name, source } of files) {
			if (name === "rider-actions.tsx") continue;
			expect(source, name).not.toMatch(/\.mutate(Async)?\(/);
		}
	});
});

describe("the rider page renders only the projection", () => {
	test("reads view fields from the contract and nothing priced", () => {
		const source = read("rider-details.tsx");
		const topLevel = new Set(
			[...source.matchAll(/\bview\.(\w+)/g)].map((m) => m[1]),
		);
		expect([...topLevel].sort()).toEqual(
			[
				"attempts",
				"expectedCod",
				"items",
				"origin",
				"shipmentNumber",
				"shopName",
			].sort(),
		);
		expect(source).not.toMatch(/\b(fee|price|unitPrice|amounts|total)\b/);
	});
});
