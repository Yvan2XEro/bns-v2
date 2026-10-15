import type { Payload } from "payload";
import {
	type CategoryFormPresetInput,
	getListingCategoryType,
} from "../lib/listingFormPreset";

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

export interface CategoryRow {
	id: string;
	slug: string | null;
	parent: string | null;
	listingForm: Rec | null;
	attributes: Rec[];
}

const idText = (value: unknown): string | null => {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "object" && "id" in (value as Rec)) {
		return idText((value as Rec).id);
	}
	return String(value);
};

/** Every category as stored, read past the collection config. */
export async function loadCategoryRows(
	payload: Payload,
): Promise<Map<string, CategoryRow>> {
	const rows = new Map<string, CategoryRow>();
	for await (const doc of raw(payload, "categories").find({})) {
		const id = idText(doc._id ?? doc.id);
		if (!id) continue;
		rows.set(id, {
			id,
			slug: typeof doc.slug === "string" ? doc.slug : null,
			parent: idText(doc.parent),
			listingForm:
				doc.listingForm && typeof doc.listingForm === "object"
					? (doc.listingForm as Rec)
					: null,
			attributes: Array.isArray(doc.attributes)
				? doc.attributes.filter(
						(row): row is Rec => !!row && typeof row === "object",
					)
				: [],
		});
	}
	return rows;
}

/** The category and its ancestors, nearest first, guarded against cycles. */
export function chainOf(
	rows: Map<string, CategoryRow>,
	id: string | null,
): CategoryRow[] {
	const chain: CategoryRow[] = [];
	let current = id ? rows.get(id) : undefined;
	while (current && !chain.includes(current) && chain.length < 32) {
		chain.push(current);
		current = current.parent ? rows.get(current.parent) : undefined;
	}
	return chain;
}

/** The chain as the populated object `listingFormPreset` reads. */
export function nestedCategory(
	chain: readonly CategoryRow[],
): CategoryFormPresetInput | null {
	let node: CategoryFormPresetInput | null = null;
	for (const row of [...chain].reverse()) {
		node = {
			slug: row.slug,
			parent: node,
			listingForm: row.listingForm as CategoryFormPresetInput["listingForm"],
		};
	}
	return node;
}

/**
 * Where the seeded tags were meant to be offered, frozen as of this
 * migration. Leisure is listed by child so its holiday rentals are left out.
 */
const SEEDED_TAG_SCOPES: Record<string, readonly string[]> = {
	negotiable: [
		"vehicles",
		"real-estate",
		"electronics",
		"home-garden",
		"fashion",
		"leisure-sports",
		"kids-baby",
		"other",
	],
	swap: [
		"vehicles",
		"electronics",
		"home-garden",
		"fashion",
		"sports-equipment",
		"books-media",
		"kids-baby",
	],
	delivery: [
		"electronics",
		"home-garden",
		"fashion",
		"sports-equipment",
		"books-media",
		"kids-baby",
	],
	urgent: [
		"vehicles",
		"electronics",
		"home-garden",
		"fashion",
		"sports-equipment",
		"books-media",
		"kids-baby",
		"other",
	],
	bundle: [
		"electronics",
		"home-garden",
		"fashion",
		"sports-equipment",
		"books-media",
		"kids-baby",
	],
	warranty: ["vehicles", "electronics", "appliances", "furniture"],
	receipt: [
		"vehicles",
		"electronics",
		"appliances",
		"furniture",
		"watches-jewelry",
	],
	"first-owner": ["vehicles", "electronics"],
	"new-with-tags": ["fashion", "kids-baby"],
	demo: ["electronics", "appliances"],
	visit: ["real-estate", "vehicles"],
	"full-time": ["job-offers"],
	"part-time": ["job-offers"],
	remote: ["job-offers"],
};

