"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";
import { renderOrderMoney } from "~/lib/order-money";
import { useAppConfig } from "./use-app-config";

/** `locale` defaults to the active UI locale; pass one only to render in another. */
export function useOrderMoney() {
	const { market } = useAppConfig();
	const active = useLocale();
	return useCallback(
		(amount: number | null | undefined, locale: string = active) =>
			renderOrderMoney(market, amount, locale),
		[market, active],
	);
}
