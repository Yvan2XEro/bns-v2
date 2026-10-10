"use client";

import { useMemo } from "react";
import { type MarketPhoneRule, marketPhoneRule } from "~/lib/market-phone";
import { useAppConfig } from "./use-app-config";

export function useMarketPhone(): MarketPhoneRule {
	const { market } = useAppConfig();
	return useMemo(() => marketPhoneRule(market), [market]);
}