/**
 * The highest categories under which every ad is goods. A top-level category
 * whose whole subtree is "product" is listed itself; one that mixes in
 * another kind (Leisure holds Holiday rentals) is replaced by its children,
 * recursively, so no rental or job inherits a goods tag through it.
 */
export function goodsCover(rows: Map<string, CategoryRow>): string[] {
	const children = new Map<string, CategoryRow[]>();
	for (const row of rows.values()) {
		if (!row.parent || !rows.has(row.parent)) continue;
		children.set(row.parent, [...(children.get(row.parent) ?? []), row]);
	}
	const isGoods = (row: CategoryRow) =>
		getListingCategoryType(nestedCategory(chainOf(rows, row.id))) === "product";
	const allGoods = (row: CategoryRow, seen: Set<string>): boolean => {
		if (seen.has(row.id)) return true;
		seen.add(row.id);
		return (
			isGoods(row) &&
			(children.get(row.id) ?? []).every((child) => allGoods(child, seen))
		);
	};
	const cover = (row: CategoryRow, seen: Set<string>): string[] => {
		if (seen.has(row.id)) return [];
		seen.add(row.id);
		if (allGoods(row, new Set())) return [row.id];
		return (children.get(row.id) ?? []).flatMap((child) => cover(child, seen));
	};
	const seen = new Set<string>();
	return [...rows.values()]
		.filter((row) => !row.parent || !rows.has(row.parent))
		.flatMap((row) => cover(row, seen));
}

export interface TagScopeReport {
	tagsScoped: number;
	tagsAlreadyScoped: number;
	listingsChanged: number;
	tagsDropped: number;
}

/**
 * Gives every unscoped tag a category scope, then strips from each listing
 * the tags its category no longer gets. Idempotent: a scoped tag is left as
 * it is, and a listing whose tags all apply is not written.
 */
export async function migrateTagCategoryScope(
	payload: Payload,
): Promise<TagScopeReport> {
	const rows = await loadCategoryRows(payload);
	const idBySlug = new Map(
		[...rows.values()].flatMap((row) => (row.slug ? [[row.slug, row.id]] : [])),
	);
	const goods = goodsCover(rows);

	const report: TagScopeReport = {
		tagsScoped: 0,
		tagsAlreadyScoped: 0,
		listingsChanged: 0,
		tagsDropped: 0,
	};

	const scopes = new Map<string, Set<string>>();
	const tags = await payload.find({
		collection: "tags",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	for (const tag of tags.docs) {
		const current = (tag.categories ?? [])
			.map(idText)
			.filter((id): id is string => id !== null);
		if (current.length > 0) {
			report.tagsAlreadyScoped += 1;
			scopes.set(String(tag.id), new Set(current));
			continue;
		}
		const seeded = (SEEDED_TAG_SCOPES[tag.slug] ?? [])
			.map((slug) => idBySlug.get(slug))
			.filter((id): id is string => Boolean(id));
		const scope = seeded.length > 0 ? seeded : goods;
		scopes.set(String(tag.id), new Set(scope));
		if (scope.length === 0) continue;
		await payload.update({
			collection: "tags",
			id: tag.id,
			data: { categories: scope },
			overrideAccess: true,
		});
		report.tagsScoped += 1;
	}

	const listings = raw(payload, "listings");
	for await (const doc of listings.find(
		{},
		{ projection: { tags: 1, category: 1 } },
	)) {
		const stored = Array.isArray(doc.tags) ? doc.tags : [];
		if (stored.length === 0) continue;
		const chain = chainOf(rows, idText(doc.category)).map((row) => row.id);
		const kept = stored.filter((value) => {
			const scope = scopes.get(idText(value) ?? "");
			return !!scope && chain.some((id) => scope.has(id));
		});
		if (kept.length === stored.length) continue;
		await listings.updateOne(
			{ _id: doc._id ?? doc.id },
			{ $set: { tags: kept } },
		);
		report.listingsChanged += 1;
		report.tagsDropped += stored.length - kept.length;
	}

	return report;
}
