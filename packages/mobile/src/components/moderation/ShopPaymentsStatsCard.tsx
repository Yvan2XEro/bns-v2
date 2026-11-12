import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import { formatPrice } from "@/src/lib/market";
import { PAYOUT_ORIGIN_LABELS } from "@/src/lib/moderationPayments";
import { PAYOUT_STATUSES } from "@/src/lib/paymentStatus";
import type { ShopPaymentsSheet } from "@/src/types/api";
import { SectionTitle } from "./ModerationKit";
import type { ModerationPalette, Translate } from "./theme";
import { tonesOf } from "./tones";

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
	const k = tonesOf(c);
	return (
		<>
			<View style={styles.statsRow}>
				<Stat
					label={t("moderation.paymentsOpenExposureLabel")}
					value={formatPrice(openExposure, locale)}
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

			<View style={styles.section}>
				<SectionTitle>
					{t("moderation.paymentsRecentPayoutsTitle")}
				</SectionTitle>
				{lastPayouts.length === 0 ? (
					<Text style={[styles.empty, { color: c.muted }]}>
						{t("moderation.paymentsRecentPayoutsEmpty")}
					</Text>
				) : (
					<View
						style={[
							styles.group,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						{lastPayouts.map((payout, index) => (
							<View
								key={payout.id}
								style={[
									styles.row,
									index > 0 && styles.divided,
									{ borderTopColor: c.border },
								]}
							>
								<View style={styles.rowHead}>
									<Text style={[styles.amount, { color: c.text }]}>
										{formatPrice(payout.amount, locale)}
									</Text>
									<Text style={[styles.status, { color: c.text }]}>
										{t(PAYOUT_STATUSES[payout.status])}
									</Text>
								</View>
								<Text style={[styles.meta, { color: c.muted }]}>
									{t(PAYOUT_ORIGIN_LABELS[payout.origin])} ·{" "}
									{formatDate(payout.createdAt)}
								</Text>
								{payout.failureReason ? (
									<Text style={[styles.meta, { color: k.dangerText }]}>
										{payout.failureReason}
									</Text>
								) : null}
							</View>
						))}
					</View>
				)}
			</View>
		</>
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
		<View
			style={[styles.stat, { backgroundColor: c.card, borderColor: c.border }]}
			accessible
			accessibilityLabel={`${label}: ${value}`}
		>
			<Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
			<Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	section: { gap: 8 },
	empty: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	statsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
	stat: {
		flex: 1,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 14,
		padding: 14,
		gap: 4,
	},
	statLabel: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	statValue: {
		fontSize: 18,
		lineHeight: 23,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	group: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 14,
	},
	row: { paddingVertical: 12, gap: 2 },
	divided: { borderTopWidth: StyleSheet.hairlineWidth },
	rowHead: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 12,
	},
	amount: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.displayBold },
	status: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
	},
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
});
