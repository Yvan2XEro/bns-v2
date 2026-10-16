import {
	type CategoryNode,
	groupedCounts,
	type ShopCategoryCount,
} from "../../../api/src/contracts/shopCategoryGroups";
import {
	isNewShop,
	type ShopTrust,
	type ShopTrustItem,
	shopTrustItems,
} from "../../../api/src/contracts/shopTrust";

/** The values `/api/public/search` accepts for `sort`, as the shop page offers them (same as the web). */
export const SHOP_SORTS = ["newest", "price_asc", "price_desc"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export const SHOP_SORT_LABEL_KEYS: Record<ShopSort, string> = {
	newest: "shop.sortNewest",
	price_asc: "shop.sortPriceAsc",
	price_desc: "shop.sortPriceDesc",
};

export const SHOP_PAGE_SIZE = 20;

export function shopSearchQuery(input: {
	shopId: string;
	q?: string;
	category?: string | null;
	sort: ShopSort;
	offset: number;
	limit?: number;
}): string {
	const params = new URLSearchParams({
		shop: input.shopId,
		sort: input.sort,
		limit: String(input.limit ?? SHOP_PAGE_SIZE),
		offset: String(input.offset),
	});
	const q = input.q?.trim();
	if (q) params.set("q", q);
	if (input.category) params.set("category", input.category);
	return params.toString();
}

/** Counted over the whole shop, never the current query or category, as on the web. */
export function shopFacetQuery(shopId: string): string {
	return new URLSearchParams({
		shop: shopId,
		facets: "category",
		limit: "1",
	}).toString();
}

export function categoryTreeOf(
	categories: readonly {
		id: string;
		name: string;
		parent?: { id: string } | string | null;
	}[],
): Map<string, CategoryNode> {
	return new Map(
		categories.map((c) => [
			String(c.id),
			{
				name: c.name,
				parent:
					typeof c.parent === "string" ? c.parent : (c.parent?.id ?? null),
			},
		]),
	);
}

/** `null` when the counts could not be read: the row is then hidden. */
export function shopCategoryChips(
	counts: Record<string, number> | null | undefined,
	tree: Map<string, CategoryNode>,
): ShopCategoryCount[] | null {
	if (!counts || tree.size === 0) return null;
	const groups = groupedCounts(counts, tree);
	return showCategoryRow(groups) ? groups : null;
}

/** A single category is not a choice: the row would only repeat « Tout ». */
export function showCategoryRow(groups: readonly unknown[] | null): boolean {
	return (groups?.length ?? 0) > 1;
}

// ─── Scroll geometry ─────────────────────────────────────────────────────────
// Offsets are the list's content offset; positions are within the list header.

/** The compact bar fades in over this many dp before it is fully shown. */
export const COMPACT_FADE_DP = 24;

/** The compact bar is fully shown once the shop name has passed under it, as on the web. */
export function compactBarThreshold(
	nameBottom: number,
	barHeight: number,
): number {
	"worklet";
	return Math.max(0, nameBottom - barHeight);
}

export function compactBarOpacity(scrollY: number, threshold: number): number {
	"worklet";
	if (threshold <= 0) return scrollY > 0 ? 1 : 0;
	const start = threshold - COMPACT_FADE_DP;
	if (scrollY <= start) return 0;
	if (scrollY >= threshold) return 1;
	return (scrollY - start) / COMPACT_FADE_DP;
}

/**
 * Where the tabs sit on screen: with the content until they reach the
 * compact bar, then pinned under it.
 */
export function stickyTop(
	stickyY: number,
	scrollY: number,
	barHeight: number,
): number {
	"worklet";
	return Math.max(barHeight, stickyY - scrollY);
}

/** The content offset at which the tabs pin under the compact bar. */
export function pinOffset(stickyY: number, barHeight: number): number {
	return Math.max(0, stickyY - barHeight);
}

/** Shown once the header's contact buttons have gone under the compact bar. */
export function contactBarVisible(
	scrollY: number,
	contactBottom: number,
	barHeight: number,
): boolean {
	"worklet";
	return contactBottom > 0 && scrollY > contactBottom - barHeight;
}

/**
 * The offset to land on when switching tab. Above the pin the header is
 * shared, so the offset stays; past it, the tab's own position comes back,
 * never above the pin, so the banner does not re-expand.
 */
export function tabSwitchOffset(input: {
	current: number;
	pin: number;
	saved: number | undefined;
}): number {
	const { current, pin, saved } = input;
	if (current < pin) return Math.max(0, current);
	return Math.max(pin, saved ?? pin);
}

/**
 * Blank space after a short tab so it can still scroll to the pin: without
 * it, a three-line « À propos » would pull the banner back down.
 */
export function footerSpacer(input: {
	contentHeight: number;
	currentSpacer: number;
	viewportHeight: number;
	pin: number;
}): number {
	const base = input.contentHeight - input.currentSpacer;
	return Math.max(0, Math.ceil(input.pin + input.viewportHeight - base));
}

// ─── Trust strip ─────────────────────────────────────────────────────────────

interface TrustSource {
	createdAt: string;
	publishedListingCount: number;
	location: { city: string | null };
	rating?: number;
	totalReviews?: number;
	owner: { rating: number; totalReviews: number };
	trust?: ShopTrust | null;
}

/**
 * The shop's own verified-purchase rating once it has a review, the owner's
 * until then — the web's `shopRating`.
 */
export function shopRatingOf(
	shop: TrustSource,
): { value: number; count: number } | null {
	const shopCount = shop.totalReviews ?? 0;
	if (shopCount >= 1 && typeof shop.rating === "number")
		return { value: shop.rating, count: shopCount };
	if (shop.owner.totalReviews > 0)
		return { value: shop.owner.rating, count: shop.owner.totalReviews };
	return null;
}

/** An API without `trust` yet still gets a strip from the fields it has. */
export function shopTrustStrip(
	shop: TrustSource,
	now: Date = new Date(),
): ShopTrustItem[] {
	const trust: ShopTrust = shop.trust ?? {
		responseTime: null,
		activeListings: shop.publishedListingCount,
		memberSince: shop.createdAt,
		isNew: isNewShop(shop.createdAt, shop.totalReviews ?? 0, now),
	};
	return shopTrustItems({
		trust,
		city: shop.location.city,
		rating: shopRatingOf(shop),
	});
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function formatRating(value: number, language: string): string {
	const text = value.toFixed(1);
	return language.startsWith("en") ? text : text.replace(".", ",");
}

export function trustItemText(
	item: ShopTrustItem,
	t: Translate,
	language: string,
): string {
	switch (item.kind) {
		case "rating":
			return t("shop.trustRating", {
				rating: formatRating(item.rating, language),
				count: item.count,
			});
		case "responseTime":
			return t(`shop.trustResponse.${item.bucket}`);
		case "city":
			return item.city;
		case "memberSince":
			return t("shop.trustSince", { year: item.year });
		case "newShop":
			return t("shop.trustNewShop");
		case "activeListings":
			return t("shop.trustListings", { count: item.count });
	}
}
