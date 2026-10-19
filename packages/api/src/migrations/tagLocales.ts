import type { Payload } from "payload";
import { TAG_DEFINITIONS } from "../seed/seedTags";
import { raw } from "./tagsCategoryScope";

type Rec = Record<string, unknown>;

export interface TagLocalesReport {
	tagsUpdated: number;
	/** Names given both languages from the seed's wording. */
	translated: number;
	/** `slug: name` kept as the French with no English, for an admin to translate. */
	untranslated: string[];
}

const isRecord = (value: unknown): value is Rec =>
	!!value && typeof value === "object" && !Array.isArray(value);

const filled = (value: unknown): value is string =>
	typeof value === "string" && value.trim() !== "";

/** The seed's two names for a tag, found by its slug or its French name. */
function seedName(slug: unknown, french: string) {
	return TAG_DEFINITIONS.find(
		(tag) => tag.slug === slug || tag.name.fr === french,
	)?.name;
}

/**
 * Moves tag names onto the `fr`/`en` locales, losing nothing:
 *   - a plain name the seed wrote becomes both of the seed's languages;
 *   - any other plain name — an admin's own — is kept as the French, which
 *     English falls back to, and listed for translation;
 *   - an already localised name only gets a missing English when its French
 *     is still the seed's, so an admin's wording is never replaced.
 * Idempotent: a second run finds every name localised and complete.
 */
export async function localizeTagNames(
	payload: Payload,
): Promise<TagLocalesReport> {
	const report: TagLocalesReport = {
		tagsUpdated: 0,
		translated: 0,
		untranslated: [],
	};
	const tags = raw(payload, "tags");

	for await (const doc of tags.find({})) {
		const name = doc.name;
		let next: Rec | null = null;

		if (filled(name)) {
			const seeded = seedName(doc.slug, name);
			if (seeded && seeded.fr === name) {
				next = { fr: seeded.fr, en: seeded.en };
				report.translated += 1;
			} else {
				next = { fr: name };
				report.untranslated.push(`${String(doc.slug)}: ${name}`);
			}
		} else if (isRecord(name) && filled(name.fr) && !filled(name.en)) {
			const seeded = seedName(doc.slug, name.fr);
			if (seeded && seeded.fr === name.fr) {
				next = { ...name, en: seeded.en };
				report.translated += 1;
			} else {
				report.untranslated.push(`${String(doc.slug)}: ${name.fr}`);
			}
		}

		if (next) {
			await tags.updateOne({ _id: doc._id }, { $set: { name: next } });
			report.tagsUpdated += 1;
		}
	}
	return report;
}

/** Back to one plain name per tag: the French, else the English. */
export async function flattenTagNames(
	payload: Payload,
): Promise<{ tagsUpdated: number }> {
	const tags = raw(payload, "tags");
	let tagsUpdated = 0;
	for await (const doc of tags.find({})) {
		const name = doc.name;
		if (!isRecord(name)) continue;
		const flat = filled(name.fr) ? name.fr : filled(name.en) ? name.en : "";
		await tags.updateOne({ _id: doc._id }, { $set: { name: flat } });
		tagsUpdated += 1;
	}
	return { tagsUpdated };
}
