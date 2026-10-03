import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
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
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<View style={styles.main}>
				<View style={styles.head}>
					<Text style={[s.cardTitle, { color: c.primary, fontSize: 14 }]}>
						{formatOrderDate(payout.date, locale)}
					</Text>
					<PayoutStatusBadge status={payout.status} />
				</View>
				<Text style={[s.meta, { color: c.muted }]}>
					{payout.destinationMasked}
				</Text>
			</View>
			<Text style={[s.cardTitle, { color: c.text, fontSize: 15 }]}>
				{formatXaf(payout.amount, locale)}
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
	head: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
});
