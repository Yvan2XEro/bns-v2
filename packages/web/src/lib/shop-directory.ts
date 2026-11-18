import type { ShopSearchHit, ShopSearchResponse } from "~/types";
import { SHOPS_DIRECTORY } from "./nav";

/** The sorts the directory offers; "relevance" is the organic ranking. */
export const DIRECTORY_SORTS = ["relevance", "rating", "products"] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

export const DIRECTORY_PAGE_SIZE = 24;
/** The "shops that sell…" row above listing results. */
export const SHOPS_ROW_SIZE = 3;
/** Of which at most this many may be sponsored. */
export const SHOPS_ROW_SPONSORED = 1;

export interface DirectoryFilters {
	q: string;
	city: string;
	/** 0 for every level; otherwise the `minShopLevel` floor. */
	level: number;
	category: string;
	sort: DirectorySort;
	page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string =>
	(Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export function parseDirectoryParams(params: RawParams): DirectoryFilters {
	const level = Number.parseInt(one(params.level), 10);
	const page = Number.parseInt(one(params.page), 10);
	const sort = one(params.sort);
	return {
		q: one(params.q),
		city: one(params.city),
		level: level >= 1 && level <= 3 ? level : 0,
		category: one(params.category),
		sort: DIRECTORY_SORTS.find((option) => option === sort) ?? "relevance",
		page: Number.isFinite(page) && page > 1 ? page : 1,
	};
}

/** The public shops search query behind a directory page. */
export function directoryApiQuery(
	filters: DirectoryFilters,
	pageSize = DIRECTORY_PAGE_SIZE,
): string {
	const params = new URLSearchParams();
	if (filters.q) params.set("q", filters.q);
	if (filters.city) params.set("city", filters.city);
	if (filters.category) params.set("category", filters.category);
	if (filters.level) params.set("minShopLevel", String(filters.level));
	if (filters.sort !== "relevance") params.set("sort", filters.sort);
	params.set("limit", String(pageSize));
	params.set("offset", String((filters.page - 1) * pageSize));
	return params.toString();
}

/** A shareable shop directory link; changing a filter goes back to page 1. */
export function directoryHref(filters: Partial<DirectoryFilters> = {}): string {
	const params = new URLSearchParams();
	if (filters.q) params.set("q", filters.q);
	if (filters.city) params.set("city", filters.city);
	if (filters.level) params.set("level", String(filters.level));
	if (filters.category) params.set("category", filters.category);
	if (filters.sort && filters.sort !== "relevance")
		params.set("sort", filters.sort);
	if (filters.page && filters.page > 1)
		params.set("page", String(filters.page));
	const query = params.toString();
	return query ? `${SHOPS_DIRECTORY}?${query}` : SHOPS_DIRECTORY;
}

export function pageCount(total: number, pageSize = DIRECTORY_PAGE_SIZE) {
	return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** Up to five page numbers around the current one, for the pager. */
export function pageWindow(current: number, pages: number): number[] {
	const start = Math.max(1, Math.min(current - 2, pages - 4));
	const end = Math.min(pages, start + 4);
	return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export interface ShopsRow {
	sponsored: ShopSearchHit[];
	organic: ShopSearchHit[];
}

/**
 * The row above listing results: at most one sponsored shop, labelled, then
 * the best organic ones, never the same shop twice.
 */
export function shopsRow(
	response: Pick<ShopSearchResponse, "hits" | "sponsored"> | undefined,
	size = SHOPS_ROW_SIZE,
): ShopsRow {
	const sponsored = (response?.sponsored ?? []).slice(0, SHOPS_ROW_SPONSORED);
	const taken = new Set(sponsored.map((hit) => hit.id));
	const organic = (response?.hits ?? [])
		.filter((hit) => !taken.has(hit.id))
		.slice(0, Math.max(0, size - sponsored.length));
	return { sponsored, organic };
}

/** The row only makes sense once the buyer has said what they look for. */
export function showsShopsRow(filters: {
	q?: string;
	category?: string;
}): boolean {
	return Boolean(filters.q?.trim() || filters.category);
}

/** The shop's own rating once it has reviews, else the owner's. */
export function shopRating(
	hit: Pick<
		ShopSearchHit,
		"rating" | "totalReviews" | "ownerRating" | "ownerReviews"
	>,
): { value: number; count: number } | null {
	if ((hit.totalReviews ?? 0) > 0)
		return { value: hit.rating ?? 0, count: hit.totalReviews ?? 0 };
	if (hit.ownerReviews > 0)
		return { value: hit.ownerRating, count: hit.ownerReviews };
	return null;
}
