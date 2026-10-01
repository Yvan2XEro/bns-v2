import type {
	BusinessType,
	ShopCapabilities,
	VerificationBadge,
} from "~/lib/verification";
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

/**
 * The `legal` group as the shop declared it (below level 3) or as a
 * reviewer pinned it (at level 3) — mirrors `PublicShopLegal` in
 * `packages/api/src/lib/publicShop.ts`. `verifiedAt` ships for record-keeping
 * only: whether the block is "declared" or "verified" is
 * `PublicShop.legalVerified`, the server's own capability — a client never
 * derives it from this field being set.
 */
export interface ShopLegal {
	businessType: BusinessType | null;
	legalName: string | null;
	rccmNumber: string | null;
	niu: string | null;
	verifiedAt: string | null;
}

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
	badge: VerificationBadge | null;
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
	badge: VerificationBadge | null;
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
	lowStockThreshold?: number | null;
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

// --- P3 team, invitations and inbox ---
// Mirrors the server views in `packages/api/src/services/shopMembers.ts`,
// `shopActivity.ts` and `inbox.ts`. Shapes are transcribed, not reinvented.

export type InboxNotificationPreference = "all" | "assigned" | "none";

export interface TeamMemberView {
	id: string;
	userId: string;
	name: string | null;
	avatarUrl: string | null;
	role: ShopRole;
	joinedAt: string | null;
	suspended: boolean;
	inboxNotifications?: InboxNotificationPreference;
}

/** The invitation's target arrives already masked by the server. */
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

export interface TeamView {
	members: TeamMemberView[];
	invitations: PendingInvitationView[];
	activeCount: number;
	maxMembers: number;
	teamMembers: boolean;
}

export interface PublicInvitationView {
	shop: {
		name: string;
		handle: string;
		logoUrl: string | null;
		badge: VerificationBadge | null;
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

/** Mirrors `SHOP_ACTIVITY_TARGET_TYPES` in the same file. */
export type ShopActivityTargetType =
	| "shop"
	| "member"
	| "invitation"
	| "product"
	| "variant"
	| "listing"
	| "conversation"
	| "verification-request";

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

export type InboxFilter =
	| "all"
	| "unassigned"
	| "mine"
	| "unread"
	| "awaiting"
	| "done";

export interface InboxConversationView {
	id: string;
	buyer: { id: string; name: string | null; avatarUrl: string | null } | null;
	listing: { id: string; title: string; thumbnailUrl: string | null } | null;
	lastMessage: { preview: string; at: string; side: "buyer" | "shop" } | null;
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

export interface InboxPage {
	docs: InboxConversationView[];
	nextCursor: string | null;
	totals: Record<InboxFilter, number>;
}

export interface MyShopsEntry {
	shopId: string;
	name: string;
	handle: string;
	logoUrl: string | null;
	role: ShopRole;
	capabilities: ShopCapabilities;
	inboxUnread: number;
}
