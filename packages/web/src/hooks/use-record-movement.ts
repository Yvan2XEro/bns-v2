"use client";

import {
	type UseMutationResult,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { catalogueRootKey } from "~/hooks/use-catalogue";
import { myShopKey } from "~/hooks/use-my-shop";
import { movementsRootKey, stockSummaryKey } from "~/hooks/use-stock";
import { variantKey } from "~/hooks/use-variants";
import type { ApiError } from "~/lib/apiError";
import { type MovementInput, shopApi } from "~/lib/shop-api";
import type { MovementRow, VariantDoc } from "~/types";

export interface RecordMovementVariables {
	variantId: string;
	input: MovementInput;
}

export interface RecordMovementResult {
	movement: MovementRow;
	variant: VariantDoc;
}

/**
 * Appends one movement to the shop's ledger.
 *
 * The API applies the filter and the increment in a single conditional write,
 * so a refusal means someone else moved the same units first. Retrying would
 * silently replay the seller's intent against a stock they never saw: the
 * mutation fails once and the drawer shows why.
 */
export function useRecordMovement(
	shopId: string,
): UseMutationResult<RecordMovementResult, ApiError, RecordMovementVariables> {
	const queryClient = useQueryClient();

	return useMutation<RecordMovementResult, ApiError, RecordMovementVariables>({
		mutationKey: ["shops", shopId, "stock-movements", "record"],
		mutationFn: ({ variantId, input }) =>
			shopApi.recordMovement(variantId, input),
		retry: false,
		onSuccess: (_result, { variantId }) => {
			for (const queryKey of [
				movementsRootKey(shopId),
				stockSummaryKey(shopId),
				catalogueRootKey(shopId),
				variantKey(variantId),
				myShopKey,
			]) {
				void queryClient.invalidateQueries({ queryKey });
			}
		},
	});
}
