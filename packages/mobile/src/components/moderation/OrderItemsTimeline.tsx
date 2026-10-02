import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
import {
	ACTOR_KEYS,
	reasonKey,
	timelineEventKey,
} from "@/src/lib/staffOrderSheet";
import type { OrderView } from "@/src/types/order";
import { OrderSheetCard } from "./OrderSheetCards";
import type { ModerationPalette, Translate } from "./theme";

interface Props {
	order: OrderView;
	locale: "fr" | "en";
	c: ModerationPalette;
	t: Translate;
}

export function OrderItemsCard({ order, locale, c, t }: Props) {
	return (
		<OrderSheetCard title={t("moderationOrder.itemsTitle")} c={c}>
			{order.items.map((item) => (
				<View key={item.id} style={styles.row}>
					<View style={{ flex: 1 }}>
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
					<Text style={[styles.text, { color: c.text }]}>
						{formatXaf(item.lineSubtotal, locale)}
					</Text>
				</View>
			))}
		</OrderSheetCard>
	);
}

/** The timeline exactly as the staff projection filters it — staff see every name. */
export function OrderTimelineCard({ order, locale, c, t }: Props) {
	return (
		<OrderSheetCard title={t("moderationOrder.timelineTitle")} c={c}>
			{order.timeline.map((entry) => (
				<View
					key={entry.id}
					style={[styles.entry, { borderLeftColor: c.border }]}
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
						<Text style={[styles.meta, { color: c.text }]}>{entry.note}</Text>
					) : null}
				</View>
			))}
		</OrderSheetCard>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
	text: { fontSize: 14, fontFamily: Fonts.body },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	entry: { borderLeftWidth: 2, paddingLeft: 10, gap: 2, paddingVertical: 2 },
});
