import type { MyShopResponse } from "~/types";

export interface ShopEntry {
	href: "/seller" | "/shop/new";
	/** Message key, resolved in the caller's own namespace. */
	key: "myShop" | "openShop";
}

/**
 * Where the "my shop" / "open a shop" entry points lead, or null when none is
 * offered. `shopsEnabled` gates shop *creation* only: an owner keeps every route
 * into an existing shop while the flag is off, as the API does.
 */
export function shopEntryFor(
	mine: MyShopResponse | null | undefined,
	shopsEnabled: boolean,
): ShopEntry | null {
	if (mine?.shop && mine.shop.status !== "closed") {
		return { href: "/seller", key: "myShop" };
	}
	return shopsEnabled ? { href: "/shop/new", key: "openShop" } : null;
}
