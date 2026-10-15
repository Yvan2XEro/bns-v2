import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { InkCard, inkText, ON_INK } from "@/src/components/ui/InkCard";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { SellerPaymentsAmounts } from "@/src/types/order";

/**
 * The ledger's own amounts strip. `readyForPayout` is `null` under the
 * `provider_schedule` release model — the provider pays out on its own
 * schedule, which this must never render as a zero.
 */
export function AmountsCard({ amounts }: { amounts: SellerPaymentsAmounts }) {
	const { t } = useTranslation();
	const locale = useLocaleKey();
	const money = (value: number) => formatPrice(value, locale);

	const cells: Array<{ label: string; value: number; color: string }> = [
		{
			label: t("payments.seller_awaitingDelivery"),
			value: amounts.awaitingDelivery,
			color: ON_INK.amber,
		},
		{
			label: t("payments.seller_withdrawalPeriod"),
			value: amounts.inWithdrawalPeriod,
			color: ON_INK.amber,
		},
		{
			label: t("payments.seller_payoutInProgress"),
			value: amounts.payoutInTransit,
			color: ON_INK.text,
		},
		{
			label: t("payments.seller_paidThisMonth"),
			value: amounts.paidThisMonth,
			color: ON_INK.green,
		},
	];

	return (
		<InkCard>
			<Text style={inkText.label}>{t("payments.seller_readyForPayout")}</Text>
			{amounts.readyForPayout === null ? (
				<Text style={styles.schedule}>
					{t("payments.seller_providerSchedule")}
				</Text>
			) : (
				<Text style={inkText.hero}>{money(amounts.readyForPayout)}</Text>
			)}
			<View style={inkText.rule} />
			<View style={styles.grid}>
				{cells.map((cell) => (
					<View key={cell.label} style={styles.cell}>
						<Text style={inkText.label} numberOfLines={2}>
							{cell.label}
						</Text>
						<Text style={[inkText.value, { color: cell.color }]}>
							{money(cell.value)}
						</Text>
					</View>
				))}
			</View>
			<Text style={[inkText.footnote, styles.footnote]}>
				{t("payments.seller_amountsTitle")}
			</Text>
		</InkCard>
	);
}

const styles = StyleSheet.create({
	schedule: {
		color: ON_INK.text,
		fontSize: 16,
		fontFamily: Fonts.bodySemibold,
	},
	grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
	cell: { width: "50%", gap: 2, paddingRight: 8 },
	footnote: { marginTop: 6 },
});
