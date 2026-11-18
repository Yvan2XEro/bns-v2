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

/** The market's currency code for unit labels and placeholders; empty without a market block. */
export function useCurrencyCode(): string {
	return useAppConfig().market?.currency.code ?? "";
}
