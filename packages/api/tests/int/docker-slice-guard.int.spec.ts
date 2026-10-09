import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The web Docker image ships only a SLICE of packages/api (see
 * packages/web/Dockerfile). A VALUE import that escapes the slice passes
 * every local gate and then breaks the deploy — it did twice. This guard
 * derives the shipped set FROM the Dockerfile and walks the value-import
 * graph of the slice and of packages/web, so the build breaks here first.
 */

const API_SRC = path.resolve(__dirname, "../../src");
const REPO = path.resolve(__dirname, "../../../..");

function shippedSet(): { files: Set<string>; dirs: string[] } {
	const docker = readFileSync(
		path.join(REPO, "packages/web/Dockerfile"),
		"utf8",
	);
	const files = new Set<string>();
	const dirs: string[] = [];
	for (const line of docker.split("\n")) {
		const m = line.match(/^COPY (packages\/api\/src\/\S+) /);
		if (!m) continue;
		const rel = m[1].replace("packages/api/src/", "");
		if (rel.endsWith(".ts")) files.add(rel);
		else dirs.push(rel.replace(/\/$/, ""));
	}
	return { files, dirs };
}

const inSlice = (rel: string, s: ReturnType<typeof shippedSet>) =>
	s.files.has(rel) || s.dirs.some((d) => rel === d || rel.startsWith(`${d}/`));

/** Relative value-import specifiers of a module (import type / export type are exempt). */
function valueImports(file: string): string[] {
	const src = readFileSync(file, "utf8");
	const out: string[] = [];
	const re =
		/(?:import|export)\s+(type\s+)?(?:[\s\S]*?)\s*from\s*"(\.[^"]+)"|import\s*"(\.[^"]+)"/g;
	for (const m of src.matchAll(re)) {
		const spec = m[2] ?? m[3];
		if (!spec) continue;
		if (m[1]) continue; // import type { … } — erased
		// an import whose every binding is `type X` is also erased
		const stmt = m[0];
		const braces = stmt.match(/\{([\s\S]*?)\}/);
		if (
			braces &&
			!stmt.match(/import\s*(\*|\w)/)?.[1]?.match(/\w/) &&
			braces[1]
				.split(",")
				.map((b) => b.trim())
				.filter(Boolean)
				.every((b) => b.startsWith("type "))
		)
			continue;
		out.push(spec);
	}
	return out;
}

const resolveSpec = (from: string, spec: string): string | null => {
	const base = path.resolve(path.dirname(from), spec);
	for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")])
		if (existsSync(c) && statSync(c).isFile()) return c;
	return null;
};

function walk(dir: string, out: string[] = []): string[] {
	for (const e of readdirSync(dir)) {
		const f = path.join(dir, e);
		if (statSync(f).isDirectory()) walk(f, out);
		else if (/\.tsx?$/.test(e) && !/\.test\.|\.spec\./.test(e)) out.push(f);
	}
	return out;
}

describe("the web Docker slice is import-closed", () => {
	const slice = shippedSet();

	it("ships contracts, types and the named helpers", () => {
		expect(slice.dirs).toEqual(expect.arrayContaining(["contracts", "types"]));
		expect(slice.files.has("lib/errors.ts")).toBe(true);
	});

	it("no shipped api module VALUE-imports outside the slice, transitively", () => {
		const roots = [
			...slice.dirs.map((d) => path.join(API_SRC, d)),
			...[...slice.files].map((f) => path.join(API_SRC, f)),
		].filter((p) => existsSync(p));
		const queue = roots.flatMap((r) =>
			statSync(r).isDirectory() ? walk(r) : [r],
		);
		const seen = new Set<string>();
		const escapes: string[] = [];
		while (queue.length) {
			const file = queue.pop() as string;
			if (seen.has(file)) continue;
			seen.add(file);
			for (const spec of valueImports(file)) {
				const target = resolveSpec(file, spec);
				if (!target || !target.startsWith(API_SRC)) continue;
				const rel = path.relative(API_SRC, target);
				if (!inSlice(rel, slice))
					escapes.push(`${path.relative(REPO, file)} -> ${rel}`);
				else queue.push(target);
			}
		}
		expect(escapes).toEqual([]);
	});

	it("no web module VALUE-imports an api path outside the slice", () => {
		const webSrc = path.join(REPO, "packages/web/src");
		const escapes: string[] = [];
		for (const file of walk(webSrc)) {
			for (const spec of valueImports(file)) {
				const target = resolveSpec(file, spec);
				if (!target) continue;
				if (!target.startsWith(API_SRC)) continue;
				const rel = path.relative(API_SRC, target);
				if (rel === "payload-types.ts") continue;
				if (!inSlice(rel, slice))
					escapes.push(`${path.relative(REPO, file)} -> ${rel}`);
			}
		}
		expect(escapes).toEqual([]);
	});
});
