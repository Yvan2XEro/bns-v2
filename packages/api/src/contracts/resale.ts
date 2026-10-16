/**
 * A supplier may reserve a product for resellers of a given level. Reselling
 * itself already needs level 2, so the only meaningful minimums are 2 and 3;
 * null means no minimum beyond that.
 */
export const RESALE_MIN_RESELLER_LEVELS = [2, 3] as const;
export type ResaleMinResellerLevel =
	(typeof RESALE_MIN_RESELLER_LEVELS)[number];

export function isMinResellerLevel(
	value: unknown,
): value is ResaleMinResellerLevel | null {
	return (
		value === null ||
		RESALE_MIN_RESELLER_LEVELS.includes(value as ResaleMinResellerLevel)
	);
}

/** Stored values outside the rule read as no minimum rather than locking everyone out. */
export function minResellerLevelOf(
	value: unknown,
): ResaleMinResellerLevel | null {
	return typeof value === "number" && isMinResellerLevel(value) ? value : null;
}

export function meetsMinResellerLevel(
	resellerLevel: number,
	minimum: unknown,
): boolean {
	const required = minResellerLevelOf(minimum);
	return required === null || resellerLevel >= required;
}

export interface ResaleCatalogueVariant {
	id: string;
	sku: string | null;
	optionValues: unknown;
	minRetailPrice: number | null;
	suggestedRetailPrice: number | null;
	supplierPrice?: number;
	/**
	 * Units the supplier can ship now, exact only up to `PUBLIC_STOCK_CAP`;
	 * null means in stock. Absent when the supplier price is hidden.
	 */
	supplierStock?: number | null;
}

export interface ResaleCatalogueProduct {
	productId: string;
	title: string;
	description: string | null;
	categoryId: string | null;
	images?: Array<{
		id?: string | null;
		image:
			| string
			| { id: string; url?: string | null; thumbnailURL?: string | null };
	}> | null;
	supplier: { id: string; name: string; level: number };
	linkStatus: "requested" | "approved" | "suspended" | "revoked" | null;
	approvalRequired: boolean;
	variants: ResaleCatalogueVariant[];
	resellerCount?: number;
	handlingHours?: number | null;
	codAccepted?: boolean;
	/** True when the asking shop already resells this product. */
	inMyShop?: boolean;
	minResellerLevel?: ResaleMinResellerLevel | null;
	/**
	 * The asking shop is below `minResellerLevel`: the product is shown so the
	 * reseller knows it exists, without supplier price or stock, and every
	 * action on it is refused with `resale.resellerLevelTooLow`.
	 */
	levelLocked?: boolean;
}

export interface ResaleCataloguePage {
	products: ResaleCatalogueProduct[];
	commissionRateBps?: number;
}

export interface SupplierResaleProduct {
	productId: string;
	title: string;
	enabled: boolean;
	resellerCount: number;
	unitsDelivered30d: number;
	pendingEffectiveAt: string | null;
	approvalRequired?: boolean;
	handlingHours?: number | null;
	codAccepted?: boolean;
	minResellerLevel?: ResaleMinResellerLevel | null;
	variants: Array<{
		id: string;
		sku: string | null;
		stock?: number | null;
		supplierPrice: number | null;
		minRetailPrice: number | null;
		suggestedRetailPrice: number | null;
		resellerPrices: number[];
	}>;
}

export interface CurrentResaleTerms {
	id: string;
	role: "supplier" | "reseller";
	version: string;
	bodyFr: unknown;
	bodyEn: unknown;
}

export interface CreateResaleListingInput {
	productId: string;
	prices: Array<{ variantId: string; price: number }>;
	desiredStatus: "published" | "draft";
}

export interface ResaleLinkListItem {
	id: string;
	status: "requested" | "approved" | "suspended" | "revoked";
	partnerShop: {
		id: string;
		name: string;
		handle: string | null;
		level?: 0 | 1 | 2 | 3;
	};
	message: string | null;
	requestedAt: string | null;
	updatedAt: string | null;
	stats: {
		publishedListings: number;
		deliveredOrders30d: number;
		cancelledPurchaseOrders30d: number;
		refusedDeliveries30d: number;
	};
}

export interface ResaleLinkListPage {
	docs: ResaleLinkListItem[];
	totalDocs: number;
}

export interface ResellerFinanceView {
	commissions: Array<{
		id: string;
		purchaseOrder: string;
		amount: number;
		status:
			| "accrued"
			| "payable"
			| "held"
			| "paid"
			| "cancelled"
			| "clawed_back";
		createdAt: string;
	}>;
	charges: Array<{
		id: string;
		purchaseOrder: string | null;
		amount: number;
		status: string;
		createdAt: string;
	}>;
	payouts: Array<{
		id: string;
		reference: string;
		grossAmount: number;
		offsetAmount: number;
		amount: number;
		fee: number;
		status:
			| "scheduled"
			| "awaiting_approval"
			| "pending"
			| "sent"
			| "processing"
			| "complete"
			| "failed"
			| "reversed"
			| "cancelled";
		createdAt: string;
	}>;
	accountRequired: boolean;
}

export type ResoldListingStatus =
	| "on_sale"
	| "below_minimum"
	| "out_of_stock"
	| "unavailable"
	| "held"
	| "draft";

export interface ResoldListing {
	listingId: string;
	productId: string;
	title: string;
	supplier: { id: string; name: string };
	status: ResoldListingStatus;
	variants: Array<{
		id: string;
		label: string | null;
		sku: string | null;
		price: number;
		supplierPrice: number | null;
		minRetailPrice: number | null;
		suggestedRetailPrice: number | null;
		/** Exact only up to `PUBLIC_STOCK_CAP`; null means in stock. */
		supplierStock: number | null;
	}>;
}

export interface ResoldListingPage {
	listings: ResoldListing[];
	commissionRateBps: number;
}

export interface UpdateResaleListingPricesInput {
	prices: Array<{ variantId: string; price: number }>;
}

export interface SupplierResaleSettingsView {
	productId: string;
	title: string;
	eligible: boolean;
	termsAccepted: boolean;
	enabled: boolean;
	approvalRequired: boolean;
	handlingHours: number;
	codAccepted: boolean;
	resellerNotes: string;
	minResellerLevel: ResaleMinResellerLevel | null;
	enabledAt: string | null;
	resellerCount: number;
	pendingEffectiveAt: string | null;
	pendingRequests: number;
	commissionRateBps: number;
	resellerPriceRange: { min: number; max: number } | null;
	variants: Array<{
		id: string;
		label: string | null;
		sku: string | null;
		price: number;
		stock: number | null;
		enabled: boolean;
		supplierPrice: number | null;
		minRetailPrice: number | null;
		suggestedRetailPrice: number | null;
	}>;
}
