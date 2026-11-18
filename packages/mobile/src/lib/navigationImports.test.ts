import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// expo-router ships its own copy of React Navigation. Hooks or contexts taken
// from the separate `@react-navigation/native` package read a provider that
// is never mounted: the app crashed at launch with "Could not find a
// navigation object". Everything navigation comes from expo-router.
const ROOTS = ["app", "src"].map((dir) =>
	path.join(import.meta.dir, "../..", dir),
);

function files(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) files(full, out);
		else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts"))
			out.push(full);
	}
	return out;
}

describe("navigation imports", () => {
	test("nothing imports @react-navigation/* directly", () => {
		const offenders = ROOTS.flatMap((root) => files(root)).filter((file) =>
			/from ["']@react-navigation\//.test(readFileSync(file, "utf8")),
		);
		expect(
			offenders.map((f) =>
				path.relative(path.join(import.meta.dir, "../.."), f),
			),
		).toEqual([]);
	});
});
