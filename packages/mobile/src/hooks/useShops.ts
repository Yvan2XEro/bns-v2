import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useAppConfig } from "../contexts/AppConfigContext";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type {
	AttachResponse,
	BusinessType,
	CatalogueFilter,
	CatalogueResponse,
	HandleAvailability,
	ListingDoc,
	ManualMovementType,
	MovementResponse,
	MyShopResponse,
	PayloadPage,
	ProductDetailResponse,
	ProductDoc,
	ProductInput,
	ProductWriteResponse,
	PublicShop,
	PublicShopResponse,
	PublicVariantDoc,
	SearchResponse,
	ShopSearchResponse,
	StockSummary,
	VariantDoc,
} from "../types/api";

export const shopKeys = {
	all: ["shops"] as const,
	mine: ["shops", "mine"] as const,
	public: (handle: string) => ["shops", "public", handle] as const,
	byOwner: (userId: string) => ["shops", "by-owner", userId] as const,
	handle: (handle: string) => ["shops", "handle", handle] as const,
	listings: (shopId: string) => ["shops", shopId, "listings"] as const,
	catalogueRoot: (shopId: string) => ["shops", shopId, "catalogue"] as const,
	catalogue: (shopId: string, filter: CatalogueFilter) =>
		["shops", shopId, "catalogue", filter] as const,
	summary: (shopId: string) => ["shops", shopId, "stock-summary"] as const,
	/** Every page and filter of one shop's ledger, so a movement drops them all. */
	movements: (shopId: string) => ["shops", shopId, "stock-movements"] as const,
	/** The shop-level variant list (stock count screens), distinct from `variants(productId)` below. */
	shopVariants: (shopId: string) => ["shops", shopId, "variants"] as const,
	search: (params: Record<string, string>) =>
		["shops", "search", params] as const,
	product: (id: string) => ["products", id, "detail"] as const,
	variants: (productId: string) => ["products", productId, "variants"] as const,
	// Nested under "products", not a "product-variants" root of its own, so
	// `useInvalidateShop`'s prefix invalidation of ["products"] reaches it.
	variant: (variantId: string) => ["products", "variant", variantId] as const,
	// Distinct from `variants(productId)` above: the buyer-facing, public-only
	// view, never the shop member's widened one.
	publicVariants: (productId: string) =>
		["products", productId, "public-variants"] as const,
};

/** A seller's own listings not yet part of any shop, for the "move in" flow. */
export const personalListingsKey = ["my-listings", "personal"] as const;

export function useShopsEnabled(): boolean {
	return useAppConfig().shopsEnabled;
}

/**
 * `shopsEnabled` gates creating a *new* shop, never an existing one — an
 * owner must keep full access with the flag off. This query is therefore
 * never conditioned on the flag, only on being signed in.
 */
export function useMyShop() {
	const { user } = useAuth();
	return useQuery({
		queryKey: shopKeys.mine,
		queryFn: () => api.get<MyShopResponse>("/api/shops/mine"),
		enabled: Boolean(user),
		staleTime: 30_000,
	});
}

export function usePublicShop(handle: string | undefined) {
	return useQuery({
		queryKey: shopKeys.public(handle ?? ""),
		queryFn: () =>
			api.get<PublicShopResponse>(
				`/api/public/shops/${encodeURIComponent(handle ?? "")}`,
			),
		enabled: Boolean(handle),
		retry: (count, error) =>
			!(error instanceof ApiError && error.status === 404) && count < 2,
	});
}

/**
 * The public profile page needs a stranger's shop badge, not just their
 * personal stats — there is no by-owner endpoint, so this looks the shop up
 * by owner (the same anonymous-readable `status: active` filter every other
 * public shop read uses) and then re-fetches it through the public shop
 * route so the badge is the server's computed one, never `badgeForLevel`
 * over a raw `level`. Most profiles own no shop, so this is one request; an
 * owner's profile is two, both cached under the same key.
 */
export function useUserShop(userId: string | undefined) {
	return useQuery({
		queryKey: shopKeys.byOwner(userId ?? ""),
		queryFn: async () => {
			const page = await api.get<PayloadPage<{ handle: string }>>(
				`/api/shops?where[owner][equals]=${encodeURIComponent(userId ?? "")}&where[status][equals]=active&limit=1&depth=0`,
			);
			const handle = page.docs[0]?.handle;
			if (!handle) return null;
			const res = await api.get<PublicShopResponse>(
				`/api/public/shops/${encodeURIComponent(handle)}`,
			);
			return "shop" in res ? res.shop : null;
		},
		enabled: Boolean(userId),
	});
}

export function useShopListings(shopId: string | undefined) {
	return useInfiniteQuery({
		queryKey: shopKeys.listings(shopId ?? ""),
		enabled: Boolean(shopId),
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			api.get<SearchResponse>(
				`/api/public/search?shop=${shopId}&limit=20&offset=${pageParam}`,
			),
		getNextPageParam: (last, pages) => {
			const offset = pages.length * 20;
			return offset < (last?.total ?? 0) ? offset : undefined;
		},
	});
}

