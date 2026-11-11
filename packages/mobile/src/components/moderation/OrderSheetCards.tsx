import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatPrice } from "@/src/lib/market";
import { formatOrderDate } from "@/src/lib/orderMoney";
import {
	BUYER_TIER_KEYS,
	reasonKey,
	STAFF_STATUS_KEYS,
} from "@/src/lib/staffOrderSheet";
import type { OrderView } from "@/src/types/order";
import { FactRow, ModerationCard, TonePill } from "./ModerationKit";
import type { ModerationPalette, Translate } from "./theme";

interface CardProps {
	order: OrderView;
	locale: "fr" | "en";
	c: ModerationPalette;
	t: Translate;
}

export function OrderSheetCard({
	title,
	children,
}: {
	title: string;
	/** Kept for callers; the card reads the shared palette itself. */
	c?: ModerationPalette;
	children: ReactNode;
}) {
	return <ModerationCard title={title}>{children}</ModerationCard>;
}

/** Status, money, parties — read straight off the staff projection. */
export function OrderSummaryCard({ order, locale, c, t }: CardProps) {
	return (
		<OrderSheetCard title={t("moderationOrder.summaryTitle")}>
			<FactRow
				label={t("moderationOrder.status")}
				value={t(STAFF_STATUS_KEYS[order.status])}
			/>
			<FactRow
				label={t("moderationOrder.total")}
				value={formatPrice(order.amounts.total, locale)}
			/>
			<Text style={[styles.meta, { color: c.muted }]}>
				{t("moderationOrder.placedAt", {
					date: formatOrderDate(order.timestamps.placedAt, locale),
				})}
			</Text>
			<FactRow label={t("moderationOrder.shop")} value={order.shop.name} />
			<FactRow
				label={t("moderationOrder.buyer")}
				value={order.buyer?.name ?? t("moderationOrder.unknown")}
			/>
			{order.cancellation ? (
				<FactRow
					label={t("moderationOrder.cancellationTitle")}
					value={[
						t(reasonKey(order.cancellation.reason)),
						order.cancellation.note,
					]
						.filter(Boolean)
						.join(" — ")}
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
		<OrderSheetCard title={t("moderationOrder.riskTitle")}>
			<TonePill
				tone={
					order.risk.phoneTier === "blocked"
						? "negative"
						: watch
							? "warning"
							: "positive"
				}
				label={`${t("moderationOrder.riskTier")} : ${t(BUYER_TIER_KEYS[order.risk.phoneTier])}`}
			/>
			<Text style={[styles.body, { color: c.text }]}>
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
		<OrderSheetCard title={t("moderationOrder.deliveryTitle")}>
			<Text style={[styles.strong, { color: c.text }]}>{d.recipientName}</Text>
			<Text style={[styles.body, { color: c.text }]}>{d.phone}</Text>
			{d.phoneMasked ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("moderationOrder.phoneMasked")}
				</Text>
			) : null}
			<Text style={[styles.body, { color: c.text }]}>
				{[district, d.city].filter(Boolean).join(", ")}
			</Text>
			{d.landmark ? (
				<Text style={[styles.meta, { color: c.muted }]}>{d.landmark}</Text>
			) : null}
		</OrderSheetCard>
	);
}

const styles = StyleSheet.create({
	strong: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.bodySemibold },
	body: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.body },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
});
