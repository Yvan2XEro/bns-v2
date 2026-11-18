/** The tabs above the catalogue, in the order they are shown. */
export const CATALOGUE_FILTERS = [
	"all",
	"active",
	"draft",
	"low",
	"out",
	"resale",
	"archived",
] as const;

export type CatalogueFilter = (typeof CATALOGUE_FILTERS)[number];

export function isCatalogueFilter(value: string): value is CatalogueFilter {
	return (CATALOGUE_FILTERS as readonly string[]).includes(value);
}

export const CATALOGUE_SORTS = ["updated", "title", "price", "stock"] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];

/** "any" mixes the shop's own products with its resale listings. */
export const CATALOGUE_PROVENANCES = ["any", "own", "resale"] as const;
export type CatalogueProvenance = (typeof CATALOGUE_PROVENANCES)[number];

/**
 * One tab row, three server params: three tabs narrow the product status, two
 * the stock state and one the provenance, which the API treats as independent
 * filters. The "Revente" tab wins over the provenance picker.
 */
export function catalogueParamsFor(
	filter: CatalogueFilter,
	provenance: CatalogueProvenance = "any",
): {
	status?: string;
	stock?: "low" | "out";
	provenance: CatalogueProvenance;
} {
	if (filter === "resale") return { provenance: "resale" };
	if (filter === "low" || filter === "out")
		return { stock: filter, provenance };
	if (filter === "all") return { provenance };
	return { status: filter, provenance };
}

/**
 * What a row prints for its SKUs: the one SKU, or the stem several variants
 * share ("AT-IP13P" for AT-IP13P-GR256 and AT-IP13P-OR256), or the first one
 * and how many more when they share nothing useful.
 */
export function skuSummary(skus: string[]): string | null {
	if (skus.length === 0) return null;
	if (skus.length === 1) return skus[0];
	let prefix = skus[0];
	for (const sku of skus.slice(1)) {
		while (prefix && !sku.startsWith(prefix)) prefix = prefix.slice(0, -1);
	}
	prefix = prefix.replace(/[-_.\s/]+$/, "");
	return prefix.length >= 2 ? prefix : `${skus[0]} +${skus.length - 1}`;
}
