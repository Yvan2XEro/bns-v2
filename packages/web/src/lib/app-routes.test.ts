import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Web twin of packages/api/tests/int/route-slug-consistency.int.spec.ts,
 * extended to the five-shell contract of the 2026-10-10 spec. Next checks
 * most of this only at build or boot; this pins it in `bun test`. */
const SRC = path.resolve(import.meta.dir, "..");
const APP = path.join(SRC, "app");
const SHELLS = ["(bare)", "(checkout)", "(ops)", "(public)", "(seller)"];

const isDir = (p: string) => statSync(p).isDirectory();
const isGroup = (name: string) => name.startsWith("(") && name.endsWith(")");

function walkDirs(
	dir: string,
	visit: (dir: string, entries: string[]) => void,
) {
	const entries = readdirSync(dir);
	visit(dir, entries);
	for (const entry of entries) {
		const child = path.join(dir, entry);
		if (isDir(child)) walkDirs(child, visit);
	}
}

function appSources(): string[] {
	const files: string[] = [];
	walkDirs(APP, (dir, entries) => {
		for (const e of entries)
			if (/\.tsx?$/.test(e) && !isDir(path.join(dir, e)))
				files.push(path.join(dir, e));
	});
	return files;
}

const groupOf = (file: string) => {
	const first = path.relative(APP, file).split(path.sep)[0] ?? "";
	return isGroup(first) ? first : null;
};

interface ImportStatement {
	spec: string;
	typeOnly: boolean;
	names: string[];
}

function importsOf(source: string): ImportStatement[] {
	const out: ImportStatement[] = [];
	const re = /import\s+(type\s+)?([^;"']*?)\s*from\s*["']([^"']+)["']/g;
	for (const m of source.matchAll(re)) {
		const clause = m[2] ?? "";
		const names: string[] = [];
		const braces = /\{([^}]*)\}/.exec(clause);
		const head = clause
			.replace(/\{[^}]*\}/, "")
			.replace(/,/g, " ")
			.trim();
		if (head)
			names.push(head.startsWith("*") ? head : (head.split(/\s+/)[0] ?? ""));
		for (const raw of (braces?.[1] ?? "").split(",")) {
			const part = raw.trim();
			if (!part || part.startsWith("type ")) continue;
			names.push(part.split(/\s+as\s+/)[0] ?? "");
		}
		out.push({ spec: m[3] ?? "", typeOnly: !!m[1], names });
	}
	return out;
}

function resolveImport(from: string, spec: string): string | null {
	let base: string;
	if (spec.startsWith("~/")) base = path.join(SRC, spec.slice(2));
	else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
	else return null;
	for (const candidate of [
		`${base}.ts`,
		`${base}.tsx`,
		path.join(base, "index.ts"),
		path.join(base, "index.tsx"),
		base,
	])
		if (existsSync(candidate) && !isDir(candidate)) return candidate;
	return null;
}

const isUseClient = (source: string) =>
	/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(source);

