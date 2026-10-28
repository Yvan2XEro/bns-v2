// @vitest-environment node
import type { Payload } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	categorySeedAttributes,
	seedCategories,
	seededDefinitions,
} from "../../src/seed/seedCategories";
import { seedTags, TAG_DEFINITIONS } from "../../src/seed/seedTags";
import { catchUpCategories } from "../../src/services/categoryCatchUp";
import {
	attributeRow,
	importTaxonomy,
	mergeAliases,
	TAXONOMY,
	type TaxonomyAttribute,
} from "../../src/services/taxonomyImport";
import { fakePayload } from "./helpers/fakePayload";

type Row = Record<string, unknown>;

const seedParent = new Map(
	seededDefinitions.map((c) => [c.slug, c.parent ?? null] as const),
);
// What production holds: the seed's attributes plus those the catch-up adds.
const seedAttrs = new Map(
	seededDefinitions.map(
		(c) =>
			[
				c.slug,
				[
					...c.attributes.map((a) => a.slug),
					...(categorySeedAttributes[c.slug] ?? []).map((a) => a.slug),
				],
			] as const,
	),
);
const parentOf = new Map<string, string | null>([
	...seedParent,
	...TAXONOMY.categories.map((c) => [c.slug, c.parentSlug] as const),
]);
const chain = (slug: string) => {
	const out: string[] = [];
	for (let s: string | null | undefined = slug; s; s = parentOf.get(s))
		out.push(s);
	return out;
};
const attrsOf = (slug: string) =>
	TAXONOMY.categories
		.find((c) => c.slug === slug)
		?.attributes.map((a) => a.slug) ??
	seedAttrs.get(slug) ??
	[];
const bilingual = (v: unknown) =>
	Boolean(v && typeof v === "object" && (v as Row).fr && (v as Row).en);

function attributeProblems(where: string, a: TaxonomyAttribute): string[] {
	const out: string[] = [];
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug))
		out.push(`${where}.${a.slug}: slug`);
	if (!bilingual(a.name)) out.push(`${where}.${a.slug}: name`);
	if (a.type === "select") {
		const values = (a.options ?? []).map((o) => o.value);
		if (values.length < 2) out.push(`${where}.${a.slug}: < 2 options`);
		if (new Set(values).size !== values.length)
			out.push(`${where}.${a.slug}: duplicate option`);
		for (const o of a.options ?? [])
			if (!bilingual(o.label)) out.push(`${where}.${a.slug}.${o.value}: label`);
	}
	return out;
}

describe("the taxonomy extension links up with the seed", () => {
	const slugs = TAXONOMY.categories.map((c) => c.slug);

	it("adds only new slugs, each once", () => {
		expect(new Set(slugs).size).toBe(slugs.length);
		expect(slugs.filter((s) => seedParent.has(s))).toEqual([]);
	});

	it("names a parent that exists or comes earlier, at most three levels deep", () => {
		const seen = new Set(seedParent.keys());
		const problems: string[] = [];
		for (const c of TAXONOMY.categories) {
			if (c.parentSlug && !seen.has(c.parentSlug))
				problems.push(`${c.slug}: parent`);
			if (chain(c.slug).length > 3) problems.push(`${c.slug}: depth`);
			seen.add(c.slug);
		}
		expect(problems).toEqual([]);
	});

	it("says everything in both languages, and lists real choices", () => {
		const problems = TAXONOMY.categories.flatMap((c) => [
			...(bilingual(c.name) ? [] : [`${c.slug}: name`]),
			...(bilingual(c.description) ? [] : [`${c.slug}: description`]),
			...c.attributes.flatMap((a) => attributeProblems(c.slug, a)),
		]);
		expect(problems).toEqual([]);
	});

	it("never repeats an attribute a category already gets from its ancestors", () => {
		const repeated = TAXONOMY.categories.flatMap((c) => {
			const inherited = new Set(chain(c.slug).slice(1).flatMap(attrsOf));
			return c.attributes
				.filter((a) => inherited.has(a.slug))
				.map((a) => `${c.slug}.${a.slug}`);
		});
		expect(repeated).toEqual([]);
	});

	it("extends only categories, attributes and tags that exist", () => {
		const known = new Set([...seedParent.keys(), ...slugs]);
		const existingTags = new Set(TAG_DEFINITIONS.map((t) => t.slug));
		const { existing, tags } = TAXONOMY;
		const problems = [
			...existing.attributes.map((e) => e.categorySlug),
			...existing.aliases.map((e) => e.categorySlug),
			...existing.optionAdditions.map((e) => e.categorySlug),
			...tags.flatMap((t) => t.categories),
			...existing.tagCategoryAdditions.flatMap((t) => t.categories),
		].filter((slug) => !known.has(slug));
		const optionTargets = existing.optionAdditions
			.filter(
				(o) =>
					!chain(o.categorySlug).some((s) =>
						attrsOf(s).includes(o.attributeSlug),
					),
			)
			.map((o) => `${o.categorySlug}.${o.attributeSlug}`);
		const tagProblems = [
			...tags
				.filter((t) => existingTags.has(t.slug))
				.map((t) => `tag ${t.slug} exists`),
			...tags
				.filter((t) => !bilingual(t.name))
				.map((t) => `tag ${t.slug} name`),
			...existing.tagCategoryAdditions
				.filter((t) => !existingTags.has(t.tagSlug))
				.map((t) => `tag ${t.tagSlug} unknown`),
		];
		expect([...problems, ...optionTargets, ...tagProblems]).toEqual([]);
	});

	it("keeps payment promises out of the tags: the platform's checkout makes them", () => {
		const slugsOfTags = TAXONOMY.tags.map((t) => t.slug);
		expect(slugsOfTags).not.toContain("cash-on-delivery");
		expect(slugsOfTags).not.toContain("mobile-money-accepted");
	});

	it("takes its pictures from free licences only", () => {
		const unfree = TAXONOMY.categories
			.filter(
				(c) => c.image && !/^(cc0|public domain|pd)/i.test(c.image.license),
			)
			.map((c) => c.slug);
		expect(unfree).toEqual([]);
	});
});

