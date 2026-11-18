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
 *
 * `unknown` is "the shop lookup failed", not "there is no shop": when true and
 * no shop is already known, this returns null rather than falling back to
 * `openShop` — offering to open a shop to someone who may already have one is
 * worse than offering nothing.
 */
export function shopEntryFor(
	mine: MyShopResponse | null | undefined,
	shopsEnabled: boolean,
	unknown = false,
): ShopEntry | null {
	if (mine?.shop && mine.shop.status !== "closed") {
		return { href: "/seller", key: "myShop" };
	}
	if (unknown) return null;
	return shopsEnabled ? { href: "/shop/new", key: "openShop" } : null;
}
