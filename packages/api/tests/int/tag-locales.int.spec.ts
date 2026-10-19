// @vitest-environment node
import type { Payload } from "payload";
import { describe, expect, it } from "vitest";
import { Tags } from "../../src/collections/Tags";
import {
	flattenTagNames,
	localizeTagNames,
} from "../../src/migrations/tagLocales";
import { TAG_DEFINITIONS } from "../../src/seed/seedTags";

type Doc = Record<string, unknown>;

/** A raw tags collection, as the Mongo driver hands it to a migration. */
function payloadWithTags(docs: Doc[]): Payload {
	const collection = {
		find() {
			const rows = docs.map((doc) => structuredClone(doc));
			return {
				async *[Symbol.asyncIterator]() {
					yield* rows;
				},
			};
		},
		async updateOne(filter: Doc, update: { $set: Doc }) {
			const row = docs.find((doc) => doc._id === filter._id);
			if (row) Object.assign(row, update.$set);
			return { matchedCount: row ? 1 : 0 };
		},
	};
	return {
		db: { collections: { tags: { collection } } },
	} as unknown as Payload;
}

describe("tag names in two languages", () => {
	it("is a translated field, and the slug is not", () => {
		const fields = Tags.fields.flatMap((field) =>
			"fields" in field ? field.fields : [field],
		);
		const byName = (name: string) =>
			fields.find((field) => "name" in field && field.name === name);
		expect(byName("name")).toMatchObject({ localized: true });
		expect(byName("slug")).not.toHaveProperty("localized", true);
	});

	it("gives every seeded tag an English name", () => {
		for (const tag of TAG_DEFINITIONS) {
			expect(tag.name.fr.trim()).not.toBe("");
			expect(tag.name.en.trim()).not.toBe("");
		}
	});

	it("moves seeded names onto both languages and keeps an admin's own as the French", async () => {
		const docs: Doc[] = [
			{ _id: "1", slug: "negotiable", name: "Négociable" },
			{ _id: "2", slug: "pets-ok", name: "Animaux acceptés" },
			{ _id: "3", slug: "urgent", name: { fr: "Vente urgente" } },
			{ _id: "4", slug: "swap", name: { fr: "Troc", en: "Barter" } },
		];
		const report = await localizeTagNames(payloadWithTags(docs));

		expect(docs.map((doc) => doc.name)).toEqual([
			{ fr: "Négociable", en: "Negotiable" },
			{ fr: "Animaux acceptés" },
			{ fr: "Vente urgente", en: "Urgent sale" },
			// An admin's wording in both languages is never touched.
			{ fr: "Troc", en: "Barter" },
		]);
		expect(report.translated).toBe(2);
		expect(report.untranslated).toEqual(["pets-ok: Animaux acceptés"]);
	});

	it("changes nothing on a second run", async () => {
		const docs: Doc[] = [{ _id: "1", slug: "negotiable", name: "Négociable" }];
		const payload = payloadWithTags(docs);
		await localizeTagNames(payload);
		const second = await localizeTagNames(payload);
		expect(second.tagsUpdated).toBe(0);
	});

	it("goes back to one plain name, the French first", async () => {
		const docs: Doc[] = [
			{
				_id: "1",
				slug: "negotiable",
				name: { fr: "Négociable", en: "Negotiable" },
			},
			{ _id: "2", slug: "x", name: { en: "Only English" } },
		];
		await flattenTagNames(payloadWithTags(docs));
		expect(docs.map((doc) => doc.name)).toEqual(["Négociable", "Only English"]);
	});
});
