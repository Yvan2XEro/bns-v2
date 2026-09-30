"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiGet, query } from "~/lib/shop-api";
import type { Listing } from "~/types";

export interface ListingSearchParams {
	q?: string;
	category?: string;
	minPrice?: string;
	maxPrice?: string;
	location?: string;
	sort?: string;
	condition?: string;
	tags?: string;
	/**
	 * `2` for "verified shops only". The API re-applies this floor after
	 * hydrating live shop data, so it is never re-filtered client-side —
	 * same contract as `ShopSearchParams.minShopLevel` in `use-shop-search.ts`.
	 */
	minShopLevel?: number;
	attributes?: Record<string, string>;
	lat?: number;
	lng?: number;
	radius?: string;
	limit: number;
}

export interface ListingSearchPage {
	hits: Listing[];
	total: number;
}

/**
 * `attributes`' key order must not affect the cache key, or the same
 * filters typed through a different path (e.g. clearing then re-adding one)
 * would be treated as a distinct query.
 */
export const listingSearchKey = (params: ListingSearchParams) =>
	[
		"listings",
		"search",
		{
			...params,
			attributes: Object.entries(params.attributes ?? {}).sort(),
		},
	] as const;

function searchPath(params: ListingSearchParams, offset: number): string {
	const flat: Record<string, string | number | undefined> = {
		q: params.q,
		category: params.category,
		minPrice: params.minPrice,
		maxPrice: params.maxPrice,
		location: params.location,
		sort: params.sort,
		condition: params.condition,
		tags: params.tags,
		minShopLevel: params.minShopLevel,
		lat: params.lat,
		lng: params.lng,
		radius: params.lat != null ? params.radius : undefined,
		limit: params.limit,
		offset,
	};
	for (const [key, value] of Object.entries(params.attributes ?? {})) {
		if (value) flat[`attr_${key}`] = value;
	}
	return `/api/public/search${query(flat)}`;
}

/**
 * One page of the public listings search — the `useInfiniteQuery` mirror of
 * `useShopSearch`'s single-page query, kept separate because the listings
 * tab (unlike the shops tab) still has a "load more" button. `initialPage`
 * seeds the cache with the server-rendered first page so the grid does not
 * flash a loading skeleton on mount.
 */
export function useListingSearch(
	params: ListingSearchParams,
	options?: { initialPage?: ListingSearchPage },
) {
	return useInfiniteQuery({
		queryKey: listingSearchKey(params),
		queryFn: ({ pageParam }: { pageParam: number }) =>
			apiGet<ListingSearchPage>(searchPath(params, pageParam)),
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			const loaded = allPages.reduce((sum, page) => sum + page.hits.length, 0);
			return loaded < lastPage.total ? loaded : undefined;
		},
		initialData: options?.initialPage
			? { pages: [options.initialPage], pageParams: [0] }
			: undefined,
	});
}
