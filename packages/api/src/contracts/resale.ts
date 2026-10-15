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
