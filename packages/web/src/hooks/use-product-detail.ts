"use client";

import { useQuery } from "@tanstack/react-query";
import { productDetailKey } from "~/lib/query-keys";
import { shopApi } from "~/lib/shop-api";
import type { ProductDetailResponse } from "~/types";

/**
 * Re-exported from `~/lib/query-keys`: this key is nested under
 * `catalogueRootKey(shopId)`, so every mutation that already invalidates the
 * catalogue root (`useSaveProduct`, `useRecordMovement`, `useStockCount`,
 * `useCloseShop`) invalidates this query too, without naming it.
 */
export { productDetailKey };

/**
 * One product with its variants, its listing and its latest movements.
 *
 * The editor seeds a form from this answer, so it must not change under the
 * seller's fingers while they are on the page: `staleTime: Infinity` plus no
 * focus refetch stop that. Correctness instead comes from invalidation —
 * `invalidateQueries` marks the query stale regardless of `staleTime`, so the
 * next time this hook mounts (a fresh navigation to the editor) it refetches.
 * That only holds because `productDetailKey` sits under the shop's catalogue
 * root; see `~/lib/query-keys` for the mutations that reach it.
 */
export function useProductDetail(shopId: string, productId: string) {
	return useQuery<ProductDetailResponse>({
		queryKey: productDetailKey(shopId, productId),
		queryFn: () => shopApi.productDetail(productId),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		retry: false,
	});
}
