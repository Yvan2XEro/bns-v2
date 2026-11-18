"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogueRootKey } from "~/hooks/use-catalogue";
import { myShopKey } from "~/hooks/use-my-shop";
import type { ApiError } from "~/lib/apiError";
import { shopApi } from "~/lib/shop-api";
import type { ProductInput, ProductStatus } from "~/types";

function useInvalidateCatalogue(shopId: string) {
	const queryClient = useQueryClient();
	return () => {
		void queryClient.invalidateQueries({ queryKey: catalogueRootKey(shopId) });
		void queryClient.invalidateQueries({ queryKey: myShopKey });
	};
}

/** The catalogue's bulk action: one status for every checked product, all or nothing. */
export function useSetProductsStatus(shopId: string) {
	const invalidate = useInvalidateCatalogue(shopId);
	return useMutation<
		{ updated: string[] },
		ApiError,
		{ productIds: string[]; status: ProductStatus }
	>({
		mutationKey: ["shops", shopId, "products", "status"],
		mutationFn: (body) => shopApi.setProductsStatus(shopId, body),
		retry: false,
		onSettled: invalidate,
	});
}

export interface ImportOutcome {
	line: number;
	title: string;
	productId: string | null;
	error: ApiError | null;
}

/**
 * One create per row, through the same route the editor uses, one after the
 * other: each row is its own transaction, so a refused row leaves the others
 * created and is reported against its line.
 */
export function useImportProducts(shopId: string) {
	const invalidate = useInvalidateCatalogue(shopId);
	return useMutation<
		ImportOutcome[],
		ApiError,
		{
			rows: { line: number; title: string; input: ProductInput }[];
			onProgress?: (done: number) => void;
		}
	>({
		mutationKey: ["shops", shopId, "products", "import"],
		mutationFn: async ({ rows, onProgress }) => {
			const outcomes: ImportOutcome[] = [];
			for (const row of rows) {
				try {
					const saved = await shopApi.createProduct(shopId, row.input);
					outcomes.push({
						line: row.line,
						title: row.title,
						productId: String(saved.product.id),
						error: null,
					});
				} catch (error) {
					outcomes.push({
						line: row.line,
						title: row.title,
						productId: null,
						error: error as ApiError,
					});
				}
				onProgress?.(outcomes.length);
			}
			return outcomes;
		},
		retry: false,
		onSettled: invalidate,
	});
}
