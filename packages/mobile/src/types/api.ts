/**
 * API Types — source of truth for all backend response shapes.
 *
 * Backend: bns-v2/packages/api (Next.js + Payload CMS 3.x + MongoDB)
 *
 * Two kinds of endpoints:
 *  • /api/public/*   → custom Next.js routes, own response shapes (see below)
 *  • /api/{collection}/* → Payload REST — standard PayloadPage<T> shape
 */

// ─── Shared / Primitives ──────────────────────────────────────────────────────

/** Media object returned when an upload relationship is populated (depth ≥ 1). */
export interface Media {
	id: string;
	url: string;
	thumbnailURL?: string | null;
	filename: string;
	mimeType: string;
	filesize: number;
	width?: number | null;
	height?: number | null;
	alt: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * Standard Payload CMS paginated collection response.
 * Used by: /api/favorites, /api/listings, /api/conversations, /api/messages,
 *           /api/reviews, /api/saved-searches, /api/boost-payments, etc.
 */
export interface PayloadPage<T> {
	docs: T[];
	totalDocs: number;
	limit: number;
	page: number;
	totalPages: number;
	pagingCounter: number;
	hasPrevPage: boolean;
	hasNextPage: boolean;
	prevPage: number | null;
	nextPage: number | null;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserRole = "user" | "moderator" | "admin";

/**
 * Full user document — returned by Payload auth endpoints.
 *
 * Field names from the backend:
 *   verified      (NOT isVerified)
 *   rating        (NOT averageRating)
 *   totalReviews  (NOT reviewCount)
 */
export interface UserDoc {
	id: string;
	email: string;
	name: string;
	role: UserRole;
	avatar?: Media | null;
	/** Computed average rating, 0–5 */
	rating: number;
	totalReviews: number;
	bio?: string | null;
	phone?: string | null;
	/** Free-text place the user typed. Predates `homeLocation`; still shown. */
	location?: string | null;
	/**
	 * Structured place the user last confirmed, kept in sync with the app so
	 * city pickers and filters can pre-fill.
	 *
	 * Deliberately carries no coordinates: the privacy policy states the profile
	 * location is a place name rather than GPS coordinates, and that coordinates
	 * travel only with a single search request. They stay on the device.
	 */
	homeLocation?: {
		city?: string | null;
		region?: string | null;
		country?: string | null;
		countryCode?: string | null;
		source?: string | null;
		updatedAt?: string | null;
	} | null;
	/**
	 * @deprecated Retired in P2: badges belong to shops. The API still returns
	 * it, derived from the owner's identity verification, only so released app
	 * versions keep working. Read the shop's `badge` instead.
	 */
	verified: boolean;
	/** Virtual, read by the user themselves (P1). Absent on old API versions. */
	phoneVerified?: boolean;
	/** Set while the account is under sanction. See `suspensionOf()`. */
	suspendedAt?: string | null;
	/** Null alongside a set `suspendedAt` means the suspension is indefinite. */
	suspendedUntil?: string | null;
	suspendedReason?: SuspensionReason | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Response from POST /api/users/login
 * and POST /api/users (register, if auto-login is implemented server-side).
 */
export interface LoginResponse {
	message: string;
	token: string;
	/** Token expiry as Unix timestamp */
	exp: number;
	user: UserDoc;
}

/**
 * Response from GET /api/users/me
 * Payload v3 wraps the user under the "user" key (not "doc").
 */
export interface MeResponse {
	user: UserDoc;
	token?: string;
	exp?: number;
	collection?: string;
}

// ─── Categories ───────────────────────────────────────────────────────────────

/** Shape of ad a category describes. Drives which core fields the form shows. */
export type ListingCategoryType =
	| "product"
	| "service"
	| "job"
	| "rental"
	| "generic";

/** Dynamic filterable attribute defined on a category. */
export interface CategoryAttribute {
	id?: string;
	name: string;
	slug: string;
	type: "text" | "number" | "select" | "boolean" | "date";
	required?: boolean;
	filterable?: boolean;
	/**
	 * Only present when type === "select".
	 *
	 * Payload stores an array field, so every option arrives as an object — not
	 * as a bare string, whatever earlier versions of this file claimed. `label`
	 * is optional; fall back to `value` when it is absent.
	 */
	options?: { value: string; label?: string | null; id?: string | null }[];
	/** Suffix rendered after the value, e.g. "km", "m²". */
	unit?: string | null;
	/** Section heading this attribute is filed under. */
	group?: string | null;
	/** Inclusive bounds, `number` attributes only. */
	min?: number | null;
	max?: number | null;
}

/**
 * Category object.
 * Returned by /api/public/categories and embedded in listing documents.
 *
 * IMPORTANT:
 *   icon  → text field (emoji or CSS class, e.g. "🚗")
 *   image → actual image (Media), use image.url for display
 */
export interface Category {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	/** Text field — emoji or icon class name, NOT an image URL */
	icon?: string | null;
	/** Use this for displaying the category thumbnail */
	image?: Media | null;
	parent?: Category | string | null;
	active?: boolean;
	listingType?: ListingCategoryType | null;
	/** Which core fields the ad form must show. Mirrors the API's resolver. */
	formPreset?: {
		categoryType: ListingCategoryType;
		fields: {
			price: {
				enabled: boolean;
				required: boolean;
				/** Category-supplied wording, e.g. "Loyer mensuel". */
				label?: string;
			};
			condition: {
				enabled: boolean;
				required: boolean;
			};
			photos: {
				enabled: boolean;
				required: boolean;
			};
		};
	} | null;
	attributes?: CategoryAttribute[];
}

/**
 * Response from GET /api/public/categories  (no query params)
 * Returns { categories: [...] } — NOT { docs: [...] }
 */
export interface CategoriesResponse {
	categories: Category[];
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export type ListingStatus =
	| "draft"
	| "pending"
	| "published"
	| "rejected"
	| "sold"
	| "expired"
	| "deleted";

/** "new" maps to backend value "new", NOT "likeNew" */
export type ListingCondition = "new" | "like_new" | "good" | "fair" | "poor";

/**
 * A listing image item (from the images array field).
 * images[0].image.url  ← correct path to the image URL
 */
export interface ListingImageItem {
	id?: string;
	image: Media;
}

/**
 * Listing as returned by the search endpoints:
 *   GET /api/public/search
 *   GET /api/public/similar
 *
 * ONLY these fields are returned (explicitly mapped in the route).
 * Missing: category, seller, expiresAt, views, coordinates, rejectionReason.
 *
 * IMPORTANT — isBoosted is NOT in the response.
 * Derive it on the client:
 *   const isBoosted = !!(hit.boostedUntil && new Date(hit.boostedUntil) > new Date())
 */
export interface ListingHit {
	id: string;
	title: string;
	description?: string;
	price?: number | null;
	location: string;
	images?: ListingImageItem[];
	status: ListingStatus;
	condition?: ListingCondition;
	/** ISO date — if set and > now, listing is actively boosted */
	boostedUntil?: string | null;
	attributes?: Record<string, string | number | boolean>;
	createdAt: string;
	shopId?: string | null;
	shopHandle?: string | null;
	shopName?: string | null;
	shopLevel?: number | null;
	priceMax?: number | null;
	available?: number | null;
}

/**
 * Listing hit with the isBoosted flag added by the mobile app.
 * Use this after mapping the hits array.
 */
export interface ListingHitMapped extends ListingHit {
	isBoosted: boolean;
}

/**
 * Response from GET /api/public/search
 * Returns { hits, total, limit, offset } — NOT { docs, totalDocs }
 *
 * Sort param values: "newest" | "oldest" | "price_asc" | "price_desc"
 * (NOT "-createdAt", "price", "-price")
 */
export interface SearchResponse {
	hits: ListingHit[];
	total: number;
	limit: number;
	offset: number;
}

/** Response from GET /api/public/similar?id=...&limit=... */
export interface SimilarResponse {
	hits: ListingHit[];
	total: number;
	limit: number;
}

/**
 * Full listing document from GET /api/listings/:id?depth=1
 * Payload standard single-doc response: { doc: ListingDoc }
 * Includes all fields, with relations populated at depth=1.
 */
export interface ListingDoc extends ListingHit {
	category?: Category | string | null;
	seller?: UserDoc | string | null;
	expiresAt?: string | null;
	views?: number;
	rejectionReason?: string | null;
	coordinates?: { lat?: number | null; lng?: number | null };
	updatedAt: string;
	shop?: ListingShopRef | string | null;
	// A relationship id at shallow depth, populated to `ProductDoc` at
	// `depth=2` (the listing detail fetch uses it) since `Products.read`
	// allows an anonymous read of an active product.
	product?: ProductDoc | { id: string } | string | null;
	productSummary?: ProductSummary | null;
	/** Virtual, derived by the API at read time (`lib/orderable.ts`); absent from older reads. */
	orderable?: boolean | null;
}

/** Payload single-document response wrapper */
export interface PayloadDoc<T> {
	doc: T;
	message?: string;
}

// ─── Search Parameters ────────────────────────────────────────────────────────

export type SearchSortKey = "newest" | "oldest" | "price_asc" | "price_desc";

/** Query parameters accepted by GET /api/public/search */
export interface SearchQueryParams {
	q?: string;
	category?: string;
	minPrice?: number;
	maxPrice?: number;
	location?: string;
	lat?: number;
	lng?: number;
	radius?: number;
	limit?: number;
	offset?: number;
	sort?: SearchSortKey;
	condition?: ListingCondition;
	/** Dynamic attribute filters — key format: attr_{slug} */
	[key: string]: string | number | undefined;
}

// ─── Favorites ────────────────────────────────────────────────────────────────

/** Favorite document from GET /api/favorites?depth=1 */
export interface Favorite {
	id: string;
	user: string | UserDoc;
	listing: string | ListingDoc;
	createdAt: string;
	updatedAt: string;
}

// ─── Conversations & Messages ─────────────────────────────────────────────────

/** The shop side of a conversation, populated at depth ≥ 1 — never the full `MyShop`/`PublicShop` shape, just what the header needs. */
export interface ConversationShop {
	id: string;
	name: string;
	logo?: Media | null;
}

/**
 * Conversation document from GET /api/conversations. `shop` and `buyer` are
 * set only for a shop conversation (`Conversations.beforeChange` on the
 * API) — both are absent on a classic buyer/seller thread.
 */
export interface Conversation {
	id: string;
	participants: Array<string | UserDoc>;
	listing?: string | ListingDoc | null;
	lastMessage?: string | Message | null;
	shop?: string | ConversationShop | null;
	buyer?: string | UserDoc | null;
	updatedAt: string;
	createdAt: string;
}

/** Message document from GET /api/messages */
export interface Message {
	id: string;
	conversation: string | Conversation;
	sender: string | UserDoc;
	content: string;
	read: boolean;
	/** Which side of a shop conversation sent it — null on a classic thread. */
	senderSide?: "buyer" | "shop" | null;
	/** Set when the sender has since left the shop — `messageAuthorLabel` reads this, never a re-derived "ex-member" guess. */
	formerMemberAuthor?: boolean;
	createdAt: string;
	updatedAt: string;
}

/**
 * Response from GET /api/public/messages/unread and from
 * GET /api/public/novu/notifications/unread-count — both return the same shape.
 */
export interface UnreadCountResponse {
	count: number;
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

/** Review document from GET /api/reviews */
export interface Review {
	id: string;
	reviewer: string | UserDoc;
	reviewedUser: string | UserDoc;
	listing?: string | ListingDoc | null;
	/** Integer 1–5 */
	rating: number;
	comment?: string | null;
	createdAt: string;
	updatedAt: string;
}

// ─── Saved Searches ───────────────────────────────────────────────────────────

/** Saved search document from GET /api/saved-searches */
export interface SavedSearch {
	id: string;
	user: string | UserDoc;
	name: string;
	query?: string | null;
	filters?: Record<string, unknown> | null;
	/** Full URL to reproduce the search */
	url: string;
	alertEnabled: boolean;
	lastCheckedAt?: string | null;
	createdAt: string;
	updatedAt: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

/** Single notification from GET /api/public/novu/notifications */
export interface AppNotification {
	id: string;
	content: string;
	seen: boolean;
	read: boolean;
	createdAt: string;
	type: string;
	workflowName: string;
	payload: Record<string, unknown>;
}

/** Response from GET /api/public/novu/notifications */
export interface NotificationsResponse {
	notifications: AppNotification[];
	totalCount: number;
	unreadCount: number;
	page: number;
	pageSize: number;
}

// ─── Boost Payments ───────────────────────────────────────────────────────────

export type BoostDuration = "7" | "14" | "30";
export type BoostStatus = "pending" | "completed" | "failed" | "refunded";

/** Boost payment document from GET /api/boost-payments */
export interface BoostPayment {
	id: string;
	listing: string | ListingDoc;
	user: string | UserDoc;
	amount: number;
	/** Duration in days */
	duration: BoostDuration;
	status: BoostStatus;
	paymentProvider: "notchpay";
	paymentReference?: string | null;
	paymentUrl?: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Response from POST /api/public/boost
 * Body: { listingId: string; duration: BoostDuration }
 * Pricing: "7" = 500 XAF, "14" = 900 XAF, "30" = 1500 XAF
 */
export interface BoostCreateResponse {
	paymentId: string;
	paymentUrl: string;
	paymentReference: string;
}

// ─── Moderation ───────────────────────────────────────────────────────────────

export type SuspensionReason =
	| "spam"
	| "inappropriate"
	| "fraud"
	| "prohibited"
	| "harassment"
	| "other";

export interface SuspensionSummary {
	active: boolean;
	expired: boolean;
	indefinite: boolean;
	since: string | null;
	until: string | null;
}

export interface ModerationSummary {
	pendingListings: number;
	pendingReports: number;
	pendingVerifications: number;
	total: number;
}

export type ModerationActionName =
	| "listing.approve"
	| "listing.reject"
	| "listing.takedown"
	| "listing.holdRelease"
	| "user.suspend"
	| "user.unsuspend"
	| "report.resolve"
	| "report.dismiss"
	| "shop.suspend"
	| "shop.unsuspend";

export interface ModerationLogEntry {
	id: string;
	actor: UserDoc | string;
	actorRole: string;
	action: ModerationActionName;
	targetType: "listing" | "user" | "report" | "shop";
	targetId: string;
	reason?: string | null;
	note?: string | null;
	metadata?: Record<string, unknown> | null;
	createdAt: string;
}

export type ReportReason = SuspensionReason;

export interface ReportDoc {
	id: string;
	reporter: UserDoc | string;
	targetType: "listing" | "user" | "message" | "shop";
	targetId: string;
	reason: ReportReason;
	description?: string | null;
	status: "pending" | "reviewed" | "resolved";
	resolution?: string | null;
	resolvedBy?: UserDoc | string | null;
	createdAt: string;
}

/** GET /api/moderation/users/:id */
export interface ModerationUserSheet {
	user: Pick<
		UserDoc,
		"id" | "name" | "email" | "role" | "avatar" | "createdAt"
	> & {
		/** Set once the owner's identity (level 2) is approved; cleared on revoke. */
		identityVerifiedAt: string | null;
	};
	/**
	 * The badge of the shop this account currently owns, read the same way
	 * every other surface reads it (`shopCapabilities(shop).badge`) — never
	 * derived here from `identityVerifiedAt` alone, since a badge also
	 * requires an active shop.
	 */
	shopBadge: "phone" | "identity" | "business" | null;
	suspension: SuspensionSummary & {
		reason: SuspensionReason | null;
		note: string | null;
		by: UserDoc | string | null;
	};
	counts: {
		publishedListings: number;
		pendingListings: number;
		reportsAgainst: number;
	};
	history: ModerationLogEntry[];
}

// ─── Shops, products, stock (P1) ─────────────────────────────────────────────

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
export type ManualMovementType = "receipt" | "adjustment" | "loss" | "return";

/**
 * The `legal` group as declared by the shop (below level 3) or reviewed and
 * pinned by a reviewer (at level 3) — mirrors `PublicShopLegal` in
 * `packages/api/src/lib/publicShop.ts`. `verifiedAt` ships for
 * record-keeping only: whether the block is "declared" or "verified" is
 * `PublicShop.legalVerified`, the server's own capability — never derived
 * from this field being set.
 */
export interface ShopLegal {
	businessType: BusinessType | null;
	legalName: string | null;
	rccmNumber: string | null;
	niu: string | null;
	verifiedAt: string | null;
}

/** GET /api/public/shops/:handle → `{ shop }` */
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
	/** Server-computed, expiry-aware — never re-derived from `level` with `badgeForLevel`. */
	badge: BadgeLevel | null;
	/**
	 * The capability itself, read the same way `badge` is — never inferred
	 * from `legal.verifiedAt`, which is a row that can outlive the level that
	 * earned it until the server's next recompute clears it.
	 */
	legalVerified: boolean;
	legal: ShopLegal | null;
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

export type PublicShopResponse = { shop: PublicShop } | { redirectTo: string };

export interface MyShop extends PublicShop {
	status: ShopStatus;
	handleChangedAt: string | null;
	nextHandleChangeAt: string | null;
	/** Absent from the public shape — a visitor reads only `level` and `badge`. */
	capabilities: ShopCapabilities;
	suspension: {
		active: boolean;
		indefinite: boolean;
		until: string | null;
		reason: SuspensionReason | null;
	} | null;
}

/**
 * Why `role` is null even though `shop` is not — an active membership with
 * no usable role, mirroring `resolveShopRole`'s non-owner conditions:
 * `shopSuspended` (the shop itself), `dormant` (its level dropped below 2),
 * `accountSuspended` (the caller's own account). Never set alongside a
 * non-null `role`.
 */
export type MyShopRoleReason = "shopSuspended" | "dormant" | "accountSuspended";

/** GET /api/shops/mine */
export interface MyShopResponse {
	shop: MyShop | null;
	role: ShopRole | null;
	roleReason: MyShopRoleReason | null;
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
	/** Server-computed, expiry-aware — never re-derived from `level` with `badgeForLevel`. */
	badge: BadgeLevel | null;
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
	listingStatus: ListingStatus | null;
	updatedAt: string;
}

export type CatalogueFilter = "all" | "low" | "draft" | "out";

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
	/** Absent for a role that cannot manage the shop — the API redacts the key, not just the value. */
	cost?: number | null;
	trackInventory: boolean;
	stockOnHand: number;
	stockReserved: number;
	lowStockThreshold?: number | null;
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

export interface ProductDoc {
	id: string;
	shop: string | { id: string; handle?: string; name?: string };
	title: string;
	description?: string | null;
	category: Category | string;
	condition?: ListingCondition | null;
	attributes?: Record<string, string | number | boolean> | null;
	images?: { id?: string; image: Media | string }[];
	status: ProductStatus;
	options?: { name: string; values: string[] }[];
	delivery?: {
		handlingHours?: number | null;
		weightGrams?: number | null;
		codAllowed?: boolean | null;
		pickupAllowed?: boolean | null;
	} | null;
	returnPolicy?: string | null;
	listing?: string | { id: string } | null;
	updatedAt: string;
	createdAt: string;
}

export interface ProductInput {
	title: string;
	description?: string | null;
	category: string;
	condition?: ListingCondition | null;
	attributes?: Record<string, unknown>;
	images?: string[];
	status: ProductStatus;
	options?: { name: string; values: string[] }[];
	variants: {
		id?: string;
		optionValues: Record<string, string>;
		sku?: string | null;
		price: number;
		cost?: number | null;
		trackInventory?: boolean;
		lowStockThreshold?: number | null;
		initialStock?: number;
	}[];
	delivery?: {
		handlingHours?: number | null;
		weightGrams?: number | null;
		codAllowed?: boolean;
		pickupAllowed?: boolean;
	};
	returnPolicy?: string | null;
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

export interface MovementsPage {
	docs: MovementRow[];
	totalDocs: number;
	page: number;
	totalPages: number;
	hasNextPage: boolean;
}

/** GET /api/products/:id/detail */
export interface ProductDetailResponse {
	product: ProductDoc;
	variants: VariantDoc[];
	listing: {
		id: string;
		status: ListingStatus;
		views: number;
		favorites: number;
	} | null;
	movements: MovementRow[];
	role: ShopRole;
}

export interface ProductWriteResponse {
	product: ProductDoc;
	variants: VariantDoc[];
}

export interface VariantAlert {
	variantId: string;
	productId: string;
	productTitle: string;
	label: string;
	available: number;
	threshold: number | null;
}

export interface StockSummary {
	costValue: number;
	unitsOnHand: number;
	unitsReserved: number;
	trackedVariants: number;
	lowStock: VariantAlert[];
	outOfStock: VariantAlert[];
}

export interface MovementResponse {
	movement: MovementRow;
	variant: VariantDoc;
}

export interface AttachResponse {
	attached: { listingId: string; productId: string }[];
	skipped: {
		listingId: string;
		reason: "notOwner" | "otherShop" | "alreadyAttached" | "status";
	}[];
}

/** `listing.shop` populated at depth ≥ 1. */
export interface ListingShopRef {
	id: string;
	handle: string;
	name: string;
	level: number;
	status?: ShopStatus;
	logo?: Media | string | null;
	publishedListingCount?: number;
	/** Set while commission arrears pause the shop's orders. */
	ordersRestrictedAt?: string | null;
}

/** Service-written on product-backed listings. */
export interface ProductSummary {
	priceMin: number | null;
	priceMax: number | null;
	available: boolean | null;
	variantCount: number;
	trackInventory: boolean;
}

/** GET /api/moderation/shops/:id */
export interface ModerationShopSheet {
	shop: {
		id: string;
		handle: string;
		name: string;
		status: ShopStatus;
		level: number;
		logo: MediaRef | null;
		createdAt: string;
	};
	owner: {
		id: string;
		name: string;
		email: string;
		role: UserRole;
		createdAt: string;
	};
	suspension: SuspensionSummary & {
		reason: SuspensionReason | null;
		note: string | null;
		by: UserDoc | string | null;
	};
	counts: {
		publishedListings: number;
		activeProducts: number;
		draftProducts: number;
		reportsAgainst: number;
	};
	reports: ReportDoc[];
	history: ModerationLogEntry[];
	/** Active members only — a revoked one has left the team. */
	team: ModerationShopTeamMember[];
	/** The shop's last 20 activity entries, newest first. `metadata` is
	 * stripped (`null`) on `variant.cost_changed`: a moderator has no business
	 * reading a shop's margins. */
	activity: ShopActivityView[];
}

/** A row of `ModerationShopSheet.team`. No `inboxNotifications` or
 * `revokedBy`: Task 5 made those readable only to the member and to
 * managers, neither of which a moderator is. */
export interface ModerationShopTeamMember {
	id: string;
	name: string | null;
	role: ShopRole;
	joinedAt: string | null;
}

// ─── Verification (P2) ────────────────────────────────────────────────────────

/** Mirrors `shopCapabilities()`'s badge on the API — never re-derived from a raw level number except through `badgeForLevel`. */
export type BadgeLevel = "phone" | "identity" | "business";

/** Mirrors `ShopCapabilities` (`lib/shopCapabilities.ts`) — the single reader of what a shop's level unlocks. */
export interface ShopCapabilities {
	effectiveLevel: 0 | 1 | 2 | 3;
	badge: BadgeLevel | null;
	codOrders: boolean;
	protectedPayment: boolean;
	teamMembers: boolean;
	maxMembers: number;
	supplier: boolean;
	fasterPayouts: boolean;
	legalInfoVerified: boolean;
}

export type VerificationStatus =
	| "draft"
	| "submitted"
	| "in_review"
	| "needs_info"
	| "approved"
	| "rejected"
	| "revoked"
	| "expired";

export type VerificationTransitionSource =
	| "seller"
	| "reviewer"
	| "vendor"
	| "system";

export type BusinessType =
	| "entreprenant"
	| "sole_trader"
	| "company"
	| "cooperative";

export type VerificationDocumentKind =
	| "rccm_extract"
	| "entreprenant_declaration"
	| "niu_certificate"
	| "legal_representative_id"
	| "mandate"
	| "other";

export type ReviewSignalCode =
	| "identity_reused"
	| "name_mismatch"
	| "underage"
	| "kyc_declined"
	| "kyc_review"
	| "document_reused"
	| "rccm_reused"
	| "niu_reused"
	| "niu_format";

/** The owner's view of a request (`toOwnerRequest` on the API). Reviewer-only fields are absent, not null. */
export interface OwnerVerificationRequest {
	id: string;
	requestedLevel: 2 | 3;
	status: VerificationStatus;
	consent: { acceptedAt: string; version: string; locale: "fr" | "en" } | null;
	kyc: {
		status:
			| "not_started"
			| "pending"
			| "approved"
			| "declined"
			| "review"
			| "abandoned"
			| "error";
		attempts: number;
		documentType: "national_id" | "passport" | "residence_permit" | null;
		documentCountry: string | null;
		documentNumberLast4: string | null;
		documentExpiresAt: string | null;
		givenNames: string | null;
		familyName: string | null;
		livenessPassed: boolean;
	} | null;
	business: {
		businessType: BusinessType | null;
		legalName: string | null;
		tradeName: string | null;
		rccmNumber: string | null;
		entreprenantDeclarationNumber: string | null;
		niu: string | null;
		registeredAddress: string | null;
		city: string | null;
		legalRepresentativeName: string | null;
		legalRepresentativeIsOwner: boolean;
	} | null;
	documents: {
		id: string;
		kind: VerificationDocumentKind;
		originalFilename: string;
		mimeType: string;
		filesize: number;
		createdAt: string;
	}[];
	infoRequests: {
		reasonCode: string;
		message: string;
		requestedAt: string;
		respondedAt: string | null;
	}[];
	decision: {
		decidedAt: string;
		reasonCode: string | null;
		sellerMessage: string | null;
	} | null;
	statusHistory: {
		status: VerificationStatus;
		at: string;
		source: VerificationTransitionSource;
	}[];
	submittedAt: string | null;
	approvedAt: string | null;
	expiresAt: string | null;
}

/** GET /api/shops/:id/verification */
export interface ShopVerificationResponse {
	enabled: boolean;
	capabilities: ShopCapabilities;
	levelExpiresAt: string | null;
	consentVersion: string | null;
	requests: {
		level2: OwnerVerificationRequest | null;
		level3: OwnerVerificationRequest | null;
	};
	renewableFrom: { level2: string | null; level3: string | null };
	nextLevel: {
		level: 2 | 3;
		unlocks: Array<keyof ShopCapabilities>;
		eligible: boolean;
	} | null;
	cooldownUntil: string | null;
}

export type ModerationVerificationQueue =
	| "to_review"
	| "mine"
	| "needs_info"
	| "decided";

/** GET /api/moderation/verification — one queue row. */
export interface ModerationVerificationQueueItem {
	id: string;
	shopId: string | null;
	requestedLevel: 2 | 3;
	status: VerificationStatus;
	submittedAt: string | null;
	ageMs: number | null;
	signals: ReviewSignalCode[];
	assignee: string | null;
}

/** GET /api/moderation/verification */
export interface ModerationVerificationQueueResponse {
	queue: ModerationVerificationQueue;
	total: number;
	items: ModerationVerificationQueueItem[];
}

/**
 * The capability flags a reviewer screen renders its actions from — read as
 * the authority, never re-derived client-side from whether `assignee` or any
 * other field happens to be set.
 */
export interface VerificationReviewerViewer {
	canClaim: boolean;
	canDecide: boolean;
	/** Revoking an approved request: conflict-of-interest and rank, never assignee — an approved request's assignee is always null. */
	canRevoke: boolean;
	isAssignee: boolean;
	isAdmin: boolean;
	conflictOfInterest: boolean;
}

/** GET /api/moderation/verification/:id */
export interface ModerationVerificationDetail {
	request: {
		id: string;
		shop: string | null;
		requestedLevel: 2 | 3;
		status: VerificationStatus;
		statusHistory: OwnerVerificationRequest["statusHistory"];
		consent: OwnerVerificationRequest["consent"];
		kyc:
			| (Omit<NonNullable<OwnerVerificationRequest["kyc"]>, "status"> & {
					provider: "didit" | "smileid" | null;
					status:
						| "not_started"
						| "pending"
						| "approved"
						| "declined"
						| "review"
						| "abandoned"
						| "error";
					sessionRef: string | null;
					decidedAt: string | null;
					documentNumberHash: string | null;
					adult: boolean;
					faceMatchScore: number | null;
					vendorWarnings: unknown;
					vendorReviewUrl: string | null;
					vendorDataDeletedAt: string | null;
			  })
			| null;
		business: OwnerVerificationRequest["business"];
		reviewSignals: {
			code: ReviewSignalCode;
			detail: string | null;
			relatedRequest: string | null;
		}[];
		assignee: string | null;
		claimedAt: string | null;
		infoRequests: OwnerVerificationRequest["infoRequests"];
		decision: {
			decidedBy: string | null;
			decidedAt: string | null;
			reasonCode: string | null;
			sellerMessage: string | null;
			internalNote: string | null;
			checklist: Record<string, boolean> | null;
		} | null;
		submittedAt: string | null;
		approvedAt: string | null;
		expiresAt: string | null;
		revokedAt: string | null;
		documents: {
			id: string;
			kind: VerificationDocumentKind | null;
			originalFilename: string | null;
			sha256: string | null;
			uploadedBy: string | null;
			duplicateOf: (string | null)[];
			purgedAt: string | null;
		}[];
	};
	shop: {
		id: string;
		handle: string;
		name: string;
		status: ShopStatus;
		level: number | null;
	};
	owner: {
		id: string;
		name: string | null;
		email: string;
		role: UserRole;
		identityVerifiedAt: string | null;
	} | null;
	otherRequests: {
		id: string;
		requestedLevel: 2 | 3;
		status: VerificationStatus;
		submittedAt: string | null;
	}[];
	log: ModerationLogEntry[];
	viewer: VerificationReviewerViewer;
}

/** POST /api/moderation/verification/documents/:docId/view — a 60-second, logged signed URL. */
export interface SignedDocumentUrl {
	url: string;
	expiresAt: string;
	mimeType: string;
}

// ─── Team, invitations, activity log, inbox (P3) ────────────────────────────

/** `ShopMember.inboxNotifications` — mirrors `INBOX_NOTIFICATION_PREFERENCES`. */
export type InboxNotificationPreference = "all" | "assigned" | "none";

/** A row of `GET /api/shops/:id/members` → `TeamView.members`. */
export interface TeamMemberView {
	id: string;
	userId: string;
	name: string | null;
	avatarUrl: string | null;
	role: ShopRole;
	joinedAt: string | null;
	suspended: boolean;
	/** Absent for a peer's row a staff member cannot see the preference of. */
	inboxNotifications?: InboxNotificationPreference;
}

/** A row of `GET /api/shops/:id/members` → `TeamView.invitations`. */
export interface PendingInvitationView {
	id: string;
	role: "manager" | "staff";
	channel: "phone" | "email";
	maskedTarget: string;
	expiresAt: string;
	sendCount: number;
	lastSentAt: string | null;
	invitedByName: string | null;
}

/** GET /api/shops/:id/members */
export interface TeamView {
	members: TeamMemberView[];
	invitations: PendingInvitationView[];
	activeCount: number;
	maxMembers: number;
	teamMembers: boolean;
}

/** GET /api/public/invitations/:token — nothing beyond this shape is returned. */
export interface PublicInvitationView {
	shop: {
		name: string;
		handle: string;
		logoUrl: string | null;
		badge: BadgeLevel | null;
	};
	role: "manager" | "staff";
	channel: "phone" | "email";
	maskedTarget: string;
	inviterFirstName: string | null;
	expiresAt: string;
	status: "pending" | "accepted" | "declined" | "revoked" | "expired";
}

/** Mirrors `SHOP_ACTIVITY_ACTIONS` in `packages/api/src/collections/ShopActivityLog.ts`. */
export type ShopActivityAction =
	| "member.invited"
	| "member.invitation_resent"
	| "member.invitation_revoked"
	| "member.joined"
	| "member.role_changed"
	| "member.removed"
	| "member.left"
	| "member.paused"
	| "member.resumed"
	| "product.created"
	| "product.updated"
	| "product.published"
	| "product.archived"
	| "variant.price_changed"
	| "variant.cost_changed"
	| "stock.moved"
	| "listing.attached"
	| "listing.detached"
	| "shop.updated"
	| "shop.handle_changed"
	| "shop.closed"
	| "conversation.assigned"
	| "conversation.status_changed"
	| "verification.submitted";

/** Mirrors `SHOP_ACTIVITY_TARGET_TYPES` in `packages/api/src/collections/ShopActivityLog.ts`. */
export type ShopActivityTargetType =
	| "shop"
	| "member"
	| "invitation"
	| "product"
	| "variant"
	| "listing"
	| "conversation"
	| "verification-request";

/** A row of `GET /api/shops/:id/activity`, 50 per page, keyset-paginated on `createdAt`. */
export interface ShopActivityView {
	id: string;
	createdAt: string;
	actor: { id: string; name: string | null } | null;
	actorRole: "owner" | "manager" | "staff" | "system";
	action: ShopActivityAction;
	targetType: ShopActivityTargetType;
	targetId: string;
	metadata: Record<string, unknown> | null;
}

export const INBOX_FILTERS = [
	"all",
	"unassigned",
	"mine",
	"unread",
	"awaiting",
	"done",
] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number];

/** A row of `GET /api/shops/:id/inbox`. */
export interface InboxConversationView {
	id: string;
	buyer: { id: string; name: string | null; avatarUrl: string | null } | null;
	listing: { id: string; title: string; thumbnailUrl: string | null } | null;
	lastMessage: {
		preview: string;
		at: string;
		side: "buyer" | "shop";
	} | null;
	assignee: {
		id: string;
		name: string | null;
		avatarUrl: string | null;
		suspended: boolean;
	} | null;
	inboxStatus: "open" | "done";
	awaitingReply: boolean;
	unreadCount: number;
}

/** GET /api/shops/:id/inbox */
export interface InboxPage {
	docs: InboxConversationView[];
	nextCursor: string | null;
	totals: Record<InboxFilter, number>;
}

/** GET /api/me/shops */
export interface MyShopsEntry {
	shopId: string;
	name: string;
	handle: string;
	logoUrl: string | null;
	role: ShopRole;
	capabilities: ShopCapabilities;
	inboxUnread: number;
}
