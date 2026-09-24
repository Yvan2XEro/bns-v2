import type { Category, Product } from "../../../api/src/payload-types";

export interface MediaRef {
	id: string;
	url: string | null;
	thumbnailURL: string | null;
	alt: string | null;
}

export type ShopRole = "owner" | "manager" | "staff";
export type ShopStatus = "active" | "suspended" | "closed";
export type ProductStatus = "draft" | "active" | "archived";
export type MovementType =
	| "receipt"
	| "adjustment"
	| "loss"
	| "return"
	| "sale"
	| "reservation"
	| "release";
/** The subset a shop member can record by hand; the rest are written by orders. */
export type ClientMovementType = "receipt" | "adjustment" | "loss" | "return";

export interface PublicShop {
	id: string;
	handle: string;
	name: string;
	description: string | null;
	logo: MediaRef | null;
	banner: MediaRef | null;
	contact: {
		phone: string | null;
		whatsapp: string | null;
		email: string | null;
	};
	location: {
		city: string | null;
		region: string | null;
		country: string | null;
		countryCode: string | null;
	};
	categories: { id: string; name: string; slug: string }[];
	level: number;
	publishedListingCount: number;
	createdAt: string;
	owner: {
		id: string;
		name: string;
		avatar: MediaRef | null;
		rating: number;
		totalReviews: number;
		memberSince: string;
	};
}

export type MyShop = PublicShop & {
	status: ShopStatus;
	handleChangedAt: string | null;
	nextHandleChangeAt: string | null;
	suspension: {
		active: boolean;
		indefinite: boolean;
		until: string | null;
		reason: string | null;
	} | null;
};

export interface MyShopResponse {
	shop: MyShop | null;
	role: ShopRole | null;
	counts: {
		activeProducts: number;
		draftProducts: number;
		lowStockVariants: number;
		lowStockSample: string | null;
		personalListings: number;
	} | null;
}

export interface HandleAvailability {
	available: boolean;
	reason: null | "invalid" | "reserved" | "taken";
	handle: string;
}

export interface ShopSearchHit {
	id: string;
	handle: string;
	name: string;
	description: string | null;
	city: string | null;
	level: number;
	publishedListingCount: number;
	logoUrl: string | null;
	ownerRating: number;
	ownerReviews: number;
	createdAt: string;
}

export interface ShopSearchResponse {
	hits: ShopSearchHit[];
	total: number;
	limit: number;
	offset: number;
}

export interface CatalogueRow {
	id: string;
	title: string;
	status: ProductStatus;
	image: MediaRef | null;
	variantCount: number;
	priceMin: number | null;
	priceMax: number | null;
	stockOnHand: number;
	available: number;
	trackInventory: boolean;
	lowStock: boolean;
	outOfStock: boolean;
	sku: string | null;
	listingId: string | null;
	listingStatus: string | null;
	updatedAt: string;
}

export interface CatalogueResponse {
	docs: CatalogueRow[];
	totalDocs: number;
	page: number;
	totalPages: number;
	counts: {
		all: number;
		active: number;
		draft: number;
		archived: number;
		low: number;
		out: number;
	};
}

export interface VariantDoc {
	id: string;
	product: string;
	shop: string;
	optionValues: Record<string, string>;
	sku: string | null;
	price: number;
	cost?: number | null;
	trackInventory: boolean;
	stockOnHand: number;
	stockReserved: number;
	lowStockThreshold: number | null;
	/** Server-derived purchasability signal, set before field access runs — present for every reader, shop member or not. */
	available: boolean;
	archivedAt: string | null;
}

/**
 * A buyer's view of a variant, from `GET /api/public/products/:id/variants`.
 * Leaner than `VariantDoc` on purpose: no `cost`, no `stockOnHand`/
 * `stockReserved`, no `shop`/`sku`/`archivedAt` — `available` is the only
 * purchasability signal a non-member ever receives.
 */
export interface PublicVariantDoc {
	id: string;
	optionValues: Record<string, string> | null;
	price: number;
	trackInventory: boolean;
	available: boolean;
}

export interface MovementRow {
	id: string;
	type: MovementType;
	quantity: number;
	stockAfter: number;
	unitCost: number | null;
	note: string | null;
	createdAt: string;
	actor: { id: string; name: string } | null;
	variant: { id: string; label: string; sku: string | null };
	product: { id: string; title: string };
}

export interface MovementPage {
	docs: MovementRow[];
	totalDocs: number;
	page: number;
	totalPages: number;
	hasNextPage: boolean;
}

export interface ProductVariantInput {
	id?: string;
	optionValues: Record<string, string>;
	sku?: string | null;
	price: number;
	cost?: number | null;
	trackInventory?: boolean;
	lowStockThreshold?: number | null;
	initialStock?: number;
}

export interface ProductInput {
	title: string;
	description?: string | null;
	category: string;
	condition?: "new" | "like_new" | "good" | "fair" | "poor" | null;
	attributes?: Record<string, unknown>;
	images?: string[];
	status: ProductStatus;
	options?: { name: string; values: string[] }[];
	variants: ProductVariantInput[];
	delivery?: {
		handlingHours?: number | null;
		weightGrams?: number | null;
		codAllowed?: boolean;
		pickupAllowed?: boolean;
	};
	returnPolicy?: string | null;
}

export interface ProductSaveResponse {
	product: Product;
	variants: VariantDoc[];
}

export interface ProductDetailResponse {
	product: Product & { category?: string | Category | null };
	variants: VariantDoc[];
	listing: {
		id: string;
		status: string;
		views: number;
		favorites: number;
	} | null;
	movements: MovementRow[];
	role: ShopRole;
}

export interface VariantAlert {
	variantId: string;
	productId: string;
	productTitle: string;
	label: string;
	available: number;
	threshold: number;
}

export interface StockSummary {
	costValue: number;
	unitsOnHand: number;
	unitsReserved: number;
	trackedVariants: number;
	lowStock: VariantAlert[];
	outOfStock: VariantAlert[];
}

export interface AttachResult {
	attached: { listingId: string; productId: string }[];
	skipped: {
		listingId: string;
		reason: "notOwner" | "otherShop" | "alreadyAttached" | "status";
	}[];
}

export interface StockCountResult {
	results: { variantId: string; delta: number; stockAfter: number }[];
}
