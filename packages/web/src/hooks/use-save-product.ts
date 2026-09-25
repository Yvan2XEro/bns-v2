"use client";

import {
	type UseMutationResult,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { catalogueRootKey } from "~/hooks/use-catalogue";
import { myShopKey } from "~/hooks/use-my-shop";
import type { ApiError } from "~/lib/apiError";
import { shopApi } from "~/lib/shop-api";
import type { ProductInput, ProductSaveResponse } from "~/types";

export const saveProductKey = ["products", "save"] as const;

export interface SaveProductVariables {
	/** `images` holds the ids the product already had; new files are appended. */
	input: ProductInput;
	files: File[];
}

export interface SaveProductResult extends ProductSaveResponse {
	/** The media ids created by this save, in the order the files were given. */
	uploadedIds: string[];
}

/**
 * Creates or updates a product, uploading its new photos first.
 *
 * A product publishes exactly one listing, and the catalogue counts follow the
 * product's status, so a save drops the catalogue and the shop's dashboard
 * counts. `catalogueRootKey` is also the prefix `productDetailKey` nests
 * under (see `~/lib/query-keys`), so this invalidates the product's detail
 * query too without naming it separately.
 */
export function useSaveProduct(
	shopId: string,
	productId?: string,
): UseMutationResult<SaveProductResult, ApiError, SaveProductVariables> {
	const queryClient = useQueryClient();

	return useMutation<SaveProductResult, ApiError, SaveProductVariables>({
		mutationKey: [...saveProductKey, productId ?? shopId],
		mutationFn: async ({ input, files }) => {
			const uploadedIds: string[] = [];
			for (const file of files) {
				uploadedIds.push(await shopApi.uploadMedia(file, input.title));
			}
			const body: ProductInput = {
				...input,
				images: [...(input.images ?? []), ...uploadedIds],
			};
			const response = productId
				? await shopApi.updateProduct(productId, body)
				: await shopApi.createProduct(shopId, body);
			return { ...response, uploadedIds };
		},
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: catalogueRootKey(shopId),
			});
			void queryClient.invalidateQueries({ queryKey: myShopKey });
		},
	});
}
