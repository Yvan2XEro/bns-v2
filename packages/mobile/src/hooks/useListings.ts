import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { api } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListingImage {
	url: string;
	thumbnailURL?: string;
	width?: number;
	height?: number;
}

export interface Category {
	id: string;
	name: string;
	slug: string;
	icon?: string;
	parent?: Category | string;
}

export interface ListingSeller {
	id: string;
	name: string;
	email: string;
	phone?: string;
	avatar?: { url: string };
	isVerified?: boolean;
	averageRating?: number;
	reviewCount?: number;
	createdAt: string;
}

export interface Listing {
	id: string;
	title: string;
	description?: string;
	price: number;
	negotiable?: boolean;
	condition?: "new" | "likeNew" | "good" | "fair" | "poor";
	status?: "active" | "sold" | "expired" | "pending";
	images?: ListingImage[];
	category?: Category;
	location?: string;
	views?: number;
	isBoosted?: boolean;
	boostExpiresAt?: string;
	expiresAt?: string;
	createdAt: string;
	updatedAt: string;
	seller?: ListingSeller | string;
	attributes?: Record<string, string | number | boolean>;
}

export interface PaginatedListings {
	docs: Listing[];
	totalDocs: number;
	limit: number;
	offset: number;
	hasNextPage?: boolean;
	hasPrevPage?: boolean;
	page?: number;
	totalPages?: number;
}

export interface SearchParams {
	q?: string;
	category?: string;
	minPrice?: number;
	maxPrice?: number;
	condition?: string;
	location?: string;
	radius?: number;
	sort?: "newest" | "priceAsc" | "priceDesc" | "nearest" | "relevance";
	withPhotos?: boolean;
	limit?: number;
	offset?: number;
	page?: number;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetches a single page of listings matching the given search params.
 */
export function useListings(params: SearchParams = {}) {
	const query = new URLSearchParams(
		Object.fromEntries(
			Object.entries(params)
				.filter(([, v]) => v !== undefined && v !== null && v !== "")
				.map(([k, v]) => [k, String(v)]),
		),
	).toString();

	return useQuery({
		queryKey: ["listings", params],
		queryFn: () => api.get<PaginatedListings>(`/api/public/search?${query}`),
	});
}

/**
 * Fetches a single listing by ID (with depth=1 to populate relations).
 */
export function useListing(id: string) {
	return useQuery({
		queryKey: ["listing", id],
		queryFn: () => api.get<{ doc: Listing }>(`/api/listings/${id}?depth=1`),
		enabled: !!id,
	});
}

/**
 * Infinite-scroll listings for feed / category pages.
 * Pages of 20 items loaded via offset pagination.
 */
export function useInfiniteListings(
	params: Omit<SearchParams, "limit" | "offset"> = {},
) {
	return useInfiniteQuery({
		queryKey: ["listings-infinite", params],
		queryFn: ({ pageParam = 0 }) => {
			const p: Record<string, string> = {
				limit: "20",
				offset: String(pageParam),
				...Object.fromEntries(
					Object.entries(params)
						.filter(([, v]) => v !== undefined && v !== null && v !== "")
						.map(([k, v]) => [k, String(v)]),
				),
			};
			const query = new URLSearchParams(p).toString();
			return api.get<PaginatedListings>(`/api/public/search?${query}`);
		},
		getNextPageParam: (lastPage, pages) => {
			const loaded = pages.length * 20;
			return loaded < lastPage.totalDocs ? loaded : undefined;
		},
		initialPageParam: 0,
	});
}

/**
 * Fetches the category tree (stale for 1 hour — categories rarely change).
 */
export function useCategories() {
	return useQuery({
		queryKey: ["categories"],
		queryFn: () =>
			api.get<{ docs: Category[] }>("/api/public/categories?depth=1"),
		staleTime: 60 * 60 * 1000, // 1 hour
	});
}

/**
 * Fetches listings created by the currently authenticated user.
 */
export function useMyListings(status?: string) {
	const params = status
		? `?where[status][equals]=${status}&depth=0`
		: "?depth=0";
	return useQuery({
		queryKey: ["my-listings", status],
		queryFn: () => api.get<PaginatedListings>(`/api/listings${params}`),
	});
}

/**
 * Mutation to create a new listing.
 */
export function useCreateListing() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Partial<Listing>) =>
			api.post<{ doc: Listing }>("/api/listings", data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["listings"] });
			queryClient.invalidateQueries({ queryKey: ["my-listings"] });
		},
	});
}

/**
 * Mutation to update an existing listing.
 */
export function useUpdateListing(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Partial<Listing>) =>
			api.patch<{ doc: Listing }>(`/api/listings/${id}`, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["listing", id] });
			queryClient.invalidateQueries({ queryKey: ["my-listings"] });
		},
	});
}

/**
 * Mutation to delete a listing.
 */
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
