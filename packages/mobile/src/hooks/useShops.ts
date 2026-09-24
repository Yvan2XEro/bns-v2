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
	CatalogueFilter,
	CatalogueResponse,
	HandleAvailability,
	ManualMovementType,
	MovementResponse,
	MyShopResponse,
	PayloadPage,
	ProductDetailResponse,
	ProductInput,
	ProductWriteResponse,
	PublicShop,
	PublicShopResponse,
	SearchResponse,
	ShopSearchResponse,
	StockSummary,
	VariantDoc,
} from "../types/api";

export const shopKeys = {
	all: ["shops"] as const,
	mine: ["shops", "mine"] as const,
	public: (handle: string) => ["shops", "public", handle] as const,
	handle: (handle: string) => ["shops", "handle", handle] as const,
	listings: (shopId: string) => ["shops", shopId, "listings"] as const,
	catalogue: (shopId: string, filter: CatalogueFilter) =>
		["shops", shopId, "catalogue", filter] as const,
	summary: (shopId: string) => ["shops", shopId, "stock-summary"] as const,
	search: (params: Record<string, string>) =>
		["shops", "search", params] as const,
	product: (id: string) => ["products", id, "detail"] as const,
	variants: (productId: string) => ["products", productId, "variants"] as const,
};

export function useShopsEnabled(): boolean {
	return useAppConfig().shopsEnabled;
}

export function useMyShop() {
	const { user } = useAuth();
	const enabled = useShopsEnabled();
	return useQuery({
		queryKey: shopKeys.mine,
		queryFn: () => api.get<MyShopResponse>("/api/shops/mine"),
		enabled: Boolean(user) && enabled,
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

export function useCloseShop(shopId: string | undefined) {
	const invalidate = useInvalidateShop();
	return useMutation({
		mutationFn: (confirmation: string) =>
			api.post<{ closed: true; detachedListingIds: string[] }>(
				`/api/shops/${shopId}/close`,
				{ confirmation },
			),
		onSuccess: invalidate,
	});
}

export function useAttachListings(shopId: string | undefined) {
	const invalidate = useInvalidateShop();
	return useMutation({
		mutationFn: (body: { listingIds?: string[]; all?: boolean }) =>
			api.post<AttachResponse>(`/api/shops/${shopId}/listings/attach`, body),
		onSuccess: invalidate,
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

/** Public variants of a product listing; `cost` is never present here. */
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
