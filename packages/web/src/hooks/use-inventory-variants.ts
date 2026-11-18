"use client";

import { useQuery } from "@tanstack/react-query";
import { shopVariantsKey } from "~/hooks/use-stock";
import { type InventoryVariant, shopApi } from "~/lib/shop-api";

/** Nested under the variant list key, so a count or a movement refreshes it too. */
export function useInventoryVariants(shopId: string) {
	return useQuery<{ docs: InventoryVariant[] }>({
		queryKey: [...shopVariantsKey(shopId), "inventory"],
		queryFn: () => shopApi.inventoryVariants(shopId),
		retry: false,
	});
}
