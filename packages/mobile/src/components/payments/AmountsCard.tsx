import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { HUB_HEADER_BG } from "@/src/components/shop/SellerHubHeader";
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

	const cells: Array<{ label: string; value: number; color: string }> = [
		{
			label: t("payments.seller_awaitingDelivery"),
			value: amounts.awaitingDelivery,
			color: AMBER,
		},
		{
			label: t("payments.seller_withdrawalPeriod"),
			value: amounts.inWithdrawalPeriod,
			color: AMBER,
		},
		{
			label: t("payments.seller_payoutInProgress"),
			value: amounts.payoutInTransit,
			color: "#ffffff",
		},
		{
			label: t("payments.seller_paidThisMonth"),
			value: amounts.paidThisMonth,
			color: GREEN,
		},
	];

	return (
		<View
			style={[
				styles.card,
				{ borderColor: c.isDark ? c.border : HUB_HEADER_BG },
			]}
		>
			<Text style={styles.label}>{t("payments.seller_readyForPayout")}</Text>
			{amounts.readyForPayout === null ? (
				<Text style={styles.schedule}>
					{t("payments.seller_providerSchedule")}
				</Text>
			) : (
				<Text style={styles.hero}>{money(amounts.readyForPayout)}</Text>
			)}
			<View style={styles.divider} />
			<View style={styles.grid}>
				{cells.map((cell) => (
					<View key={cell.label} style={styles.cell}>
						<Text style={styles.label} numberOfLines={2}>
							{cell.label}
						</Text>
						<Text style={[styles.value, { color: cell.color }]}>
							{money(cell.value)}
						</Text>
					</View>
				))}
			</View>
			<Text style={styles.footnote}>{t("payments.seller_amountsTitle")}</Text>
		</View>
	);
}

const AMBER = "#fcd34d";
const GREEN = "#86efac";

const styles = StyleSheet.create({
	card: {
		backgroundColor: HUB_HEADER_BG,
		borderRadius: 18,
		borderWidth: 1,
		padding: 16,
		gap: 6,
	},
	label: { color: "#94a3b8", fontSize: 12, fontFamily: Fonts.body },
	hero: { color: "#ffffff", fontSize: 32, fontFamily: Fonts.displayExtrabold },
	schedule: { color: "#ffffff", fontSize: 16, fontFamily: Fonts.bodySemibold },
	divider: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: "#334155",
		marginVertical: 8,
	},
	grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
	cell: { width: "50%", gap: 2, paddingRight: 8 },
	value: { fontSize: 17, fontFamily: Fonts.displayBold },
	footnote: {
		color: "#64748b",
		fontSize: 11,
		fontFamily: Fonts.body,
		marginTop: 6,
	},
});
