/** One verified-purchase review as a stranger may read it: the reviewer is a first name only. */
export interface PublicShopReview {
	id: string;
	rating: number;
	comment: string | null;
	createdAt: string;
	reviewerFirstName: string | null;
	photos: PublicShopReviewPhoto[];
}

export interface PublicShopReviewPhoto {
	id: string;
	url: string;
}

export interface PublicShopReviewPage {
	reviews: PublicShopReview[];
	page: number;
	totalPages: number;
	/** Every review the list can page through: the shop page's "Avis" count. */
	total: number;
}

export const SHOP_REVIEWS_PAGE_SIZE = 10;

export function shopReviewsRequest(shopId: string, page = 1) {
	const query = page > 1 ? `?page=${page}` : "";
	return {
		queryKey: ["shops", shopId, "reviews", page] as const,
		path: `/api/public/shops/${encodeURIComponent(shopId)}/reviews${query}`,
	};
}
