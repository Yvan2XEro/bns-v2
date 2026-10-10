import type { ShopEntry } from "~/lib/shop-entry";

/** The header's persistent seller-workspace button: signed-in owners of a shop only. */
export function showSellerHat(
	signedIn: boolean,
	entry: ShopEntry | null,
): boolean {
	return signedIn && entry?.href === "/seller";
}
