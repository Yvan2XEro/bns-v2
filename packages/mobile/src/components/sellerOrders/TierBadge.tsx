import { StatusTag, type StatusTone } from "@/src/components/shop/Tags";
import { useTranslation } from "@/src/lib/i18n";
import { TIER_LABEL_KEYS, tierTone } from "@/src/lib/sellerOrders";
import type { BuyerTier } from "@/src/types/order";

/** The buyer's track record as the shared status pill: good, watch, or new. */
export function TierBadge({ tier }: { tier: BuyerTier }) {
	const { t } = useTranslation();
	const tone = tierTone(tier);
	const pill: StatusTone =
		tone === "good" ? "success" : tone === "warning" ? "warning" : "neutral";
	return <StatusTag label={t(TIER_LABEL_KEYS[tier])} tone={pill} />;
}
