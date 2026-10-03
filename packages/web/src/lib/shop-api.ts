import type {
	AttachResult,
	CatalogueResponse,
	ClientMovementType,
	HandleAvailability,
	InboxConversationView,
	InboxFilter,
	InboxNotificationPreference,
	InboxPage,
	Listing,
	MovementPage,
	MovementRow,
	MyShopResponse,
	MyShopsEntry,
	PendingInvitationView,
	ProductDetailResponse,
	ProductInput,
	ProductSaveResponse,
	PublicInvitationView,
	PublicShop,
	PublicVariantDoc,
	ShopActivityView,
	ShopRole,
	ShopSearchResponse,
	StockCountResult,
	StockSummary,
	TeamMemberView,
	TeamView,
	VariantDoc,
} from "~/types";
import { ApiError, apiErrorFrom, ERROR_CODES, fallbackFor } from "./apiError";
import type { BusinessType } from "./verification";

/**
 * Transport for the shop routes. It only speaks HTTP and throws `ApiError`;
 * caching, retries and loading state belong to the TanStack Query hooks that
 * call it.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	let response: Response;
	try {
		response = await fetch(path, {
			...init,
			credentials: "include",
			headers: {
				...(init.body instanceof FormData
					? {}
					: { "Content-Type": "application/json" }),
				...init.headers,
			},
		});
	} catch {
		throw new ApiError(
			fallbackFor(ERROR_CODES.network),
			0,
			ERROR_CODES.network,
		);
	}
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw apiErrorFrom(response.status, body);
	return body as T;
}

/**
 * Generic transport, exported for resource hooks that do not otherwise fit
 * `shopApi`'s per-endpoint methods (verification and moderation-verification
 * both span several route families under `/api/shops`, `/api/verification-
 * requests` and `/api/moderation/verification`). Same error handling as every
 * `shopApi` call: a network failure and a non-OK response both throw
 * `ApiError`.
 */
export function apiGet<T>(path: string): Promise<T> {
	return request<T>(path);
}

/**
 * `headers` is for the rare route that needs one beyond `Content-Type`
 * (payment-intent creation's `Idempotency-Key`); every other caller omits it.
 */
export function apiPost<T>(
	path: string,
	body?: unknown,
	headers?: HeadersInit,
): Promise<T> {
	return request<T>(path, {
		method: "POST",
		body: body === undefined ? undefined : JSON.stringify(body),
		headers,
	});
}

