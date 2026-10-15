import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const APP = join(import.meta.dir, "../../app");

/** Groups with their own `_layout.tsx` set their screens' options there. */
const OWN_LAYOUT = ["(tabs)/", "checkout/"];
/** Expo's template modal, never navigated to. */
const UNUSED = new Set(["modal"]);

function routes(): string[] {
	const found: string[] = [];
	for (const rel of new Glob("**/*.tsx").scanSync({ cwd: APP })) {
		const name = rel.replace(/\.tsx$/, "");
		if (name.endsWith("_layout") || name.startsWith("+")) continue;
		if (OWN_LAYOUT.some((prefix) => name.startsWith(prefix))) continue;
		if (UNUSED.has(name)) continue;
		found.push(name);
	}
	return found.sort();
}

describe("root stack", () => {
	test("registers every screen, so none falls back to the default header", () => {
		const layout = readFileSync(join(APP, "_layout.tsx"), "utf8");
		const registered = new Set(
			[...layout.matchAll(/name="([^"]+)"/g)].map((match) => match[1]),
		);
		expect(routes().filter((route) => !registered.has(route))).toEqual([]);
	});
});