describe("the app route tree", () => {
	test("one slug name per dynamic path position", () => {
		const conflicts: string[] = [];
		walkDirs(APP, (dir, entries) => {
			const dynamic = entries.filter(
				(e) => e.startsWith("[") && e.endsWith("]") && isDir(path.join(dir, e)),
			);
			if (dynamic.length > 1 && new Set(dynamic).size > 1)
				conflicts.push(`${path.relative(APP, dir)}: ${dynamic.join(" vs ")}`);
		});
		expect(conflicts).toEqual([]);
	});

	test("no two pages resolve to one URL across groups", () => {
		const byUrl = new Map<string, string[]>();
		let pages = 0;
		walkDirs(APP, (dir, entries) => {
			if (!entries.includes("page.tsx")) return;
			pages++;
			const rel = path.relative(APP, dir);
			const url =
				`/${rel
					.split(path.sep)
					.filter((seg) => !isGroup(seg))
					.join("/")}`.replace(/\/$/, "") || "/";
			byUrl.set(url, [...(byUrl.get(url) ?? []), rel]);
		});
		expect(pages).toBeGreaterThan(20);
		const parallel = [...byUrl.entries()].filter(([, dirs]) => dirs.length > 1);
		expect(parallel).toEqual([]);
	});

	test("exactly one layout renders <html>", () => {
		const htmlLayouts: string[] = [];
		walkDirs(APP, (dir, entries) => {
			if (!entries.includes("layout.tsx")) return;
			const source = readFileSync(path.join(dir, "layout.tsx"), "utf8");
			if (source.includes("<html"))
				htmlLayouts.push(path.relative(APP, dir) || ".");
		});
		expect(htmlLayouts).toEqual(["."]);
	});

	test("every shell group ships layout, loading, error and not-found", () => {
		const groups = readdirSync(APP).filter(
			(e) => isGroup(e) && isDir(path.join(APP, e)),
		);
		expect(groups.sort()).toEqual(SHELLS);
		for (const group of groups) {
			const entries = readdirSync(path.join(APP, group));
			for (const file of [
				"layout.tsx",
				"loading.tsx",
				"error.tsx",
				"not-found.tsx",
			])
				expect(
					`${group}/${entries.includes(file) ? file : `MISSING ${file}`}`,
				).toBe(`${group}/${file}`);
		}
	});

	test("the root has no loading boundary and no page", () => {
		const rootEntries = readdirSync(APP);
		expect(rootEntries).not.toContain("loading.tsx");
		expect(rootEntries).not.toContain("page.tsx");
	});

	test("ChatProvider stays in the root layout, above every shell", () => {
		const root = readFileSync(path.join(APP, "layout.tsx"), "utf8");
		expect(root).toContain("<ChatProvider>");
		const nested: string[] = [];
		walkDirs(APP, (dir, entries) => {
			if (dir === APP || !entries.includes("layout.tsx")) return;
			const source = readFileSync(path.join(dir, "layout.tsx"), "utf8");
			if (source.includes("ChatProvider")) nested.push(path.relative(APP, dir));
		});
		expect(nested).toEqual([]);
	});

	// The rider token is a credential (spec: the (bare) anatomy). Nothing else
	// pins the metadata — deleting it would leak the page to indexers and send
	// referrers carrying the token, with no red anywhere (T12 checkpoint, item a).
	test("the (bare) layout keeps the credential metadata", () => {
		const source = readFileSync(path.join(APP, "(bare)", "layout.tsx"), "utf8");
		expect(source).toContain("index: false");
		expect(source).toContain('referrer: "no-referrer"');
	});

	// The moderation surface's existence is unadvertised below moderator rank:
	// the gate is notFound(), never a redirect or a styled 403 (spec Task 3;
	// T12 checkpoint, item b — the shape previously rested on review alone).
	test("the (ops) layout gates with notFound()", () => {
		const source = readFileSync(path.join(APP, "(ops)", "layout.tsx"), "utf8");
		// The statement, not the docstring (which also says "notFound()").
		expect(source).toMatch(/if \(!isModerator\([^)]*\)\) notFound\(\);/);
		expect(source).not.toContain("redirect(");
	});

	// /s/kana-p crashed with "Attempted to call shopUrl() from the server": a
	// server page imported a plain function from a "use client" module, and
	// Next hands the server only a client reference for every export of one.
	test("a server page or layout imports only components from a client module", () => {
		const offenders: string[] = [];
		let serverFiles = 0;
		for (const file of appSources()) {
			if (!/(^|\/)(page|layout)\.tsx$/.test(file)) continue;
			const source = readFileSync(file, "utf8");
			if (isUseClient(source)) continue;
			serverFiles++;
			for (const imp of importsOf(source)) {
				if (imp.typeOnly) continue;
				const target = resolveImport(file, imp.spec);
				if (!target || !isUseClient(readFileSync(target, "utf8"))) continue;
				for (const name of imp.names)
					if (!/^[A-Z][A-Za-z0-9]*$/.test(name))
						offenders.push(
							`${path.relative(SRC, file)} imports ${name} from ${imp.spec}`,
						);
			}
		}
		expect(serverFiles).toBeGreaterThan(20);
		expect(offenders).toEqual([]);
	});

	// Cross-group reuse goes through ~/ modules outside app/: a relative import
	// into another shell welds two route trees together.
	test("no relative import crosses a route-group boundary", () => {
		const offenders: string[] = [];
		for (const file of appSources()) {
			const here = groupOf(file);
			if (here === null && /\.test\.tsx?$/.test(file)) continue; // root test imports every shell
			for (const imp of importsOf(readFileSync(file, "utf8"))) {
				if (!imp.spec.startsWith(".")) continue;
				const target = resolveImport(file, imp.spec);
				if (!target || !target.startsWith(`${APP}${path.sep}`)) continue;
				if (groupOf(target) !== here)
					offenders.push(`${path.relative(SRC, file)} -> ${imp.spec}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
