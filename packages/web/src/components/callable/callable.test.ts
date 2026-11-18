import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { typedMatches } from "./callable";

describe("typedMatches", () => {
	test("accepts the word whatever its case and outer spaces", () => {
		expect(typedMatches("  supprimer ", "SUPPRIMER")).toBe(true);
		expect(typedMatches("DELETE", "DELETE")).toBe(true);
	});

	test("refuses anything else", () => {
		expect(typedMatches("", "DELETE")).toBe(false);
		expect(typedMatches("DELET", "DELETE")).toBe(false);
		expect(typedMatches("DELETE NOW", "DELETE")).toBe(false);
	});
});

describe("browser dialogs", () => {
	test("no page uses window.confirm or alert: they go through Confirm and Notice", async () => {
		const offenders: string[] = [];
		const glob = new Glob("**/*.{ts,tsx}");
		const root = `${import.meta.dir}/../..`;
		for await (const path of glob.scan(root)) {
			if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) continue;
			const source = await Bun.file(`${root}/${path}`).text();
			if (/(^|[^.\w])(window\.)?(confirm|alert)\(/m.test(source))
				offenders.push(path);
		}
		expect(offenders).toEqual([]);
	});
});