export function apiPostForm<T>(path: string, form: FormData): Promise<T> {
	return request<T>(path, { method: "POST", body: form });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
	return request<T>(path, {
		method: "PATCH",
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

export function apiDelete<T>(path: string): Promise<T> {
	return request<T>(path, { method: "DELETE" });
}

export function query(
	params: Record<string, string | number | undefined | null>,
) {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== "") {
			search.set(key, String(value));
		}
	}
	const text = search.toString();
	return text ? `?${text}` : "";
}

export interface CreateShopInput {
	handle: string;
	name: string;
	description?: string;
	city?: string;
	categories?: string[];
}

export interface ShopUpdateInput {
	name?: string;
	description?: string | null;
	logo?: string | null;
	banner?: string | null;
	contact?: {
		phone?: string | null;
		whatsapp?: string | null;
		email?: string | null;
	};
	location?: {
		city?: string | null;
		region?: string | null;
		country?: string | null;
		countryCode?: string | null;
	};
	categories?: string[];
	/**
	 * Owner-editable while `capabilities.effectiveLevel < 3`; the server
	 * freezes it once level 3 is effective (`Shops.ts`'s `beforeChange` hook),
	 * so a PATCH here is silently ignored at that point rather than rejected.
	 * `verifiedAt` is never client-writable — it is not part of this shape.
	 */
	legal?: {
		businessType?: BusinessType | null;
		legalName?: string | null;
		rccmNumber?: string | null;
		niu?: string | null;
	};
}

/** A variant read through Payload REST at depth 1, with its product populated. */
export type PopulatedVariant = Omit<VariantDoc, "product"> & {
	product: string | { id: string; title: string };
};

export interface MovementInput {
	type: ClientMovementType;
	quantity: number;
	unitCost?: number;
	note?: string;
}

export const shopApi = {
	mine: () => request<MyShopResponse>("/api/shops/mine"),

	create: (input: CreateShopInput) =>
		request<{ shop: PublicShop }>("/api/shops", {
			method: "POST",
			body: JSON.stringify(input),
		}),

	handleAvailable: (handle: string) =>
		request<HandleAvailability>(
			`/api/public/shops/handle-available${query({ handle })}`,
		),

	update: (shopId: string, input: ShopUpdateInput) =>
		request<{ doc: unknown }>(`/api/shops/${shopId}`, {
			method: "PATCH",
			body: JSON.stringify(input),
		}),

	changeHandle: (shopId: string, handle: string) =>
		request<{ shop: PublicShop; nextHandleChangeAt: string }>(
			`/api/shops/${shopId}/handle`,
			{ method: "POST", body: JSON.stringify({ handle }) },
		),

	close: (shopId: string, confirmation: string) =>
		request<{ closed: true; detachedListingIds: string[] }>(
			`/api/shops/${shopId}/close`,
			{ method: "POST", body: JSON.stringify({ confirmation }) },
		),

	attachListings: (
		shopId: string,
		body: { listingIds?: string[]; all?: boolean },
	) =>
		request<AttachResult>(`/api/shops/${shopId}/listings/attach`, {
			method: "POST",
			body: JSON.stringify(body),
		}),

	detachListings: (shopId: string, listingIds: string[]) =>
		request<{ detached: string[] }>(`/api/shops/${shopId}/listings/detach`, {
			method: "POST",
			body: JSON.stringify({ listingIds }),
		}),

	/** A seller's own listings that a shop can still take in. */
	personalListings: (userId: string) =>
		request<{ docs: Listing[] }>(
			`/api/listings?where[seller][equals]=${userId}&where[shop][exists]=false&where[status][in]=draft,pending,published&depth=1&limit=100&sort=-createdAt`,
		),

	searchShops: (params: {
		q?: string;
		city?: string;
		category?: string;
		minShopLevel?: number;
		limit?: number;
		offset?: number;
	}) => request<ShopSearchResponse>(`/api/public/search/shops${query(params)}`),

	listProducts: (
		shopId: string,
		params: {
			status?: string;
			stock?: "low" | "out";
			q?: string;
			page?: number;
			limit?: number;
		},
	) =>
		request<CatalogueResponse>(`/api/shops/${shopId}/products${query(params)}`),

	createProduct: (shopId: string, input: ProductInput) =>
		request<ProductSaveResponse>(`/api/shops/${shopId}/products`, {
			method: "POST",
			body: JSON.stringify(input),
		}),

	updateProduct: (productId: string, input: ProductInput) =>
		request<ProductSaveResponse>(`/api/products/${productId}`, {
			method: "PATCH",
			body: JSON.stringify(input),
		}),

	productDetail: (productId: string) =>
		request<ProductDetailResponse>(`/api/products/${productId}/detail`),

	recordMovement: (variantId: string, input: MovementInput) =>
		request<{ movement: MovementRow; variant: VariantDoc }>(
			`/api/variants/${variantId}/stock-movements`,
			{ method: "POST", body: JSON.stringify(input) },
		),

	listMovements: (
		shopId: string,
		params: {
			variant?: string;
			type?: string;
			from?: string;
			page?: number;
			limit?: number;
		},
	) =>
		request<MovementPage>(
			`/api/shops/${shopId}/stock-movements${query(params)}`,
		),

	stockSummary: (shopId: string) =>
		request<StockSummary>(`/api/shops/${shopId}/stock-summary`),

	stockCounts: (
		shopId: string,
		body: { counts: { variantId: string; counted: number }[]; note?: string },
	) =>
		request<StockCountResult>(`/api/shops/${shopId}/stock-counts`, {
			method: "POST",
			body: JSON.stringify(body),
		}),

	// Archived variants are filtered here, not in the query: a stored `null`
	// does not match `archivedAt[exists]=false` in Mongo.
	shopVariants: (shopId: string) =>
		request<{ docs: PopulatedVariant[] }>(
			`/api/product-variants?where[shop][equals]=${shopId}&limit=0&depth=1`,
		).then((page) => ({
			docs: page.docs.filter((variant) => !variant.archivedAt),
		})),

	variant: (variantId: string) =>
		request<PopulatedVariant>(`/api/product-variants/${variantId}?depth=1`),

	productVariants: (productId: string) =>
		request<{ docs: VariantDoc[] }>(
			`/api/product-variants?where[product][equals]=${productId}&limit=100&depth=0`,
		).then((page) => ({
			docs: page.docs.filter((variant) => !variant.archivedAt),
		})),

	/**
	 * The buyer's view of a product's variants: always live, never a draft or
	 * archived row regardless of who is asking, unlike `productVariants` above
	 * (which a shop member's own draft product legitimately needs to widen for).
	 */
	publicProductVariants: (productId: string) =>
		request<{ docs: PublicVariantDoc[] }>(
			`/api/public/products/${productId}/variants`,
		),

	/** Uploads one image to the media collection and returns its id. */
	uploadMedia: async (file: File, alt: string): Promise<string> => {
		const form = new FormData();
		form.append("file", file);
		form.append("_payload", JSON.stringify({ alt: alt || "image" }));
		const data = await request<{ doc?: { id: string }; id?: string }>(
			"/api/media",
			{ method: "POST", body: form },
		);
		const id = data.doc?.id ?? data.id;
		if (!id) throw apiErrorFrom(500, {});
		return id;
	},

	// --- P3 team, invitations and inbox ---

	listTeam: (shopId: string) =>
		request<TeamView>(`/api/shops/${shopId}/members`),

	invite: (
		shopId: string,
		body: {
			channel: "phone" | "email";
			phone?: string;
			email?: string;
			role: "manager" | "staff";
		},
	) =>
		request<{ invitation: PendingInvitationView; delivered: boolean }>(
			`/api/shops/${shopId}/invitations`,
			{ method: "POST", body: JSON.stringify(body) },
		),

	resendInvitation: (shopId: string, invitationId: string) =>
		request<{ invitation: PendingInvitationView; delivered: boolean }>(
			`/api/shops/${shopId}/invitations/${invitationId}/resend`,
			{ method: "POST" },
		),

	revokeInvitation: (shopId: string, invitationId: string) =>
		request<{ revoked: true }>(
			`/api/shops/${shopId}/invitations/${invitationId}`,
			{ method: "DELETE" },
		),

	changeMemberRole: (
		shopId: string,
		memberId: string,
		role: "manager" | "staff",
	) =>
		request<TeamMemberView>(`/api/shops/${shopId}/members/${memberId}`, {
			method: "PATCH",
			body: JSON.stringify({ role }),
		}),

	removeMember: (shopId: string, memberId: string) =>
		request<{ removed: true }>(`/api/shops/${shopId}/members/${memberId}`, {
			method: "DELETE",
		}),

	leaveShop: (shopId: string) =>
		request<{ left: true }>(`/api/shops/${shopId}/members/leave`, {
			method: "POST",
		}),

	updateInboxPreference: (
		shopId: string,
		inboxNotifications: InboxNotificationPreference,
	) =>
		request<TeamMemberView>(`/api/shops/${shopId}/members/me`, {
			method: "PATCH",
			body: JSON.stringify({ inboxNotifications }),
		}),

	listActivity: (
		shopId: string,
		filters: {
			actor?: string;
			action?: string;
			targetType?: string;
			cursor?: string;
		},
	) =>
		request<{ docs: ShopActivityView[]; nextCursor: string | null }>(
			`/api/shops/${shopId}/activity${query(filters)}`,
		),

	listInbox: (
		shopId: string,
		filters: { filter?: InboxFilter; q?: string; cursor?: string },
	) => request<InboxPage>(`/api/shops/${shopId}/inbox${query(filters)}`),

	assignConversation: (conversationId: string, userId: string | null) =>
		request<InboxConversationView>(
			`/api/conversations/${conversationId}/assign`,
			{
				method: "POST",
				body: JSON.stringify({ userId }),
			},
		),

	setConversationStatus: (conversationId: string, status: "open" | "done") =>
		request<InboxConversationView>(
			`/api/conversations/${conversationId}/status`,
			{
				method: "POST",
				body: JSON.stringify({ status }),
			},
		),

	markConversationRead: (conversationId: string, lastMessageId: string) =>
		request<{ lastReadAt: string; unreadCount: number }>(
			`/api/conversations/${conversationId}/read`,
			{ method: "POST", body: JSON.stringify({ lastMessageId }) },
		),

	startConversation: (listingId: string) =>
		request<{ conversationId: string; created: boolean }>(
			"/api/conversations/start",
			{ method: "POST", body: JSON.stringify({ listingId }) },
		),

	listMyShops: () => request<MyShopsEntry[]>("/api/me/shops"),

	lookupInvitation: (token: string) =>
		request<PublicInvitationView>(
			`/api/public/invitations/${encodeURIComponent(token)}`,
		),

	acceptInvitation: (token: string) =>
		request<{ shopId: string; role: ShopRole }>(
			`/api/invitations/${encodeURIComponent(token)}/accept`,
			{ method: "POST" },
		),

	declineInvitation: (token: string) =>
		request<{ declined: true }>(
			`/api/invitations/${encodeURIComponent(token)}/decline`,
			{ method: "POST" },
		),
};
