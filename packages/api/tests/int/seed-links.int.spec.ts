// @vitest-environment node
import type { Payload } from "payload";
import { describe, expect, it } from "vitest";
import {
	categoryListingForms,
	categorySeedAttributes,
	seedCategories,
	seededDefinitions,
} from "../../src/seed/seedCategories";
import { seedTags, TAG_DEFINITIONS } from "../../src/seed/seedTags";
import { fakePayload } from "./helpers/fakePayload";

type Row = Record<string, unknown>;

const slugs = seededDefinitions.map((category) => category.slug);

describe("the seed definitions link up", () => {
	it("give every category its own slug", () => {
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it("define every parent before its children", () => {
		// The seed resolves a parent by slug as it creates the child: a parent
		// further down would leave the child at the top level, silently.
		const seen = new Set<string>();
		const late = seededDefinitions.flatMap((category) => {
			const out =
				category.parent && !seen.has(category.parent) ? [category.slug] : [];
			seen.add(category.slug);
			return out;
		});
		expect(late).toEqual([]);
	});

	it("name only existing categories in tags, forms and attributes", () => {
		const known = new Set(slugs);
		const unknown = [
			...TAG_DEFINITIONS.flatMap((tag) =>
				tag.categories.map((slug) => `tag ${tag.slug} → ${slug}`),
			),
			...Object.keys(categoryListingForms).map((slug) => `form → ${slug}`),
			...Object.keys(categorySeedAttributes).map(
				(slug) => `attributes → ${slug}`,
			),
		].filter((entry) => !known.has(entry.split(" → ")[1] ?? ""));
		expect(unknown).toEqual([]);
	});

	it("give every tag a unique slug, both languages and a category", () => {
		const tagSlugs = TAG_DEFINITIONS.map((tag) => tag.slug);
		expect(new Set(tagSlugs).size).toBe(tagSlugs.length);
		for (const tag of TAG_DEFINITIONS) {
			expect([tag.slug, Boolean(tag.name.fr && tag.name.en)]).toEqual([
				tag.slug,
				true,
			]);
			expect([tag.slug, tag.categories.length > 0]).toEqual([tag.slug, true]);
		}
	});
});

/** The slice of the Mongo adapter the category labels step reads and writes. */
function withRawCategories(payload: ReturnType<typeof fakePayload>) {
	const rows = () => (payload.store.categories ?? []) as Row[];
	Object.assign(payload.db, {
		collections: {
			categories: {
				collection: {
					find: () =>
						(async function* () {
							for (const row of rows()) yield { ...row, _id: row.id };
						})(),
					updateOne: async (filter: Row, update: { $set?: Row }) => {
						const row = rows().find((r) => r.id === filter._id);
						if (row && update.$set) Object.assign(row, update.$set);
					},
				},
			},
		},
	});
	return payload;
}

describe("seeding categories then tags", () => {
	async function seeded() {
		const payload = withRawCategories(
			fakePayload({ categories: [], tags: [] }),
		);
		await seedCategories(payload);
		await seedTags(payload as unknown as Payload);
		const categories = payload.store.categories as Row[];
		const idOf = new Map(categories.map((row) => [row.slug, String(row.id)]));
		return { payload, categories, idOf, tags: payload.store.tags as Row[] };
	}

	it("creates every category, each under the parent its definition names", async () => {
		const { categories, idOf } = await seeded();
		expect(categories).toHaveLength(seededDefinitions.length);
		const wrong = seededDefinitions.flatMap((definition) => {
			const row = categories.find((r) => r.slug === definition.slug);
			const parent = row?.parent ? String(row.parent) : null;
			const expected = definition.parent
				? (idOf.get(definition.parent) ?? "missing")
				: null;
			return parent === expected ? [] : [definition.slug];
		});
		expect(wrong).toEqual([]);
	});

	it("links every tag to the ids of exactly its categories", async () => {
		const { tags, idOf } = await seeded();
		expect(tags).toHaveLength(TAG_DEFINITIONS.length);
		for (const definition of TAG_DEFINITIONS) {
			const row = tags.find((r) => r.slug === definition.slug);
			const linked = ((row?.categories as unknown[]) ?? []).map(String).sort();
			const expected = definition.categories
				.map((slug) => idOf.get(slug))
				.sort();
			expect([definition.slug, linked]).toEqual([definition.slug, expected]);
		}
	});

	it("adds nothing when run again", async () => {
		const { payload } = await seeded();
		await seedCategories(payload);
		await seedTags(payload as unknown as Payload);
		expect(payload.store.categories).toHaveLength(seededDefinitions.length);
		expect(payload.store.tags).toHaveLength(TAG_DEFINITIONS.length);
	});
});
