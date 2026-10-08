export interface ResaleCatalogueVariant {
	id: string;
	sku: string | null;
	optionValues: unknown;
	minRetailPrice: number | null;
	suggestedRetailPrice: number | null;
	supplierPrice?: number;
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
}

export interface ResaleCataloguePage {
	products: ResaleCatalogueProduct[];
}

export interface SupplierResaleProduct {
	productId: string;
	title: string;
	enabled: boolean;
	resellerCount: number;
	unitsDelivered30d: number;
	pendingEffectiveAt: string | null;
	variants: Array<{
		id: string;
		sku: string | null;
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
	partnerShop: { id: string; name: string; handle: string | null };
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
