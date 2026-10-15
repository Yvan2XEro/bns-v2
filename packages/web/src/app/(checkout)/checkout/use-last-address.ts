"use client";

import { usePurchase, usePurchases } from "~/hooks/use-purchases";
import type { CheckoutAddressValues } from "~/lib/checkout-form";
import { addressValuesFromOrder } from "~/lib/checkout-prefill";

/**
 * The address of the buyer's latest order, the closest thing to a saved
 * address the API keeps. `settled` once there is an answer either way, so the
 * address form mounts once, with its final defaults.
 */
export function useLastAddress(): {
	settled: boolean;
	values: CheckoutAddressValues | null;
} {
	const list = usePurchases();
	const lastId = list.data?.pages[0]?.docs[0]?.id ?? null;
	const last = usePurchase(lastId);
	const settled =
		list.isError || (list.isSuccess && (lastId === null || !last.isPending));
	return {
		settled,
		values: last.data ? addressValuesFromOrder(last.data.delivery) : null,
	};
}
