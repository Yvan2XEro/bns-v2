"use client";

import { useQuery } from "@tanstack/react-query";
import { type PopulatedVariant, shopApi } from "~/lib/shop-api";
import type { VariantDoc } from "~/types";

export const variantKey = (variantId: string) =>
	["variants", variantId] as const;

export const productVariantsKey = (productId: string) =>
	["products", productId, "variants"] as const;

/** One variant with its product populated, for a deep link into the drawer. */
export function useVariant(variantId: string | null) {
	return useQuery<PopulatedVariant>({
		queryKey: variantKey(variantId ?? ""),
		queryFn: () => shopApi.variant(variantId ?? ""),
		enabled: Boolean(variantId),
		retry: false,
	});
}

/**
 * Query options rather than a hook: the picker reads the variants of the
 * product the seller just clicked, which is an answer to an action and not
 * state the component renders.
 */
export function productVariantsQuery(productId: string) {
	return {
		queryKey: productVariantsKey(productId),
		queryFn: (): Promise<{ docs: VariantDoc[] }> =>
			shopApi.productVariants(productId),
	};
}
