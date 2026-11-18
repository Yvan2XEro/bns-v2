"use client";

import {
	type UseMutationResult,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { handleAvailabilityRootKey } from "~/hooks/use-handle-availability";
import { myShopKey } from "~/hooks/use-my-shop";
import { phoneStatusKey } from "~/hooks/use-phone-status";
import type { ApiError } from "~/lib/apiError";
import { type CreateShopInput, shopApi } from "~/lib/shop-api";
import type { PublicShop } from "~/types";

export const createShopKey = ["shops", "create"] as const;

/**
 * Opens the signed-in user's shop.
 *
 * Both outcomes invalidate the availability answers: a success consumes the
 * handle, and a failure usually means someone else consumed it first.
 */
export function useCreateShop(): UseMutationResult<
	{ shop: PublicShop },
	ApiError,
	CreateShopInput
> {
	const queryClient = useQueryClient();

	return useMutation<{ shop: PublicShop }, ApiError, CreateShopInput>({
		mutationKey: createShopKey,
		mutationFn: (input) => shopApi.create(input),
		retry: false,
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: handleAvailabilityRootKey,
			});
			void queryClient.invalidateQueries({ queryKey: myShopKey });
			void queryClient.invalidateQueries({ queryKey: phoneStatusKey });
		},
	});
}