describe("helpers", () => {
	it("merges aliases once each, case aside", () => {
		expect(mergeAliases("pagne, Wax", "wax, kaba, pagne , robe")).toBe(
			"pagne, Wax, kaba, robe",
		);
		expect(mergeAliases(null, "a, b")).toBe("a, b");
	});

	it("writes one language of an attribute onto the rows already saved", () => {
		const attribute: TaxonomyAttribute = {
			slug: "fuel",
			name: { fr: "Carburant", en: "Fuel" },
			type: "select",
			required: false,
			filterable: true,
			options: [
				{ value: "petrol", label: { fr: "Essence", en: "Petrol" } },
				{ value: "diesel", label: { fr: "Diesel", en: "Diesel" } },
			],
			unit: { fr: "L", en: "L" },
		};
		expect(attributeRow(attribute, "fr")).toMatchObject({
			name: "Carburant",
			options: [{ value: "petrol", label: "Essence" }, { value: "diesel" }],
			unit: "L",
		});
		const saved = {
			id: "a1",
			options: [
				{ id: "o1", value: "petrol" },
				{ id: "o2", value: "diesel" },
			],
		};
		expect(attributeRow(attribute, "en", saved)).toMatchObject({
			id: "a1",
			name: "Fuel",
			options: [
				{ id: "o1", value: "petrol", label: "Petrol" },
				{ id: "o2", value: "diesel", label: "Diesel" },
			],
		});
	});
});

describe("importing the extension onto a seeded database", () => {
	beforeEach(() =>
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
						headers: { "content-type": "image/jpeg" },
					}),
			),
		),
	);
	afterEach(() => vi.unstubAllGlobals());

	async function seeded() {
		const payload = fakePayload({ categories: [], tags: [], media: [] });
		Object.assign(payload.db, {
			collections: {
				categories: {
					collection: {
						find: () => (async function* () {})(),
						updateOne: async () => {},
					},
				},
			},
		});
		await seedCategories(payload);
		await catchUpCategories(payload as unknown as Payload);
		await seedTags(payload as unknown as Payload);
		return payload;
	}

	it("creates every category under its parent, with its attributes and picture", async () => {
		const payload = await seeded();
		const report = await importTaxonomy(payload as unknown as Payload);
		const rows = payload.store.categories as Row[];
		const idOf = new Map(rows.map((r) => [r.slug, String(r.id)]));
		expect(report.categoriesCreated).toBe(TAXONOMY.categories.length);
		const wrong = TAXONOMY.categories.flatMap((c) => {
			const row = rows.find((r) => r.slug === c.slug);
			const parent = row?.parent ? String(row.parent) : null;
			const expected = c.parentSlug
				? (idOf.get(c.parentSlug) ?? "missing")
				: null;
			const attrs = ((row?.attributes as Row[]) ?? []).map((a) => a.slug);
			return parent === expected &&
				c.attributes.every((a) => attrs.includes(a.slug)) &&
				(!c.image || row?.image)
				? []
				: [c.slug];
		});
		expect(wrong).toEqual([]);
	});

	it("adds attributes, options, aliases and tags to what was there", async () => {
		const payload = await seeded();
		await importTaxonomy(payload as unknown as Payload);
		const rows = payload.store.categories as Row[];
		for (const entry of TAXONOMY.existing.attributes) {
			const attrs = (
				(rows.find((r) => r.slug === entry.categorySlug)
					?.attributes as Row[]) ?? []
			).map((a) => a.slug);
			for (const a of entry.attributes)
				expect([entry.categorySlug, attrs]).toEqual([
					entry.categorySlug,
					expect.arrayContaining([a.slug]),
				]);
		}
		const tags = payload.store.tags as Row[];
		for (const tag of TAXONOMY.tags)
			expect(tags.some((t) => t.slug === tag.slug)).toBe(true);
		for (const entry of TAXONOMY.existing.aliases) {
			const aliases = String(
				rows.find((r) => r.slug === entry.categorySlug)?.searchAliases ?? "",
			);
			const first = entry.addAliases.split(",")[0]?.trim() ?? "";
			expect(aliases.toLowerCase()).toContain(first.toLowerCase());
		}
	});

	it("changes nothing on a second run", async () => {
		const payload = await seeded();
		await importTaxonomy(payload as unknown as Payload);
		const before = JSON.stringify([
			payload.store.categories,
			payload.store.tags,
		]);
		const again = await importTaxonomy(payload as unknown as Payload);
		expect(again).toEqual({
			categoriesCreated: 0,
			picturesAdded: 0,
			attributesAdded: 0,
			optionsAdded: 0,
			aliasesUpdated: 0,
			tagsCreated: 0,
			tagsExtended: 0,
		});
		expect(JSON.stringify([payload.store.categories, payload.store.tags])).toBe(
			before,
		);
	});
});
