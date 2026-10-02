import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { callHref, districtLabel, mapsUrl } from "@/src/lib/sellerOrders";
import type { OrderView } from "@/src/types/order";
import { TierBadge } from "./TierBadge";

/**
 * Who to call and where to go. A number the API masked (a closed order aged
 * past 30 days) gets no call button: there is no reason left to dial it.
 */
export function BuyerCard({ order }: { order: OrderView }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { delivery } = order;
	const tel = callHref(delivery);
	const maps = mapsUrl(delivery);
	const place = [districtLabel(delivery), delivery.city]
		.filter(Boolean)
		.join(", ");

	const rows: [string, string | null][] = [
		[t("sellerOrders.recipient"), delivery.recipientName],
		[t("sellerOrders.phone"), delivery.phone],
		[t("sellerOrders.address"), place || null],
		[t("sellerOrders.landmark"), delivery.landmark],
		[t("sellerOrders.instructions"), delivery.instructions],
	];

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.head}>
				<Text style={[styles.title, { color: c.text }]}>
					{delivery.method === "pickup"
						? t("sellerOrders.pickupBlock")
						: t("sellerOrders.deliveryBlock")}
				</Text>
				{order.risk ? <TierBadge tier={order.risk.phoneTier} /> : null}
			</View>
			{rows.map(([label, value]) =>
				value ? (
					<View key={label} style={styles.row}>
						<Text style={[styles.label, { color: c.muted }]}>{label}</Text>
						<Text style={[styles.value, { color: c.text }]}>{value}</Text>
					</View>
				) : null,
			)}
			{delivery.phoneMasked ? (
				<Text style={[styles.hint, { color: c.muted }]}>
					{t("sellerOrders.phoneMaskedReason")}
				</Text>
			) : null}
			<View style={styles.buttons}>
				{tel ? (
					<Pressable
						onPress={() => Linking.openURL(tel)}
						accessibilityRole="link"
						accessibilityLabel={t("sellerOrders.callBuyer")}
						style={[styles.button, { backgroundColor: c.primary }]}
					>
						<Ionicons name="call" size={18} color="#fff" />
						<Text style={[styles.buttonText, { color: "#fff" }]}>
							{t("sellerOrders.callBuyer")}
						</Text>
					</Pressable>
				) : null}
				{maps ? (
					<Pressable
						onPress={() => Linking.openURL(maps)}
						accessibilityRole="link"
						accessibilityLabel={t("sellerOrders.openInMaps")}
						style={[styles.button, { borderColor: c.border, borderWidth: 1 }]}
					>
						<Ionicons name="map-outline" size={18} color={c.primary} />
						<Text style={[styles.buttonText, { color: c.primary }]}>
							{t("sellerOrders.openInMaps")}
						</Text>
					</Pressable>
				) : (
					<Text style={[styles.hint, { color: c.muted }]}>
						{t("sellerOrders.noLocation")}
					</Text>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
	head: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	title: { fontSize: 16, fontFamily: Fonts.displayBold },
	row: { gap: 2 },
	label: { fontSize: 12, fontFamily: Fonts.body },
	value: { fontSize: 14, fontFamily: Fonts.bodyMedium },
	hint: { fontSize: 12, fontFamily: Fonts.body },
	buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	button: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: 44,
		paddingHorizontal: 14,
		borderRadius: 12,
	},
	buttonText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
