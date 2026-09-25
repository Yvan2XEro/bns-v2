"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogueRootKey } from "~/hooks/use-catalogue";
import { handleAvailabilityRootKey } from "~/hooks/use-handle-availability";
import { personalListingsRootKey } from "~/hooks/use-listings-move";
import { myShopKey } from "~/hooks/use-my-shop";
import {
	movementsRootKey,
	shopVariantsKey,
	stockSummaryKey,
} from "~/hooks/use-stock";
import type { ApiError } from "~/lib/apiError";
import { type ShopUpdateInput, shopApi } from "~/lib/shop-api";
import type { PublicShop } from "~/types";

export const updateShopKey = ["shops", "update"] as const;
export const changeHandleKey = ["shops", "change-handle"] as const;
export const closeShopKey = ["shops", "close"] as const;

/** Profile, contacts and categories — every field `PATCH /api/shops/:id` accepts. */
export function useUpdateShop(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<{ doc: unknown }, ApiError, ShopUpdateInput>({
		mutationKey: [...updateShopKey, shopId],
		mutationFn: (input) => shopApi.update(shopId, input),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: myShopKey });
		},
	});
}

/** Owner only; the server enforces it and the UI hides the form for anyone else. */
export function useChangeHandle(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		{ shop: PublicShop; nextHandleChangeAt: string },
		ApiError,
		string
	>({
		mutationKey: [...changeHandleKey, shopId],
		mutationFn: (handle) => shopApi.changeHandle(shopId, handle),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: myShopKey });
			void queryClient.invalidateQueries({
				queryKey: handleAvailabilityRootKey,
			});
		},
	});
}

/**
 * Owner only, and transactional on the server: every listing detaches back to
 * personal and every product archives (`closeShopInTransaction`), on top of
 * the shop itself closing — so the client drops the shop, catalogue,
 * personal-listings and every stock cache the shop's variants fed (the
 * `/seller/stock` screens), not just `myShopKey`.
 */
export function useCloseShop(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		{ closed: true; detachedListingIds: string[] },
		ApiError,
		string
	>({
		mutationKey: [...closeShopKey, shopId],
		mutationFn: (confirmation) => shopApi.close(shopId, confirmation),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: myShopKey });
			void queryClient.invalidateQueries({
				queryKey: catalogueRootKey(shopId),
			});
			void queryClient.invalidateQueries({
				queryKey: personalListingsRootKey,
			});
			void queryClient.invalidateQueries({
				queryKey: stockSummaryKey(shopId),
			});
			void queryClient.invalidateQueries({
				queryKey: movementsRootKey(shopId),
			});
			void queryClient.invalidateQueries({
				queryKey: shopVariantsKey(shopId),
			});
		},
	});
}
