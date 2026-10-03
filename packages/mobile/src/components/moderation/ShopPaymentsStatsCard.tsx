import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import { PAYOUT_ORIGIN_LABELS } from "@/src/lib/moderationPayments";
import { formatXaf } from "@/src/lib/orderMoney";
import { PAYOUT_STATUSES } from "@/src/lib/paymentStatus";
import type { ShopPaymentsSheet } from "@/src/types/api";
import type { ModerationPalette, Translate } from "./theme";

interface ShopPaymentsStatsCardProps {
	lastPayouts: ShopPaymentsSheet["lastPayouts"];
	openExposure: number;
	refundRate: ShopPaymentsSheet["refundRate"];
	locale: "fr" | "en";
	c: ModerationPalette;
	t: Translate;
}

/** Recent payouts, the shop's open protected exposure and its refund rate —
 * the fraud-rule inputs staff see on the same screen the rule reads them from. */
export function ShopPaymentsStatsCard({
	lastPayouts,
	openExposure,
	refundRate,
	locale,
	c,
	t,
}: ShopPaymentsStatsCardProps) {
	return (
		<View style={{ gap: 10 }}>
			<View style={styles.statsRow}>
				<Stat
					label={t("moderation.paymentsOpenExposureLabel")}
					value={formatXaf(openExposure, locale)}
					c={c}
				/>
				<Stat
					label={t("moderation.paymentsRefundRateTitle", {
						days: refundRate.windowDays,
					})}
					value={t("moderation.paymentsRefundRateBody", {
						refunded: refundRate.refundedOrders,
						orders: refundRate.orders,
					})}
					c={c}
				/>
			</View>

			<Text style={[styles.sectionLabel, { color: c.muted }]}>
				{t("moderation.paymentsRecentPayoutsTitle")}
			</Text>
			{lastPayouts.length === 0 ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("moderation.paymentsRecentPayoutsEmpty")}
				</Text>
			) : (
				lastPayouts.map((payout) => (
					<View key={payout.id} style={[styles.row, { borderColor: c.border }]}>
						<View style={{ flex: 1, gap: 2 }}>
							<Text style={[styles.body, { color: c.text }]}>
								{formatXaf(payout.amount, locale)} ·{" "}
								{t(PAYOUT_STATUSES[payout.status])}
							</Text>
							<Text style={[styles.meta, { color: c.muted }]}>
								{t(PAYOUT_ORIGIN_LABELS[payout.origin])} ·{" "}
								{formatDate(payout.createdAt)}
							</Text>
							{payout.failureReason ? (
								<Text style={[styles.meta, { color: c.danger }]}>
									{payout.failureReason}
								</Text>
							) : null}
						</View>
					</View>
				))
			)}
		</View>
	);
}

function Stat({
	label,
	value,
	c,
}: {
	label: string;
	value: string;
	c: ModerationPalette;
}) {
	return (
		<View style={[styles.stat, { borderColor: c.border }]}>
			<Text style={[styles.meta, { color: c.muted }]}>{label}</Text>
			<Text style={[styles.body, { color: c.text }]}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	sectionLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	body: { fontSize: 14, fontFamily: Fonts.body },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	statsRow: { flexDirection: "row", gap: 10 },
	stat: {
		flex: 1,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		padding: 10,
		gap: 2,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		padding: 10,
	},
});
