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
	location?: string | null;
	verified: boolean;
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

/** Dynamic filterable attribute defined on a category. */
export interface CategoryAttribute {
	id?: string;
	name: string;
	slug: string;
	type: "text" | "number" | "select" | "boolean" | "date";
	required?: boolean;
	filterable?: boolean;
	/** Only present when type === "select" */
	options?: string[];
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
	price: number;
	location: string;
	images?: ListingImageItem[];
	status: ListingStatus;
	condition?: ListingCondition;
	/** ISO date — if set and > now, listing is actively boosted */
	boostedUntil?: string | null;
	attributes?: Record<string, string | number | boolean>;
	createdAt: string;
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

/** Conversation document from GET /api/conversations */
export interface Conversation {
	id: string;
	participants: Array<string | UserDoc>;
	listing?: string | ListingDoc | null;
	lastMessage?: string | Message | null;
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
	createdAt: string;
	updatedAt: string;
}

/** Response from GET /api/public/messages/unread */
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
