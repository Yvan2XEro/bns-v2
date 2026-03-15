import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	CategoriesResponse,
	ListingDoc,
	ListingHitMapped,
	PayloadDoc,
	PayloadPage,
	SearchQueryParams,
	SearchResponse,
	SearchSortKey,
} from "@/src/types/api";
import { api } from "../lib/api";

// Re-export types consumers may need
export type { ListingDoc as Listing, SearchQueryParams as SearchParams };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive isBoosted from the boostedUntil date field */
function mapHit(hit: SearchResponse["hits"][number]): ListingHitMapped {
	return {
		...hit,
		isBoosted: !!(hit.boostedUntil && new Date(hit.boostedUntil) > new Date()),
	};
}

function buildQuery(
	params: Record<string, string | number | undefined>,
): string {
	return new URLSearchParams(
		Object.fromEntries(
			Object.entries(params)
				.filter(([, v]) => v !== undefined && v !== null && v !== "")
				.map(([k, v]) => [k, String(v)]),
		),
	).toString();
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetches a single page of listings matching the given search params.
 * Returns hits mapped with the derived `isBoosted` flag.
 */
export function useListings(params: SearchQueryParams = {}) {
	const query = buildQuery(
		params as Record<string, string | number | undefined>,
	);

	return useQuery({
		queryKey: ["listings", params],
		queryFn: async () => {
			const res = await api.get<SearchResponse>(`/api/public/search?${query}`);
			return { ...res, hits: res.hits.map(mapHit) };
		},
	});
}

/**
 * Fetches a single listing by ID (depth=1 — relations populated).
 * Response: { doc: ListingDoc }
 */
export function useListing(id: string) {
	return useQuery({
		queryKey: ["listing", id],
		queryFn: () =>
			api.get<PayloadDoc<ListingDoc>>(`/api/listings/${id}?depth=1`),
		enabled: !!id,
	});
}

/**
 * Infinite-scroll listings (offset pagination, 20 per page).
 */
export function useInfiniteListings(
	params: Omit<SearchQueryParams, "limit" | "offset"> = {},
) {
	return useInfiniteQuery({
		queryKey: ["listings-infinite", params],
		queryFn: async ({ pageParam = 0 }) => {
			const q = buildQuery({
				...(params as Record<string, string | number | undefined>),
				limit: 20,
				offset: pageParam as number,
			});
			const res = await api.get<SearchResponse>(`/api/public/search?${q}`);
			return { ...res, hits: res.hits.map(mapHit) };
		},
		getNextPageParam: (lastPage, pages) => {
			const loaded = pages.length * 20;
			return loaded < lastPage.total ? loaded : undefined;
		},
		initialPageParam: 0,
	});
}

/**
 * Fetches all active categories (stale for 1 hour).
 * Response: { categories: Category[] }
 */
export function useCategories() {
	return useQuery({
		queryKey: ["categories"],
		queryFn: () => api.get<CategoriesResponse>("/api/public/categories"),
		staleTime: 60 * 60 * 1000,
	});
}

/**
 * Fetches listings created by the currently authenticated user.
 * Uses Payload REST endpoint — returns PayloadPage<ListingDoc>.
 */
export function useMyListings(status?: string) {
	const params = status
		? `?where[status][equals]=${status}&depth=0`
		: "?depth=0";
	return useQuery({
		queryKey: ["my-listings", status],
		queryFn: () => api.get<PayloadPage<ListingDoc>>(`/api/listings${params}`),
	});
}

/** Mutation to create a new listing. */
export function useCreateListing() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Partial<ListingDoc>) =>
			api.post<PayloadDoc<ListingDoc>>("/api/listings", data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["listings"] });
			queryClient.invalidateQueries({ queryKey: ["my-listings"] });
		},
	});
}

/** Mutation to update an existing listing. */
export function useUpdateListing(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Partial<ListingDoc>) =>
			api.patch<PayloadDoc<ListingDoc>>(`/api/listings/${id}`, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["listing", id] });
			queryClient.invalidateQueries({ queryKey: ["my-listings"] });
		},
	});
}

/** Mutation to delete a listing. */
export function useDeleteListing() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.delete(`/api/listings/${id}`),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["listings"] });
			queryClient.invalidateQueries({ queryKey: ["my-listings"] });
		},
	});
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

export const SORT_OPTIONS: Array<{ key: SearchSortKey; label: string }> = [
	{ key: "newest", label: "Récents" },
	{ key: "oldest", label: "Anciens" },
	{ key: "price_asc", label: "Prix ↑" },
	{ key: "price_desc", label: "Prix ↓" },
];
