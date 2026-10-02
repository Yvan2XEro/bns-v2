"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { apiGet, query } from "~/lib/shop-api";
import type { DeliveryOption } from "~/types/order";

export const deliveryOptionsKey = (city: string, district: string) =>
	["checkout", "delivery-options", city, district] as const;

/**
 * `GET /api/checkout/delivery-options` — the delivery step's own source, so
 * the step never offers an option the quote would then refuse. Kept beside
 * the screen because `src/hooks/use-checkout.ts` has no reader for it yet.
 */
export function useDeliveryOptions(
	city: string | null,
	district: string | null,
) {
	return useQuery<{ city: string; options: DeliveryOption[] }, ApiError>({
		queryKey: deliveryOptionsKey(city ?? "", district ?? ""),
		queryFn: () =>
			apiGet(
				`/api/checkout/delivery-options${query({
					city: city ?? undefined,
					district: district ?? undefined,
				})}`,
			),
		enabled: Boolean(city),
		retry: false,
	});
}
