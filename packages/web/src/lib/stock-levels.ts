import type { PopulatedVariant } from "~/lib/shop-api";
import { variantLabel } from "~/lib/variants";

/** What a variant's stock says to the seller, worst first. */
export type StockState = "out" | "low" | "ok" | "untracked";

export const STOCK_STATE_FILTERS = ["all", "out", "low", "ok"] as const;
export type StockStateFilter = (typeof STOCK_STATE_FILTERS)[number];

export interface StockLevelRow {
	variantId: string;
	productId: string;
	productTitle: string;
	label: string;
	sku: string | null;
	onHand: number;
	reserved: number;
	/** What buyers can still order: on hand less what orders hold. */
	available: number;
	threshold: number | null;
	state: StockState;
}

export function stockStateOf(variant: {
	trackInventory: boolean;
	stockOnHand: number;
	stockReserved: number;
	lowStockThreshold?: number | null;
}): StockState {
	if (!variant.trackInventory) return "untracked";
	const available = variant.stockOnHand - variant.stockReserved;
	if (available <= 0) return "out";
	if (
		variant.lowStockThreshold != null &&
		available <= variant.lowStockThreshold
	)
		return "low";
	return "ok";
}

export function toStockLevelRow(
	variant: PopulatedVariant,
	defaultLabel: string,
): StockLevelRow {
	const product = typeof variant.product === "object" ? variant.product : null;
	return {
		variantId: variant.id,
		productId: product?.id ?? String(variant.product),
		productTitle: product?.title ?? "",
		label: variantLabel(variant.optionValues, defaultLabel),
		sku: variant.sku ?? null,
		onHand: variant.stockOnHand,
		reserved: variant.stockReserved,
		available: Math.max(0, variant.stockOnHand - variant.stockReserved),
		threshold: variant.lowStockThreshold ?? null,
		state: stockStateOf(variant),
	};
}

const STATE_ORDER: Record<StockState, number> = {
	out: 0,
	low: 1,
	ok: 2,
	untracked: 3,
};

/**
 * The rows a search and a state filter keep, what needs attention first
 * (out of stock, then low), then by product and variant.
 */
export function filterStockLevels(
	rows: StockLevelRow[],
	{ q, state }: { q: string; state: StockStateFilter },
): StockLevelRow[] {
	const needle = q.trim().toLocaleLowerCase();
	return rows
		.filter((row) => state === "all" || row.state === state)
		.filter(
			(row) =>
				!needle ||
				[row.productTitle, row.label, row.sku ?? ""].some((text) =>
					text.toLocaleLowerCase().includes(needle),
				),
		)
		.sort(
			(a, b) =>
				STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
				a.productTitle.localeCompare(b.productTitle) ||
				a.label.localeCompare(b.label),
		);
}

/** How many rows each state holds, for the filter chips. */
export function countStockStates(
	rows: StockLevelRow[],
): Record<StockStateFilter, number> {
	const counts = { all: rows.length, out: 0, low: 0, ok: 0 };
	for (const row of rows) if (row.state !== "untracked") counts[row.state]++;
	return counts;
}

export function stockLevelsFiltersOf(params: Pick<URLSearchParams, "get">): {
	q: string;
	state: StockStateFilter;
} {
	const state = params.get("state") ?? "all";
	return {
		q: params.get("q") ?? "",
		state: (STOCK_STATE_FILTERS as readonly string[]).includes(state)
			? (state as StockStateFilter)
			: "all",
	};
}
