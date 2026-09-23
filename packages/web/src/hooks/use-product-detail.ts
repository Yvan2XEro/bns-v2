"use client";

import { useQuery } from "@tanstack/react-query";
import { shopApi } from "~/lib/shop-api";
import type { ProductDetailResponse } from "~/types";

export const productDetailKey = (productId: string) =>
	["products", productId, "detail"] as const;

/**
 * One product with its variants, its listing and its latest movements.
 *
 * The editor seeds a form from this answer, so it must not change under the
 * seller's fingers: it refetches on invalidation only, which in practice means
 * right after a save.
 */
export function useProductDetail(productId: string) {
	return useQuery<ProductDetailResponse>({
		queryKey: productDetailKey(productId),
		queryFn: () => shopApi.productDetail(productId),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		retry: false,
	});
}
