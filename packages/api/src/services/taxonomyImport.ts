import type { Payload } from "payload";
import sharp from "sharp";
import { fingerprintOf } from "../lib/deployTasks";
import type { Category } from "../payload-types";
import { fetchFileByURL } from "../seed/seedCategories";
import categoriesData from "../seed/taxonomy/categories.json";
import existingData from "../seed/taxonomy/existing.json";
import tagsData from "../seed/taxonomy/tags.json";

/**
 * The taxonomy extension (seed/taxonomy/*.json): new categories with their
 * attributes and pictures, attributes, options and search aliases added to
 * the categories already there, and new tags. Researched across the
 * marketplaces of the region and beyond, then cleaned (see the README there).
 *
 * Two rules, as for `categoryCatchUp`:
 * - **Idempotent.** A category, an attribute, an option or a tag whose slug
 *   exists is left as it is; running twice changes nothing the second time.
 * - **Never overwrites a human.** It only adds: no field an admin set is
 *   rewritten, nothing is removed or reordered.
 */

export type Bilingual = { fr: string; en: string };

export interface TaxonomyAttribute {
	slug: string;
	name: Bilingual;
	type: "text" | "number" | "select" | "boolean" | "date";
	required: boolean;
	filterable: boolean;
	options?: { value: string; label: Bilingual }[];
	unit?: string | Bilingual;
	group?: Bilingual;
	min?: number;
	max?: number;
}

export interface TaxonomyCategory {
	slug: string;
	parentSlug: string | null;
	name: Bilingual;
	description: Bilingual;
	searchAliases: string;
	icon?: string;
	listingForm?: Category["listingForm"];
	attributes: TaxonomyAttribute[];
	/**
	 * Its picture: a Pixabay photo, fetched by its id at import time (Pixabay's
	 * terms forbid hotlinking and its URLs expire) and stored in Media, or a
	 * URL; with where it comes from and its licence — free for commercial use,
	 * no credit required.
	 */
	image?: {
		pixabayId?: number;
		url?: string;
		source: string;
		license: string;
	};
}

export interface TaxonomyExisting {
	attributes: { categorySlug: string; attributes: TaxonomyAttribute[] }[];
	optionAdditions: {
		categorySlug: string;
		attributeSlug: string;
		addOptions: { value: string; label: Bilingual }[];
	}[];
	aliases: { categorySlug: string; addAliases: string }[];
	tagCategoryAdditions: { tagSlug: string; categories: string[] }[];
}

export interface TaxonomyTag {
	slug: string;
	name: Bilingual;
	emoji: string;
	categories: string[];
}

export const TAXONOMY = {
	categories: categoriesData as TaxonomyCategory[],
	existing: existingData as TaxonomyExisting,
	tags: tagsData as TaxonomyTag[],
};

// Pixabay sits behind Cloudflare, which turns away requests with no agent.
const PIXABAY_HEADERS = { "user-agent": "BuyNSellem/1.0 (+taxonomy import)" };

/**
 * A Pixabay photo by its id: its current URL asked of the API (they expire),
 * downloaded and cropped to 800×600 like every category picture.
 */
export async function pixabayPicture(id: number, slug: string, key: string) {
	const lookup = await fetch(
		`https://pixabay.com/api/?key=${encodeURIComponent(key)}&id=${id}`,
		{ headers: PIXABAY_HEADERS },
	);
	if (!lookup.ok) throw new Error(`Pixabay ${id}: ${lookup.status}`);
	const hit = ((await lookup.json()) as { hits?: { largeImageURL?: string }[] })
		.hits?.[0];
	if (!hit?.largeImageURL) throw new Error(`Pixabay ${id}: not found`);
	let photo = await fetch(hit.largeImageURL, { headers: PIXABAY_HEADERS });
	// Its CDN limits the rate: two more tries after a pause, then the next boot.
	for (let wait = 5_000; photo.status === 429 && wait <= 20_000; wait *= 4) {
		await new Promise((resolve) => setTimeout(resolve, wait));
		photo = await fetch(hit.largeImageURL, { headers: PIXABAY_HEADERS });
	}
	if (!photo.ok) throw new Error(`Pixabay ${id}: ${photo.status}`);
	const data = await sharp(Buffer.from(await photo.arrayBuffer()))
		.resize(800, 600, { fit: "cover" })
		.jpeg({ quality: 80, progressive: true })
		.toBuffer();
	return {
		name: `category-${slug}.jpg`,
		data,
		mimetype: "image/jpeg",
		size: data.byteLength,
	};
}

