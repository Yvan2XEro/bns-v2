export const SHOP_TABS = ["listings", "reviews", "about"] as const;
export type ShopTab = (typeof SHOP_TABS)[number];

/** The values `/api/public/search` accepts for `sort`, as the shop page offers them. */
export const SHOP_SORTS = ["newest", "price_asc", "price_desc"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export function parseShopTab(value: string | undefined): ShopTab {
	return SHOP_TABS.find((tab) => tab === value) ?? "listings";
}

export function parseShopSort(value: string | undefined): ShopSort {
	return SHOP_SORTS.find((sort) => sort === value) ?? "newest";
}

export function parsePage(value: string | undefined): number {
	return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

export interface ShopPageState {
	tab: ShopTab;
	q: string;
	category: string;
	sort: ShopSort;
	page: number;
}

/**
 * Defaults are left out of the URL. `q`, `category` and `sort` only belong to
 * the listings tab, so moving to another tab drops them; `page` is per tab.
 */
export function shopPageHref(handle: string, state: ShopPageState): string {
	const params = new URLSearchParams();
	if (state.tab !== "listings") params.set("tab", state.tab);
	if (state.tab === "listings") {
		if (state.q) params.set("q", state.q);
		if (state.category) params.set("category", state.category);
		if (state.sort !== "newest") params.set("sort", state.sort);
	}
	if (state.tab !== "about" && state.page > 1)
		params.set("page", String(state.page));
	const text = params.toString();
	return `/s/${handle}${text ? `?${text}` : ""}`;
}
