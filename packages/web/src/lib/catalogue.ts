/** The tabs above the catalogue, in the order they are shown. */
export const CATALOGUE_FILTERS = [
	"all",
	"active",
	"draft",
	"archived",
	"low",
	"out",
] as const;

export type CatalogueFilter = (typeof CATALOGUE_FILTERS)[number];

export function isCatalogueFilter(value: string): value is CatalogueFilter {
	return (CATALOGUE_FILTERS as readonly string[]).includes(value);
}

/**
 * One tab row, two server params: three tabs narrow the product status and two
 * narrow the stock state, which the API treats as independent filters.
 */
export function catalogueParamsFor(filter: CatalogueFilter): {
	status?: string;
	stock?: "low" | "out";
} {
	if (filter === "low" || filter === "out") return { stock: filter };
	if (filter === "all") return {};
	return { status: filter };
}