/** `handle` must already be normalised and locally valid. */
export function useHandleAvailability(handle: string, enabled: boolean) {
	return useQuery({
		queryKey: shopKeys.handle(handle),
		queryFn: () =>
			api.get<HandleAvailability>(
				`/api/public/shops/handle-available?handle=${encodeURIComponent(handle)}`,
			),
		enabled: enabled && handle.length >= 3,
		staleTime: 30_000,
		retry: false,
	});
}

function useInvalidateShop() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: shopKeys.all });
		queryClient.invalidateQueries({ queryKey: ["products"] });
		queryClient.invalidateQueries({ queryKey: ["my-listings"] });
		queryClient.invalidateQueries({ queryKey: ["listings"] });
	};
}

export function useCreateShop() {
	const invalidate = useInvalidateShop();
	return useMutation({
		mutationFn: (body: {
			handle: string;
			name: string;
			description?: string;
			city?: string;
			categories?: string[];
		}) => api.post<{ shop: PublicShop }>("/api/shops", body),
		onSuccess: invalidate,
	});
}

export interface ShopPatch {
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
	/** Server rejects it silently at level 3 (`Shops.ts`'s `beforeChange`) — the form only mirrors that. */
	legal?: {
		businessType: BusinessType | null;
		legalName: string | null;
		rccmNumber: string | null;
		niu: string | null;
	};
}

export function useUpdateShop(shopId: string | undefined) {
	const invalidate = useInvalidateShop();
	return useMutation({
		mutationFn: (patch: ShopPatch) => api.patch(`/api/shops/${shopId}`, patch),
		onSuccess: invalidate,
	});
}

export function useChangeHandle(shopId: string | undefined) {
	const invalidate = useInvalidateShop();
	return useMutation({
		mutationFn: (handle: string) =>
			api.post<{ shop: PublicShop; nextHandleChangeAt: string }>(
				`/api/shops/${shopId}/handle`,
				{ handle },
			),
		onSuccess: invalidate,
	});
}

/**
 * Beyond the broad `useInvalidateShop()` sweep, closing and attaching are the
 * two writes that touch the shop's variants and its stock ledger without any
 * currently-mounted query key pointing at them by name (no `movements` or
 * `shopVariants` screen consumes those keys yet) — invalidating them here
 * keeps the cache correct the moment such a screen is added, instead of
 * relying on a future author to remember it.
 */
function useInvalidateShopClose(shopId: string | undefined) {
	const queryClient = useQueryClient();
	const invalidate = useInvalidateShop();
	return () => {
		invalidate();
		if (!shopId) return;
		queryClient.invalidateQueries({ queryKey: shopKeys.catalogueRoot(shopId) });
		queryClient.invalidateQueries({ queryKey: shopKeys.summary(shopId) });
		queryClient.invalidateQueries({ queryKey: shopKeys.movements(shopId) });
		queryClient.invalidateQueries({ queryKey: shopKeys.shopVariants(shopId) });
	};
}

/**
 * Owner only; the server enforces it and the UI hides the form for anyone
 * else. Transactional on the server: every listing detaches back to personal
 * and every product archives (`closeShopInTransaction`), so this drops the
 * shop, the catalogue, the personal listings, the stock summary, the
 * movements ledger and the shop's variants — everything a closed shop no
 * longer feeds.
 */
export function useCloseShop(shopId: string | undefined) {
	const invalidate = useInvalidateShopClose(shopId);
	return useMutation({
		mutationFn: (confirmation: string) =>
			api.post<{ closed: true; detachedListingIds: string[] }>(
				`/api/shops/${shopId}/close`,
				{ confirmation },
			),
		onSuccess: invalidate,
	});
}

/**
 * Moves personal listings into the shop, each becoming a single-variant
 * product with one new, untracked variant (`attachOne` on the API). The new
 * variants land in the shop's variant list and stock ledger straight away,
 * so this invalidates the same set as `useCloseShop` — see there for why.
 */
export function useAttachListings(shopId: string | undefined) {
	const invalidate = useInvalidateShopClose(shopId);
	return useMutation({
		mutationFn: (body: { listingIds?: string[]; all?: boolean }) =>
			api.post<AttachResponse>(`/api/shops/${shopId}/listings/attach`, body),
		onSuccess: invalidate,
	});
}

/** A seller's own listings not yet part of any shop, for the "move in" flow. */
export function usePersonalListings(userId: string | undefined) {
	return useQuery({
		queryKey: personalListingsKey,
		queryFn: () =>
			api.get<PayloadPage<ListingDoc>>(
				`/api/listings?where[seller][equals]=${userId}&where[shop][exists]=false&where[status][in]=draft,pending,published&depth=1&limit=100&sort=-createdAt`,
			),
		enabled: Boolean(userId),
	});
}

