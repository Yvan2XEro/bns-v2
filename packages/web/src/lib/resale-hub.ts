import type {
	ResellerFinanceView,
	ResoldListing,
	SupplierResaleProduct,
} from "../../../api/src/contracts/resale";

export type ResaleView = "reseller" | "supplier";
export const RESELLER_TABS = ["find", "resold", "suppliers"] as const;
export const SUPPLIER_TABS = ["orders", "resellers", "offered"] as const;
export type ResellerTab = (typeof RESELLER_TABS)[number];
export type SupplierTab = (typeof SUPPLIER_TABS)[number];
export type ResaleTab = ResellerTab | SupplierTab;

/** Mirrors the PATCH /api/products/{id}/resale body. */
export interface SupplierResaleSettingsInput {
	enabled: boolean;
	approvalRequired: boolean;
	handlingHours: number;
	codAccepted: boolean;
	resellerNotes: string;
	variants: Array<{
		id: string;
		enabled: boolean;
		supplierPrice: number;
		minRetailPrice: number;
		suggestedRetailPrice: number;
	}>;
}

/** A shop that cannot supply only ever sees the reseller side. */
export function resolveResaleTab(
	view: string | undefined,
	tab: string | undefined,
	supplierCapable: boolean,
): { view: ResaleView; tab: ResaleTab } {
	const supplierView =
		supplierCapable &&
		(view === "supplier" ||
			(view !== "reseller" && (isSupplierTab(tab) || tab === undefined)));
	if (supplierView) {
		return { view: "supplier", tab: isSupplierTab(tab) ? tab : "orders" };
	}
	return {
		view: "reseller",
		tab: (RESELLER_TABS as readonly string[]).includes(tab ?? "")
			? (tab as ResellerTab)
			: "find",
	};
}

function isSupplierTab(tab: string | undefined): tab is SupplierTab {
	return (SUPPLIER_TABS as readonly string[]).includes(tab ?? "");
}

export function resaleHref(
	view: ResaleView,
	tab: ResaleTab,
	extra: Record<string, string> = {},
): string {
	const params = new URLSearchParams({ view, tab, ...extra });
	return `/seller/resale?${params.toString()}`;
}

/** Same rounding as the API's `commissionForLine`. */
export function commissionOf(amount: number, rateBps: number): number {
	const raw = (amount * rateBps) / 10_000;
	return Math.sign(raw) * Math.round(Math.abs(raw));
}

export function resaleGain(
	price: number,
	supplierPrice: number,
	rateBps: number,
): { margin: number; commission: number; gain: number } {
	const margin = price - supplierPrice;
	const commission = commissionOf(price, rateBps);
	return { margin, commission, gain: margin - commission };
}

export type ResoldFilter = "all" | "on_sale" | "hidden" | "out_of_stock";

export function resoldFilterOf(listing: ResoldListing): ResoldFilter {
	if (listing.status === "on_sale") return "on_sale";
	if (listing.status === "out_of_stock") return "out_of_stock";
	return "hidden";
}

export function resoldCounts(
	listings: ResoldListing[],
): Record<ResoldFilter, number> {
	const counts = {
		all: listings.length,
		on_sale: 0,
		hidden: 0,
		out_of_stock: 0,
	};
	for (const listing of listings) counts[resoldFilterOf(listing)] += 1;
	return counts;
}

/** Each variant raised to the supplier's minimum, untouched where already above it. */
export function pricesAtMinimum(
	listing: ResoldListing,
): Array<{ variantId: string; price: number }> {
	return listing.variants.map((variant) => ({
		variantId: variant.id,
		price:
			variant.minRetailPrice !== null && variant.price < variant.minRetailPrice
				? variant.minRetailPrice
				: variant.price,
	}));
}

export function resaleEarnings(
	finance: ResellerFinanceView,
	now = new Date(),
): { pending: number; paidThisMonth: number } {
	const pending = finance.commissions
		.filter((row) => ["accrued", "payable", "held"].includes(row.status))
		.reduce((total, row) => total + row.amount, 0);
	const paidThisMonth = finance.payouts
		.filter((payout) => {
			const at = new Date(payout.createdAt);
			return (
				payout.status === "complete" &&
				at.getFullYear() === now.getFullYear() &&
				at.getMonth() === now.getMonth()
			);
		})
		.reduce((total, payout) => total + payout.amount, 0);
	return { pending, paidThisMonth };
}

export interface ResaleRulesSummary {
	handling: { min: number; max: number } | null;
	approval: "all" | "none" | "mixed" | null;
	cod: "all" | "none" | "mixed" | null;
}

/** Rules are stored per product; the summary reads them across the offer. */
export function resaleRules(
	products: SupplierResaleProduct[],
): ResaleRulesSummary {
	const hours = products
		.map((product) => product.handlingHours)
		.filter((value): value is number => typeof value === "number");
	const mix = (values: boolean[]) =>
		values.length === 0
			? null
			: values.every(Boolean)
				? "all"
				: values.some(Boolean)
					? "mixed"
					: "none";
	return {
		handling:
			hours.length > 0
				? { min: Math.min(...hours), max: Math.max(...hours) }
				: null,
		approval: mix(products.map((product) => product.approvalRequired === true)),
		cod: mix(products.map((product) => product.codAccepted === true)),
	};
}

export function variantOptionLabel(
	values: unknown,
	sku: string | null,
	fallback: string,
): string {
	if (typeof values === "string" && values.trim()) return values;
	if (typeof values === "object" && values !== null) {
		const labels = Object.values(values).filter(
			(value): value is string => typeof value === "string" && value !== "",
		);
		if (labels.length) return labels.join(" · ");
	}
	return sku ?? fallback;
}

/** Mirrors the API's `PUBLIC_STOCK_CAP`: above it a stock reads as "in stock". */
export const SUPPLIER_STOCK_CAP = 10;

export type SupplierStockState =
	| { kind: "hidden" }
	| { kind: "in_stock" }
	| { kind: "count"; count: number };

/**
 * A product's supplier stock across its variants, as the API caps it: absent
 * while the supplier price is hidden, null for "in stock" (large or untracked).
 */
export function supplierStockState(
	stocks: ReadonlyArray<number | null | undefined>,
): SupplierStockState {
	if (stocks.length === 0 || stocks.some((value) => value === undefined))
		return { kind: "hidden" };
	if (stocks.some((value) => value === null)) return { kind: "in_stock" };
	const total = stocks.reduce<number>((sum, value) => sum + (value ?? 0), 0);
	return total > SUPPLIER_STOCK_CAP
		? { kind: "in_stock" }
		: { kind: "count", count: total };
}
