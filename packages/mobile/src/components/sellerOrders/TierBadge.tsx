import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { TIER_LABEL_KEYS, tierTone } from "@/src/lib/sellerOrders";
import type { BuyerTier } from "@/src/types/order";

export function TierBadge({ tier }: { tier: BuyerTier }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const tone = tierTone(tier);
	const colors =
		tone === "good"
			? { bg: c.successSoft, fg: c.successText }
			: tone === "warning"
				? { bg: c.warningSoft, fg: c.warningText }
				: { bg: c.neutralSoft, fg: c.neutralText };
	return (
		<View style={[styles.badge, { backgroundColor: colors.bg }]}>
			<Text style={[styles.text, { color: colors.fg }]}>
				{t(TIER_LABEL_KEYS[tier])}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	badge: {
		alignSelf: "flex-start",
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 3,
	},
	text: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
