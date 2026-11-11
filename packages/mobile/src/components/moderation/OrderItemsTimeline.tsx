import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatPrice } from "@/src/lib/market";
import { formatOrderDate } from "@/src/lib/orderMoney";
import {
	ACTOR_KEYS,
	reasonKey,
	timelineEventKey,
} from "@/src/lib/staffOrderSheet";
import type { OrderView } from "@/src/types/order";
import { OrderSheetCard } from "./OrderSheetCards";
import type { ModerationPalette, Translate } from "./theme";
import { tonesOf } from "./tones";

interface Props {
	order: OrderView;
	locale: "fr" | "en";
	c: ModerationPalette;
	t: Translate;
}

export function OrderItemsCard({ order, locale, c, t }: Props) {
	return (
		<OrderSheetCard title={t("moderationOrder.itemsTitle")}>
			{/* One block, so the card's gap does not stack on the row padding. */}
			<View>
				{order.items.map((item, index) => (
					<View
						key={item.id}
						style={[
							styles.row,
							index > 0 && styles.divided,
							index === 0 && styles.rowFirst,
							index === order.items.length - 1 && styles.rowLast,
							{ borderTopColor: c.border },
						]}
					>
						<View style={styles.flex}>
							<Text style={[styles.text, { color: c.text }]}>
								{t("moderationOrder.itemLine", {
									quantity: item.quantity,
									title: item.title,
								})}
							</Text>
							{item.variantLabel ? (
								<Text style={[styles.meta, { color: c.muted }]}>
									{item.variantLabel}
								</Text>
							) : null}
						</View>
						<Text style={[styles.amount, { color: c.text }]}>
							{formatPrice(item.lineSubtotal, locale)}
						</Text>
					</View>
				))}
			</View>
		</OrderSheetCard>
	);
}

/**
 * The timeline exactly as the staff projection filters it — staff see every
 * name. Drawn as dots on a hairline rail, newest last, as the API orders it.
 */
export function OrderTimelineCard({ order, locale, c, t }: Props) {
	const k = tonesOf(c);
	const last = order.timeline.length - 1;
	return (
		<OrderSheetCard title={t("moderationOrder.timelineTitle")}>
			{/* The rail runs unbroken from dot to dot: the entries sit in one
			    block, out of reach of the card's gap. */}
			<View>
				{order.timeline.map((entry, index) => (
					<View key={entry.id} style={styles.entry}>
						<View style={styles.rail}>
							<View
								style={[
									styles.dot,
									{
										backgroundColor: index === last ? k.linkText : c.card,
										borderColor: index === last ? k.linkText : c.muted,
									},
								]}
							/>
							{index < last ? (
								<View style={[styles.line, { backgroundColor: c.border }]} />
							) : null}
						</View>
						<View
							style={[styles.entryBody, index === last && styles.entryLast]}
						>
							<Text style={[styles.text, { color: c.text }]}>
								{t(timelineEventKey(entry.type))}
							</Text>
							<Text style={[styles.meta, { color: c.muted }]}>
								{[
									formatOrderDate(entry.at, locale),
									entry.actorName ?? t(ACTOR_KEYS[entry.actorType]),
								].join(" · ")}
							</Text>
							{entry.reason ? (
								<Text style={[styles.meta, { color: c.text }]}>
									{t(reasonKey(entry.reason))}
								</Text>
							) : null}
							{entry.note ? (
								<Text style={[styles.meta, { color: c.text }]}>
									{entry.note}
								</Text>
							) : null}
						</View>
					</View>
				))}
			</View>
		</OrderSheetCard>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 10,
	},
	rowFirst: { paddingTop: 0 },
	rowLast: { paddingBottom: 0 },
	divided: { borderTopWidth: StyleSheet.hairlineWidth },
	text: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.body },
	amount: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.displayBold },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	entry: { flexDirection: "row", gap: 12 },
	rail: { width: 12, alignItems: "center" },
	dot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		borderWidth: 2,
		marginTop: 5,
	},
	line: { width: StyleSheet.hairlineWidth * 2, flex: 1, marginTop: 2 },
	entryBody: { flex: 1, gap: 2, paddingBottom: 16 },
	entryLast: { paddingBottom: 0 },
});
