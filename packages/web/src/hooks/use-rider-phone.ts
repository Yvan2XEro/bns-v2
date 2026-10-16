"use client";

import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { apiPost } from "~/lib/shop-api";

/**
 * The rider's phone for the order's buyer. A mutation, like the listing phone
 * reveal: the API logs every reveal and rate-limits it, so it runs only on a tap.
 */
export function useRevealRiderPhone(
	shipmentId: string,
): UseMutationResult<{ phone: string }, ApiError, void> {
	return useMutation<{ phone: string }, ApiError, void>({
		mutationKey: ["shipments", shipmentId, "rider-phone"],
		mutationFn: () =>
			apiPost<{ phone: string }>(
				`/api/shipments/${encodeURIComponent(shipmentId)}/rider-phone`,
			),
		retry: false,
	});
}
