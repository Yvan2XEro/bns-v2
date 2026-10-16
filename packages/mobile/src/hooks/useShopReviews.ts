import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import {
	type PublicShopReviewPage,
	shopReviewsRequest,
} from "../../../api/src/contracts/publicShopReviews";
import { api } from "../lib/api";

/**
 * A shop's verified-purchase reviews, page by page. The first page's `total`
 * is the "Avis" tab count: it counts exactly what this list can show.
 */
export function useShopReviews(shopId: string | undefined) {
	return useInfiniteQuery({
		queryKey: ["shops", shopId ?? "", "reviews"],
		enabled: Boolean(shopId),
		initialPageParam: 1,
		queryFn: ({ pageParam }) =>
			api.get<PublicShopReviewPage>(
				shopReviewsRequest(shopId ?? "", pageParam).path,
			),
		getNextPageParam: (last) =>
			last.page < last.totalPages ? last.page + 1 : undefined,
	});
}

/** Opens (or reuses) the buyer's conversation with the shop itself, no listing. */
export function useContactShop() {
	return useMutation({
		mutationFn: (shopId: string) =>
			api.post<{ conversationId: string }>("/api/conversations/start", {
				shopId,
			}),
	});
}
