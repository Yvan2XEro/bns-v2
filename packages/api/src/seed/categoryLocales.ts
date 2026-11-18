import type { Payload } from "payload";
import {
	type CategoryLabelKind,
	seedEnglishOfFrench,
	seedFrenchOfEnglish,
	seedLabelTranslation,
} from "./categoryTranslations";

type Rec = Record<string, unknown>;

interface RawCollection {
	find(filter: Rec, options?: Rec): AsyncIterable<Rec>;
	updateOne(filter: Rec, update: Rec): Promise<unknown>;
}

interface RawAdapter {
	collections: Record<string, { collection: RawCollection }>;
}

export const raw = (payload: Payload, slug: string): RawCollection =>
	(payload.db as unknown as RawAdapter).collections[slug].collection;

export const idText = (value: unknown): string | null => {
	if (value === null || value === undefined || value === "") return null;
	if (
		typeof value === "object" &&
		typeof (value as { toHexString?: unknown }).toHexString === "function"
	) {
		return (value as { toHexString(): string }).toHexString();
	}
	if (typeof value === "object" && "id" in (value as Rec)) {
		return idText((value as Rec).id);
	}
	return String(value);
};

/** Every category as stored, read past the collection config. */

export interface CategoryLocalesReport {
	categoriesUpdated: number;
	/** Labels given both languages from the seed's wording. */
	translated: number;
	/**
	 * Labels kept exactly as stored but still needing an admin: a plain
	 * string kept as the French with no English, a label with English and no
	 * French, or an English seed word sitting in the French.
	 */
	keptAsIs: number;
	/** `slug › where: value` for every label kept as is, for an admin to translate. */
	untranslated: string[];
}

const isRecord = (value: unknown): value is Rec =>
	!!value && typeof value === "object" && !Array.isArray(value);

const filled = (value: unknown): value is string =>
	typeof value === "string" && value.trim() !== "";

/**
 * Moves the category labels onto the `fr`/`en` locales, losing nothing:
 *   - a plain string the seed wrote (in English, or in French for the
 *     condition attribute) becomes both languages;
 *   - any other string — an admin's own wording — is kept unchanged as the
 *     French, the default locale, which English falls back to;
 *   - an already localised value only has a missing language filled in, and
 *     only when its other language is the seed's wording, so an admin's edit
 *     is never replaced;
 *   - a select option with no label gets one when its value is a seed word
 *     that reads differently in French ("Black" → « Noir »).
 * Idempotent: a second run finds every label already localised.
 */
export async function localizeCategoryLabels(
	payload: Payload,
): Promise<CategoryLocalesReport> {
	const report: CategoryLocalesReport = {
		categoriesUpdated: 0,
		translated: 0,
		keptAsIs: 0,
		untranslated: [],
	};
	const categories = raw(payload, "categories");

	for await (const doc of categories.find({})) {
		const slug =
			typeof doc.slug === "string"
				? doc.slug
				: (idText(doc._id ?? doc.id) ?? "?");
		const set: Rec = {};

		const localize = (
			kind: CategoryLabelKind,
			value: unknown,
			where: string,
		): { changed: boolean; next: unknown } => {
			if (filled(value)) {
				const pair = seedLabelTranslation(kind, value);
				if (pair) {
					report.translated += 1;
					return { changed: true, next: { fr: pair.fr, en: pair.en } };
				}
				report.keptAsIs += 1;
				report.untranslated.push(`${slug} › ${where}: ${value}`);
				return { changed: true, next: { fr: value } };
			}
			if (!isRecord(value)) return { changed: false, next: value };
			const keep = (note: string, word: string) => {
				report.keptAsIs += 1;
				report.untranslated.push(`${slug} › ${where} (${note}): ${word}`);
				return { changed: false, next: value };
			};
			if (filled(value.fr) && !filled(value.en)) {
				const en = seedEnglishOfFrench(kind, value.fr);
				if (en !== undefined) {
					report.translated += 1;
					return { changed: true, next: { ...value, en } };
				}
				// An English seed word a Payload write filed as the French.
				const fr = seedFrenchOfEnglish(kind, value.fr);
				if (fr !== undefined) {
					report.translated += 1;
					return { changed: true, next: { ...value, fr, en: value.fr } };
				}
				return { changed: false, next: value };
			}
			if (filled(value.en) && !filled(value.fr)) {
				const fr = seedFrenchOfEnglish(kind, value.en);
				if (fr !== undefined) {
					report.translated += 1;
					return { changed: true, next: { ...value, fr } };
				}
				// A French seed word filed as the English.
				const en = seedEnglishOfFrench(kind, value.en);
				if (en !== undefined) {
					report.translated += 1;
					return { changed: true, next: { ...value, fr: value.en, en } };
				}
				return keep("English only, no French", value.en);
			}
			if (
				filled(value.fr) &&
				seedEnglishOfFrench(kind, value.fr) === undefined &&
				(seedFrenchOfEnglish(kind, value.fr) ?? value.fr) !== value.fr
			) {
				return keep("English in the French", value.fr);
			}
			return { changed: false, next: value };
		};

		const top = (field: string, kind: CategoryLabelKind) => {
			const result = localize(kind, doc[field], field);
			if (result.changed) set[field] = result.next;
		};
		top("name", "name");
		top("description", "description");

		if (isRecord(doc.listingForm)) {
			const result = localize(
				"priceLabel",
				doc.listingForm.priceLabel,
				"listingForm.priceLabel",
			);
			if (result.changed) set["listingForm.priceLabel"] = result.next;
		}

		if (Array.isArray(doc.attributes)) {
			let attributesChanged = false;
			const attributes = doc.attributes.map((row: unknown) => {
				if (!isRecord(row)) return row;
				const attrSlug = typeof row.slug === "string" ? row.slug : "?";
				const next: Rec = { ...row };
				for (const [field, kind] of [
					["name", "attribute"],
					["group", "group"],
					["unit", "unit"],
				] as const) {
					const result = localize(kind, row[field], `${attrSlug}.${field}`);
					if (result.changed) {
						next[field] = result.next;
						attributesChanged = true;
					}
				}
				if (Array.isArray(row.options)) {
					next.options = row.options.map((option: unknown) => {
						if (!isRecord(option)) return option;
						const label = option.label;
						const empty =
							label === undefined ||
							label === null ||
							label === "" ||
							(isRecord(label) && !filled(label.fr) && !filled(label.en));
						if (empty) {
							if (!filled(option.value)) return option;
							const pair = seedLabelTranslation("option", option.value);
							if (!pair || pair.fr === pair.en) return option;
							report.translated += 1;
							attributesChanged = true;
							return { ...option, label: { fr: pair.fr, en: pair.en } };
						}
						const result = localize(
							"option",
							label,
							`${attrSlug}.options.${String(option.value)}`,
						);
						if (!result.changed) return option;
						attributesChanged = true;
						return { ...option, label: result.next };
					});
				}
				return next;
			});
			if (attributesChanged) set.attributes = attributes;
		}

		if (Object.keys(set).length === 0) continue;
		// The stored `_id` as read — an ObjectId in production — never a string.
		await categories.updateOne({ _id: doc._id }, { $set: set });
		report.categoriesUpdated += 1;
	}

	return report;
}
