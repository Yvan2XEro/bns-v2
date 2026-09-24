"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogueRootKey } from "~/hooks/use-catalogue";
import { myShopKey } from "~/hooks/use-my-shop";
import type { ApiError } from "~/lib/apiError";
import { shopApi } from "~/lib/shop-api";
import type { AttachResult, Listing } from "~/types";

export const personalListingsRootKey = ["listings", "personal"] as const;

export const personalListingsKey = (userId: string) =>
	[...personalListingsRootKey, userId] as const;

/** A seller's own listings that are not yet part of any shop. */
export function usePersonalListings(
	userId: string | undefined,
	enabled: boolean,
) {
	return useQuery<{ docs: Listing[] }>({
		queryKey: personalListingsKey(userId ?? ""),
		queryFn: () => shopApi.personalListings(userId as string),
		enabled: enabled && Boolean(userId),
		retry: false,
	});
}

export const attachListingsKey = ["shops", "listings", "attach"] as const;

/**
 * Moves listings into the shop, each becoming a single-variant product. A
 * transactional, partial-success write on the server — some listings can be
 * skipped — so the result is read from the response, never assumed.
 */
export function useAttachListings(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		AttachResult,
		ApiError,
		{ listingIds?: string[]; all?: boolean }
	>({
		mutationKey: [...attachListingsKey, shopId],
		mutationFn: (body) => shopApi.attachListings(shopId, body),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: myShopKey });
			void queryClient.invalidateQueries({
				queryKey: catalogueRootKey(shopId),
			});
			void queryClient.invalidateQueries({
				queryKey: personalListingsRootKey,
			});
		},
	});
}