/**
 * Changes with the data, and once with the Pixabay key: a deploy that adds
 * the key runs the task again, which gives each category its picture.
 */
export function taxonomyFingerprint(): string {
	return fingerprintOf({
		taxonomy: TAXONOMY,
		pictures: Boolean(process.env.PIXABAY_API_KEY),
	});
}

type Locale = "fr" | "en";
type Row = Record<string, unknown> & { id?: string | null };

/** The same attribute: its slug is unique within a category. */
const sameAttribute = (a: Row, b: Row) => Boolean(a.slug) && a.slug === b.slug;
/** The same option: its value is unique within an attribute. */
const sameOption = (a: Row, b: Row) =>
	String(a.value).toLowerCase() === String(b.value).toLowerCase();

const text = (value: string | Bilingual | undefined, locale: Locale) =>
	value === undefined
		? undefined
		: typeof value === "string"
			? value
			: value[locale];

/**
 * An attribute row as stored, in one language. `stored` (the row as saved
 * in French, with its ids) is reused for the English pass, so Payload writes
 * the English labels onto the same rows and options.
 */
export function attributeRow(
	attribute: TaxonomyAttribute,
	locale: Locale,
	stored?: Row,
): Row {
	const storedOptions = (stored?.options as Row[] | undefined) ?? [];
	return {
		...(stored?.id ? { id: stored.id } : {}),
		name: attribute.name[locale],
		slug: attribute.slug,
		type: attribute.type,
		required: attribute.required,
		filterable: attribute.filterable,
		...(attribute.options
			? {
					options: attribute.options.map((option) => {
						const kept = storedOptions.find((o) => o.value === option.value);
						return {
							...(kept?.id ? { id: kept.id } : {}),
							value: option.value,
							label: option.label[locale],
						};
					}),
				}
			: {}),
		...(attribute.unit !== undefined
			? { unit: text(attribute.unit, locale) }
			: {}),
		...(attribute.group ? { group: attribute.group[locale] } : {}),
		...(attribute.min !== undefined ? { min: attribute.min } : {}),
		...(attribute.max !== undefined ? { max: attribute.max } : {}),
	};
}

/** Words added to a comma-separated alias list, each once, case aside. */
export function mergeAliases(
	current: string | null | undefined,
	add: string,
): string {
	const words = (current ?? "")
		.split(",")
		.map((w) => w.trim())
		.filter(Boolean);
	const seen = new Set(words.map((w) => w.toLocaleLowerCase()));
	for (const word of add
		.split(",")
		.map((w) => w.trim())
		.filter(Boolean)) {
		if (seen.has(word.toLocaleLowerCase())) continue;
		seen.add(word.toLocaleLowerCase());
		words.push(word);
	}
	return words.join(", ");
}

export interface TaxonomyReport {
	categoriesCreated: number;
	picturesAdded: number;
	/** Pictures that could not be fetched: the next run tries them again. */
	picturesFailed: number;
	attributesAdded: number;
	optionsAdded: number;
	aliasesUpdated: number;
	tagsCreated: number;
	tagsExtended: number;
}

type CategoryDoc = Row & {
	id: string;
	slug: string;
	image?: unknown;
	searchAliases?: string | null;
	attributes?: Row[] | null;
};

/**
 * Applies the extension. Each language is its own write: French into the
 * default locale, then English on the same rows (`attributeRow` keeps the
 * ids), as the category seed does.
 */
