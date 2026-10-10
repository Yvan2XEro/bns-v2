"use client";

import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { BuyerTier } from "~/types/order";
import { tierLabelKey, tierTone } from "./seller-orders";

const TONE_CLASSES = {
	good: "bg-emerald-50 text-emerald-800",
	neutral: "bg-[#F1F5F9] text-[#334155]",
	warning: "bg-amber-50 text-amber-900",
} as const;

export function TierBadge({ tier }: { tier: BuyerTier }) {
	const t = useTranslations("SellerOrders");
	return (
		<span
			className={cn(
				"inline-flex rounded-full px-2.5 py-0.5 font-medium text-xs",
				TONE_CLASSES[tierTone(tier)],
			)}
		>
			{t(tierLabelKey(tier))}
		</span>
	);
}
