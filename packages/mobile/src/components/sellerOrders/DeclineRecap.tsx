import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	type DeclineEffect,
	declineBuyerArea,
	declineBuyerName,
	declineEffects,
} from "@/src/lib/declineRecap";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { OrderView } from "@/src/types/order";

const EFFECT_ICONS: Record<
	DeclineEffect["icon"],
	keyof typeof Ionicons.glyphMap
> = {
	refund: "wallet-outline",
	notify: "notifications-outline",
	stock: "cube-outline",
	rate: "trending-down-outline",
};

/** The order being refused and what refusing it sets off, above the reasons. */
export function DeclineRecap({
	order,
	loading,
}: {
	order: OrderView | undefined;
	loading: boolean;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";

	if (!order) {
		return loading ? (
			<ActivityIndicator color={c.primary} style={styles.loading} />
		) : null;
	}

	const total = formatPrice(order.amounts.total, lang);
	const area = declineBuyerArea(order);
	const meta = [order.orderNumber, declineBuyerName(order), area]
		.filter(Boolean)
		.join(" · ");

	return (
		<View style={styles.wrap}>
			<View
				style={[
					styles.recap,
					{ backgroundColor: c.neutralSoft, borderColor: c.border },
				]}
			>
				{order.items.map((item) => (
					<View key={item.id} style={styles.itemRow}>
						<Text
							style={[styles.itemTitle, { color: c.text }]}
							numberOfLines={1}
						>
							{item.title}
							{item.variantLabel ? ` · ${item.variantLabel}` : ""}
						</Text>
						<Text style={[styles.itemQty, { color: c.muted }]}>
							×{item.quantity}
						</Text>
					</View>
				))}
				<View style={styles.metaRow}>
					<Text style={[styles.meta, { color: c.muted }]} numberOfLines={2}>
						{meta}
					</Text>
					<Text style={[styles.total, { color: c.text }]}>{total}</Text>
				</View>
			</View>

			<View accessibilityRole="list" style={styles.effects}>
				{declineEffects(order, total).map((effect) => (
					<View key={effect.key} style={styles.effectRow}>
						<Ionicons
							name={EFFECT_ICONS[effect.icon]}
							size={16}
							color={effect.icon === "rate" ? c.warningText : c.muted}
						/>
						<Text style={[styles.effectText, { color: c.body }]}>
							{t(effect.key, effect.values)}
						</Text>
					</View>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	loading: { marginVertical: 12 },
	wrap: { gap: 12, marginBottom: 4 },
	recap: {
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
		gap: 6,
	},
	itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	itemTitle: { flex: 1, fontSize: 14, fontFamily: Fonts.bodySemibold },
	itemQty: { fontSize: 13, fontFamily: Fonts.body },
	metaRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 8,
		marginTop: 2,
	},
	meta: { flex: 1, fontSize: 12, fontFamily: Fonts.body },
	total: { fontSize: 14, fontFamily: Fonts.displayBold },
	effects: { gap: 8 },
	effectRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
	effectText: { flex: 1, fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
});
