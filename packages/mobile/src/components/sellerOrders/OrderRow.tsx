import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
import { statusLabelKey } from "@/src/lib/orderStatus";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { rowAcceptBy } from "@/src/lib/sellerOrders";
import type { OrderListEntry } from "@/src/types/order";
import { AcceptCountdown } from "./AcceptCountdown";
import { TierBadge } from "./TierBadge";

export function OrderRow({
	order,
	onPress,
}: {
	order: OrderListEntry;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const image = resolveImageUrl(order.firstItemImageUrl);
	const acceptBy = rowAcceptBy(order);
	const status = t(`orderStatus.${statusLabelKey(order.status, "seller")}`);

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${t("sellerOrders.orderTitle", {
				number: order.orderNumber,
			})}, ${status}`}
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			{image ? (
				<Image
					source={{ uri: image }}
					style={styles.thumb}
					contentFit="cover"
				/>
			) : (
				<View style={[styles.thumb, { backgroundColor: c.neutralSoft }]} />
			)}
			<View style={styles.body}>
				<View style={styles.line}>
					<Text style={[styles.number, { color: c.text }]} numberOfLines={1}>
						{order.orderNumber}
					</Text>
					<Text style={[styles.total, { color: c.text }]}>
						{formatXaf(order.total, lang)}
					</Text>
				</View>
				<Text style={[styles.meta, { color: c.body }]} numberOfLines={1}>
					{t("sellerOrders.itemsSummary", {
						title: order.firstItemTitle,
						count: order.itemCount,
					})}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
					{[order.recipientName, formatOrderDate(order.placedAt, lang)]
						.filter(Boolean)
						.join(" · ")}
				</Text>
				<View style={styles.line}>
					<Text style={[styles.status, { color: c.primary }]} numberOfLines={1}>
						{status}
					</Text>
					{order.phoneTier ? <TierBadge tier={order.phoneTier} /> : null}
				</View>
				{acceptBy ? <AcceptCountdown acceptBy={acceptBy} /> : null}
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		gap: 12,
		padding: 12,
		borderRadius: 14,
		borderWidth: 1,
		minHeight: 44,
	},
	thumb: { width: 56, height: 56, borderRadius: 10 },
	body: { flex: 1, gap: 3 },
	line: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	number: { flex: 1, fontSize: 15, fontFamily: Fonts.displayBold },
	total: { fontSize: 14, fontFamily: Fonts.bodyBold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	status: { flex: 1, fontSize: 12, fontFamily: Fonts.bodySemibold },
});
