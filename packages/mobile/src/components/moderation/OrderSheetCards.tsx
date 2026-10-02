import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
import {
	BUYER_TIER_KEYS,
	reasonKey,
	STAFF_STATUS_KEYS,
} from "@/src/lib/staffOrderSheet";
import type { OrderView } from "@/src/types/order";
import type { ModerationPalette, Translate } from "./theme";

interface CardProps {
	order: OrderView;
	locale: "fr" | "en";
	c: ModerationPalette;
	t: Translate;
}

function Row({
	label,
	value,
	c,
}: {
	label: string;
	value: string;
	c: ModerationPalette;
}) {
	return (
		<View style={styles.row}>
			<Text style={[styles.label, { color: c.muted }]}>{label}</Text>
			<Text style={[styles.value, { color: c.text }]}>{value}</Text>
		</View>
	);
}

export function OrderSheetCard({
	title,
	c,
	children,
}: {
	title: string;
	c: ModerationPalette;
	children: ReactNode;
}) {
	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>{title}</Text>
			{children}
		</View>
	);
}

/** Status, money, parties — read straight off the staff projection. */
export function OrderSummaryCard({ order, locale, c, t }: CardProps) {
	return (
		<OrderSheetCard title={t("moderationOrder.summaryTitle")} c={c}>
			<Row
				label={t("moderationOrder.status")}
				value={t(STAFF_STATUS_KEYS[order.status])}
				c={c}
			/>
			<Row
				label={t("moderationOrder.total")}
				value={formatXaf(order.amounts.total, locale)}
				c={c}
			/>
			<Text style={[styles.meta, { color: c.muted }]}>
				{t("moderationOrder.placedAt", {
					date: formatOrderDate(order.timestamps.placedAt, locale),
				})}
			</Text>
			<Row label={t("moderationOrder.shop")} value={order.shop.name} c={c} />
			<Row
				label={t("moderationOrder.buyer")}
				value={order.buyer?.name ?? t("moderationOrder.unknown")}
				c={c}
			/>
			{order.cancellation ? (
				<Row
					label={t("moderationOrder.cancellationTitle")}
					value={[
						t(reasonKey(order.cancellation.reason)),
						order.cancellation.note,
					]
						.filter(Boolean)
						.join(" — ")}
					c={c}
				/>
			) : null}
		</OrderSheetCard>
	);
}

/** The tier and the at-placement refusal count, as the order carries them. */
export function OrderRiskCard({ order, c, t }: Omit<CardProps, "locale">) {
	if (!order.risk) return null;
	const watch =
		order.risk.phoneTier === "watch" || order.risk.phoneTier === "blocked";
	return (
		<OrderSheetCard title={t("moderationOrder.riskTitle")} c={c}>
			<View
				style={[
					styles.pill,
					{ backgroundColor: watch ? c.warningSoft : c.successSoft },
				]}
			>
				<Text
					style={[styles.pillText, { color: watch ? c.warning : c.success }]}
				>
					{`${t("moderationOrder.riskTier")} : ${t(BUYER_TIER_KEYS[order.risk.phoneTier])}`}
				</Text>
			</View>
			<Text style={[styles.meta, { color: c.text }]}>
				{t("moderationOrder.riskRefusals", {
					count: order.risk.refusalsAtPlacement,
				})}
			</Text>
		</OrderSheetCard>
	);
}

export function OrderDeliveryCard({ order, c, t }: Omit<CardProps, "locale">) {
	const d = order.delivery;
	const district = d.districtOther ?? d.district;
	return (
		<OrderSheetCard title={t("moderationOrder.deliveryTitle")} c={c}>
			<Text style={[styles.value, { color: c.text }]}>{d.recipientName}</Text>
			<Text style={[styles.meta, { color: c.text }]}>{d.phone}</Text>
			{d.phoneMasked ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("moderationOrder.phoneMasked")}
				</Text>
			) : null}
			<Text style={[styles.meta, { color: c.text }]}>
				{[district, d.city].filter(Boolean).join(", ")}
			</Text>
			{d.landmark ? (
				<Text style={[styles.meta, { color: c.muted }]}>{d.landmark}</Text>
			) : null}
		</OrderSheetCard>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 8,
	},
	title: { fontSize: 15, fontFamily: Fonts.displayBold },
	row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
	label: { fontSize: 13, fontFamily: Fonts.body },
	value: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
		textAlign: "right",
	},
	meta: { fontSize: 13, fontFamily: Fonts.body },
	pill: {
		alignSelf: "flex-start",
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	pillText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