export async function importTaxonomy(
	payload: Payload,
	options: { log?: (line: string) => void; withPictures?: boolean } = {},
): Promise<TaxonomyReport> {
	const log = options.log ?? (() => {});
	const report: TaxonomyReport = {
		categoriesCreated: 0,
		picturesAdded: 0,
		picturesFailed: 0,
		attributesAdded: 0,
		optionsAdded: 0,
		aliasesUpdated: 0,
		tagsCreated: 0,
		tagsExtended: 0,
	};
	if (options.withPictures !== false && !process.env.PIXABAY_API_KEY)
		log("no PIXABAY_API_KEY: categories created without their Pixabay photo");

	const read = async (slug: string, locale: Locale = "fr") =>
		(
			await payload.find({
				collection: "categories",
				where: { slug: { equals: slug } },
				limit: 1,
				depth: 0,
				locale,
				fallbackLocale: false,
				overrideAccess: true,
			})
		).docs[0] as unknown as CategoryDoc | undefined;

	const picture = async (category: TaxonomyCategory) => {
		const image = category.image;
		if (!image || options.withPictures === false) return undefined;
		const key = process.env.PIXABAY_API_KEY;
		if (image.pixabayId && !key) return undefined;
		try {
			const file =
				image.pixabayId && key
					? await pixabayPicture(image.pixabayId, category.slug, key)
					: await fetchFileByURL(image.url ?? "", category.slug);
			const media = await payload.create({
				collection: "media",
				data: { alt: category.name.fr },
				file,
				overrideAccess: true,
			});
			return String(media.id);
		} catch (error) {
			log(`picture for ${category.slug} not added: ${error}`);
			report.picturesFailed++;
			return undefined;
		}
	};

	/** Appends attributes to a category, both languages, skipping known slugs. */
	const appendAttributes = async (
		category: CategoryDoc,
		attributes: TaxonomyAttribute[],
	) => {
		const have = new Set((category.attributes ?? []).map((row) => row.slug));
		const fresh = attributes.filter((a) => !have.has(a.slug));
		if (fresh.length === 0) return;
		const frRows = [
			...(category.attributes ?? []),
			...fresh.map((a) => attributeRow(a, "fr")),
		];
		await payload.update({
			collection: "categories",
			id: category.id,
			locale: "fr",
			data: { attributes: frRows },
			overrideAccess: true,
		});
		const saved = await read(category.slug, "fr");
		const english = await read(category.slug, "en");
		const enRows = (saved?.attributes ?? []).map((row) => {
			const added = fresh.find((a) => a.slug === row.slug);
			if (added) return attributeRow(added, "en", row);
			// A row already there keeps its English as stored.
			return (
				(english?.attributes ?? []).find((r) => sameAttribute(r, row)) ?? row
			);
		});
		await payload.update({
			collection: "categories",
			id: category.id,
			locale: "en",
			data: { attributes: enRows },
			overrideAccess: true,
		});
		report.attributesAdded += fresh.length;
	};

	// ─── New categories, each parent before its children ─────────────────
	for (const category of TAXONOMY.categories) {
		const found = await read(category.slug);
		if (found) {
			if (!found.image) {
				const image = await picture(category);
				if (image) {
					await payload.update({
						collection: "categories",
						id: found.id,
						data: { image },
						overrideAccess: true,
					});
					report.picturesAdded++;
				}
			}
			await appendAttributes(found, category.attributes);
			continue;
		}
		const parent = category.parentSlug ? await read(category.parentSlug) : null;
		if (category.parentSlug && !parent) {
			log(`${category.slug} skipped: parent ${category.parentSlug} is missing`);
			continue;
		}
		const image = await picture(category);
		const created = (await payload.create({
			collection: "categories",
			locale: "fr",
			data: {
				name: category.name.fr,
				slug: category.slug,
				description: category.description.fr,
				searchAliases: category.searchAliases,
				icon: category.icon,
				active: true,
				...(parent ? { parent: parent.id } : {}),
				...(image ? { image } : {}),
				...(category.listingForm ? { listingForm: category.listingForm } : {}),
				attributes: category.attributes.map((a) =>
					attributeRow(a, "fr"),
				) as unknown as Category["attributes"],
			},
			overrideAccess: true,
		})) as unknown as CategoryDoc;
		await payload.update({
			collection: "categories",
			id: created.id,
			locale: "en",
			data: {
				name: category.name.en,
				description: category.description.en,
				attributes: category.attributes.map((a) =>
					attributeRow(
						a,
						"en",
						(created.attributes ?? []).find((row) => row.slug === a.slug),
					),
				),
			},
			overrideAccess: true,
		});
		report.categoriesCreated++;
		if (image) report.picturesAdded++;
	}

	// ─── What the categories already there gain ──────────────────────────
	for (const entry of TAXONOMY.existing.attributes) {
		const found = await read(entry.categorySlug);
		if (found) await appendAttributes(found, entry.attributes);
	}

	for (const entry of TAXONOMY.existing.optionAdditions) {
		const found = await read(entry.categorySlug);
		const attribute = found?.attributes?.find(
			(a) => a.slug === entry.attributeSlug,
		);
		if (!found || !attribute || attribute.type !== "select") continue;
		const current = (attribute.options as Row[] | undefined) ?? [];
		const known = new Set(current.map((o) => String(o.value).toLowerCase()));
		const fresh = entry.addOptions.filter(
			(o) => !known.has(o.value.toLowerCase()),
		);
		if (fresh.length === 0) continue;
		const withOptions = (rows: Row[], locale: Locale, base: Row[]) =>
			rows.map((row) =>
				sameAttribute(row, attribute)
					? {
							...row,
							options: [
								...base,
								...fresh.map((o) => ({
									value: o.value,
									label: o.label[locale],
								})),
							],
						}
					: row,
			);
		await payload.update({
			collection: "categories",
			id: found.id,
			locale: "fr",
			data: { attributes: withOptions(found.attributes ?? [], "fr", current) },
			overrideAccess: true,
		});
		const saved = await read(found.slug, "fr");
		const english = await read(found.slug, "en");
		const savedOptions =
			(saved?.attributes?.find((a) => sameAttribute(a, attribute))
				?.options as Row[]) ?? [];
		const englishAttribute = english?.attributes?.find((a) =>
			sameAttribute(a, attribute),
		);
		const enOptions = savedOptions.map((option) => {
			const added = fresh.find((o) => sameOption(o, option));
			if (added)
				return {
					...(option.id ? { id: option.id } : {}),
					value: option.value,
					label: added.label.en,
				};
			return (
				((englishAttribute?.options as Row[]) ?? []).find((o) =>
					sameOption(o, option),
				) ?? option
			);
		});
		await payload.update({
			collection: "categories",
			id: found.id,
			locale: "en",
			data: {
				attributes: (english?.attributes ?? saved?.attributes ?? []).map(
					(row) =>
						sameAttribute(row, attribute)
							? { ...row, options: enOptions }
							: row,
				),
			},
			overrideAccess: true,
		});
		report.optionsAdded += fresh.length;
	}

	for (const entry of TAXONOMY.existing.aliases) {
		const found = await read(entry.categorySlug);
		if (!found) continue;
		const merged = mergeAliases(found.searchAliases, entry.addAliases);
		if (merged === (found.searchAliases ?? "")) continue;
		await payload.update({
			collection: "categories",
			id: found.id,
			data: { searchAliases: merged },
			overrideAccess: true,
		});
		report.aliasesUpdated++;
	}

	// ─── Tags ─────────────────────────────────────────────────────────────
	const all = await payload.find({
		collection: "categories",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	const idBySlug = new Map(all.docs.map((c) => [c.slug, String(c.id)]));
	const ids = (slugs: string[]) =>
		slugs
			.map((slug) => idBySlug.get(slug))
			.filter((id): id is string => Boolean(id));
	const findTag = async (slug: string) =>
		(
			await payload.find({
				collection: "tags",
				where: { slug: { equals: slug } },
				depth: 0,
				limit: 1,
				overrideAccess: true,
			})
		).docs[0];

	for (const tag of TAXONOMY.tags) {
		if (await findTag(tag.slug)) continue;
		const doc = await payload.create({
			collection: "tags",
			locale: "fr",
			data: {
				name: tag.name.fr,
				slug: tag.slug,
				emoji: tag.emoji,
				categories: ids(tag.categories),
			},
			overrideAccess: true,
		});
		await payload.update({
			collection: "tags",
			id: doc.id,
			locale: "en",
			data: { name: tag.name.en },
			overrideAccess: true,
		});
		report.tagsCreated++;
	}

	for (const entry of TAXONOMY.existing.tagCategoryAdditions) {
		const found = await findTag(entry.tagSlug);
		if (!found) continue;
		const current = ((found.categories ?? []) as unknown[]).map((c) =>
			typeof c === "object" && c && "id" in c
				? String((c as Row).id)
				: String(c),
		);
		const next = [...new Set([...current, ...ids(entry.categories)])];
		if (next.length === current.length) continue;
		await payload.update({
			collection: "tags",
			id: found.id,
			data: { categories: next },
			overrideAccess: true,
		});
		report.tagsExtended++;
	}

	log(
		`taxonomy: ${report.categoriesCreated} categories, ${report.picturesAdded} pictures (${report.picturesFailed} failed), ${report.attributesAdded} attributes, ${report.optionsAdded} options, ${report.aliasesUpdated} alias lists, ${report.tagsCreated} tags created, ${report.tagsExtended} extended`,
	);
	return report;
}
