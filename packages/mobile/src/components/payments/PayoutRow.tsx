import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { formatOrderDate } from "@/src/lib/orderMoney";
import type { SellerPayoutRow as SellerPayoutRowData } from "@/src/types/order";
import { PayoutStatusBadge } from "./PayoutStatusBadge";

export function PayoutRow({ payout }: { payout: SellerPayoutRowData }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${t("payments.payout_title")} — ${formatOrderDate(payout.date, locale)}`}
			onPress={() => router.push(`/seller/payments/payouts/${payout.id}`)}
			style={[
				s.card,
				styles.row,
				{ backgroundColor: c.card, borderColor: c.border, minHeight: 72 },
			]}
		>
			<View style={styles.main}>
				<View style={styles.head}>
					<Text style={[styles.date, { color: c.text }]}>
						{formatOrderDate(payout.date, locale)}
					</Text>
					<PayoutStatusBadge status={payout.status} />
				</View>
				<Text style={[s.meta, { color: c.muted }]}>
					{payout.destinationMasked}
				</Text>
			</View>
			<Text style={[styles.amount, { color: c.text }]}>
				{formatPrice(payout.amount, locale)}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
	},
	main: { flex: 1, gap: 4 },
	date: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.bodySemibold },
	amount: {
		fontSize: 17,
		lineHeight: 22,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.3,
		fontVariant: ["tabular-nums"],
	},
	head: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
});