export function useCatalogue(
	shopId: string | undefined,
	filter: CatalogueFilter,
) {
	const query =
		filter === "low"
			? "stock=low"
			: filter === "out"
				? "stock=out"
				: filter === "draft"
					? "status=draft"
					: "";
	return useQuery({
		queryKey: shopKeys.catalogue(shopId ?? "", filter),
		queryFn: () =>
			api.get<CatalogueResponse>(
				`/api/shops/${shopId}/products?limit=100${query ? `&${query}` : ""}`,
			),
		enabled: Boolean(shopId),
	});
}

export function useProductDetail(productId: string | undefined) {
	return useQuery({
		queryKey: shopKeys.product(productId ?? ""),
		queryFn: () =>
			api.get<ProductDetailResponse>(`/api/products/${productId}/detail`),
		enabled: Boolean(productId) && productId !== "new",
	});
}

/**
 * A shop member's own variant list (stock picker, product editor): the raw
 * collection, which legitimately widens to include the member's own draft
 * and archived rows. `cost` is stripped for a role that cannot manage the
 * shop, but the exact stock counts are still present.
 */
export function useProductVariants(productId: string | undefined) {
	return useQuery({
		queryKey: shopKeys.variants(productId ?? ""),
		queryFn: () =>
			api.get<PayloadPage<VariantDoc>>(
				`/api/product-variants?where[product][equals]=${productId}&where[archivedAt][exists]=false&limit=100&depth=0`,
			),
		enabled: Boolean(productId),
	});
}

/**
 * A buyer's variant list for a listing's detail page — always the public,
 * live-only view via `GET /api/public/products/:id/variants`, which applies
 * no caller identity, unlike `useProductVariants` above. No `cost`, no
 * `stockOnHand`/`stockReserved`: only the server-derived `available` boolean.
 */
export function usePublicVariants(productId: string | undefined) {
	return useQuery({
		queryKey: shopKeys.publicVariants(productId ?? ""),
		queryFn: () =>
			api.get<{ docs: PublicVariantDoc[] }>(
				`/api/public/products/${productId}/variants`,
			),
		enabled: Boolean(productId),
	});
}

export function useCreateProduct(shopId: string | undefined) {
	const invalidate = useInvalidateShop();
	return useMutation({
		mutationFn: (input: ProductInput) =>
			api.post<ProductWriteResponse>(`/api/shops/${shopId}/products`, input),
		onSuccess: invalidate,
	});
}

export function useUpdateProduct(productId: string | undefined) {
	const invalidate = useInvalidateShop();
	return useMutation({
		mutationFn: (input: ProductInput) =>
			api.patch<ProductWriteResponse>(`/api/products/${productId}`, input),
		onSuccess: invalidate,
	});
}

export type VariantWithProduct = Omit<VariantDoc, "product"> & {
	product: ProductDoc;
};

/**
 * A single variant with its product populated (depth=1), for a screen that
 * is handed only a `variantId` — the stock adjustment sheet's deep link.
 * Retried once at most on anything but a 404: an unknown id is a dead end,
 * never a transient failure worth retrying.
 */
export function useVariant(variantId: string | undefined) {
	return useQuery({
		queryKey: shopKeys.variant(variantId ?? ""),
		queryFn: () =>
			api.get<VariantWithProduct>(`/api/product-variants/${variantId}?depth=1`),
		enabled: Boolean(variantId),
		retry: (count, error) =>
			!(error instanceof ApiError && error.status === 404) && count < 1,
	});
}

export function useRecordMovement() {
	const invalidate = useInvalidateShop();
	return useMutation({
		mutationFn: ({
			variantId,
			...body
		}: {
			variantId: string;
			type: ManualMovementType;
			quantity: number;
			unitCost?: number;
			note?: string;
		}) =>
			api.post<MovementResponse>(
				`/api/variants/${variantId}/stock-movements`,
				body,
			),
		onSuccess: invalidate,
	});
}

export function useStockSummary(shopId: string | undefined, enabled = true) {
	return useQuery({
		queryKey: shopKeys.summary(shopId ?? ""),
		queryFn: () => api.get<StockSummary>(`/api/shops/${shopId}/stock-summary`),
		enabled: Boolean(shopId) && enabled,
	});
}

export function useShopSearch(
	params: Record<string, string>,
	enabled: boolean,
) {
	const qs = new URLSearchParams(params).toString();
	return useInfiniteQuery({
		queryKey: shopKeys.search(params),
		enabled,
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			api.get<ShopSearchResponse>(
				`/api/public/search/shops?${qs}&limit=20&offset=${pageParam}`,
			),
		getNextPageParam: (last, pages) => {
			const offset = pages.length * 20;
			return offset < (last?.total ?? 0) ? offset : undefined;
		},
	});
}
