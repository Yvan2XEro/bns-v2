import { StyleSheet, Text, View } from "react-native";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { SellerPaymentsAmounts } from "@/src/types/order";

/**
 * The ledger's own amounts strip. `readyForPayout` is `null` under the
 * `provider_schedule` release model — the provider pays out on its own
 * schedule, which this must never render as a zero.
 */
export function AmountsCard({ amounts }: { amounts: SellerPaymentsAmounts }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();
	const money = (value: number) => formatXaf(value, locale);

	const rows: Array<{ label: string; value: string }> = [
		{
			label: t("payments.seller_awaitingDelivery"),
			value: money(amounts.awaitingDelivery),
		},
		{
			label: t("payments.seller_withdrawalPeriod"),
			value: money(amounts.inWithdrawalPeriod),
		},
		{
			label: t("payments.seller_readyForPayout"),
			value:
				amounts.readyForPayout === null
					? t("payments.seller_providerSchedule")
					: money(amounts.readyForPayout),
		},
		{
			label: t("payments.seller_payoutInProgress"),
			value: money(amounts.payoutInTransit),
		},
		{
			label: t("payments.seller_paidThisMonth"),
			value: money(amounts.paidThisMonth),
		},
	];

	return (
		<View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Text style={[s.cardTitle, { color: c.text }]}>
				{t("payments.seller_amountsTitle")}
			</Text>
			<View style={styles.rows}>
				{rows.map((row) => (
					<View key={row.label} style={styles.row}>
						<Text style={[s.meta, { color: c.muted, flex: 1 }]}>
							{row.label}
						</Text>
						<Text style={[s.cardTitle, { color: c.text, fontSize: 14 }]}>
							{row.value}
						</Text>
					</View>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	rows: { gap: 8, marginTop: 4 },
	row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
