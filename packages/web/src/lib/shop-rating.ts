import type { Shop } from "~/types";

export type ShopRatingStats = Pick<Shop, "rating" | "totalReviews">;

export interface ShopRatingDisplay {
	/** `shop` is the verified-purchase rating; `owner` is P1's personal one. */
	source: "shop" | "owner";
	rating: number;
	count: number;
}

/**
 * The shop page's rating: the shop's own, built from verified purchases, as
 * soon as it has one review; until then the owner's, as the page showed it
 * before orders existed.
 */
export function shopRating(
	shop: ShopRatingStats | null,
	owner: { rating: number; totalReviews: number },
): ShopRatingDisplay | null {
	const shopCount = shop?.totalReviews ?? 0;
	if (shopCount >= 1 && typeof shop?.rating === "number") {
		return { source: "shop", rating: shop.rating, count: shopCount };
	}
	if (owner.totalReviews > 0) {
		return { source: "owner", rating: owner.rating, count: owner.totalReviews };
	}
	return null;
}
