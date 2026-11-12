import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatPrice } from "@/src/lib/market";
import { formatOrderDate } from "@/src/lib/orderMoney";
import {
	BUYER_TIER_KEYS,
	reasonKey,
	STAFF_STATUS_KEYS,
} from "@/src/lib/staffOrderSheet";
import type { OrderView } from "@/src/types/order";
import {
	CardDivider,
	FactRow,
	ModerationCard,
	TonePill,
} from "./ModerationKit";
import type { ModerationPalette, Translate } from "./theme";
import { tonesOf } from "./tones";

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

/**
 * A party on the order, one tap from its moderation sheet: checking a
 * suspicious COD refuser should not take a manual search.
 */
function PartyRow({
	label,
	value,
	href,
	c,
	t,
}: {
	label: string;
	value: string;
	href: string | null;
	c: ModerationPalette;
	t: Translate;
}) {
	const k = tonesOf(c);
	if (!href) return <FactRow label={label} value={value} />;
	return (
		<Pressable
			accessibilityRole="link"
			accessibilityLabel={`${label} : ${value}, ${t("moderation.openAccount")}`}
			onPress={() => router.push(href as never)}
			style={({ pressed }) => [styles.party, { opacity: pressed ? 0.7 : 1 }]}
		>
			<Text style={[styles.partyLabel, { color: c.muted }]}>{label}</Text>
			<Text
				style={[styles.partyValue, { color: k.linkText }]}
				numberOfLines={2}
			>
				{value}
			</Text>
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
		</Pressable>
	);
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
			{/* The date qualifies the status and total above it, so it hangs
			    off them; the parties start a new group under the hairline. */}
			<Text style={[styles.meta, styles.hang, { color: c.muted }]}>
				{t("moderationOrder.placedAt", {
					date: formatOrderDate(order.timestamps.placedAt, locale),
				})}
			</Text>
			<CardDivider />
			<PartyRow
				label={t("moderationOrder.shop")}
				value={order.shop.name}
				href={order.shop.id ? `/moderation/shop/${order.shop.id}` : null}
				c={c}
				t={t}
			/>
			<PartyRow
				label={t("moderationOrder.buyer")}
				value={order.buyer?.name ?? t("moderationOrder.unknown")}
				href={order.buyer?.id ? `/moderation/user/${order.buyer.id}` : null}
				c={c}
				t={t}
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
			{/* Who, then where: two tight blocks read like an address label,
			    not five loose lines. */}
			<View style={styles.block}>
				<Text style={[styles.strong, { color: c.text }]}>
					{d.recipientName}
				</Text>
				<Text style={[styles.body, { color: c.text }]} selectable>
					{d.phone}
				</Text>
				{d.phoneMasked ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("moderationOrder.phoneMasked")}
					</Text>
				) : null}
			</View>
			<View style={styles.block}>
				<Text style={[styles.body, { color: c.text }]}>
					{[district, d.city].filter(Boolean).join(", ")}
				</Text>
				{d.landmark ? (
					<Text style={[styles.meta, { color: c.muted }]}>{d.landmark}</Text>
				) : null}
			</View>
		</OrderSheetCard>
	);
}

const styles = StyleSheet.create({
	strong: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.bodySemibold },
	body: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.body },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	hang: { marginTop: -4 },
	block: { gap: 2 },
	party: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: 44,
	},
	partyLabel: { flex: 1, fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	partyValue: {
		flexShrink: 1,
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
		textAlign: "right",
		textDecorationLine: "underline",
	},
});
