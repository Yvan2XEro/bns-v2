import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
import { purchaseStatusKey } from "@/src/lib/purchaseActions";
import type { OrderListEntry } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";

export function PurchaseRow({ entry }: { entry: OrderListEntry }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const number = t("purchases.orderNumber", { number: entry.orderNumber });

	return (
		<Pressable
			onPress={() => router.push(`/purchases/${entry.id}`)}
			accessibilityRole="button"
			accessibilityLabel={`${entry.firstItemTitle}, ${number}`}
			style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
		>
			{entry.firstItemImageUrl ? (
				<Image
					source={{ uri: entry.firstItemImageUrl }}
					style={styles.thumb}
					contentFit="cover"
				/>
			) : (
				<View style={[styles.thumb, { backgroundColor: c.neutralSoft }]} />
			)}
			<View style={styles.main}>
				<Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
					{entry.firstItemTitle}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
					{number} · {entry.shopName}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
					{t("purchases.placedOn", {
						date: formatOrderDate(entry.placedAt, lang),
					})}{" "}
					· {t("purchases.itemCount", { count: entry.itemCount })}
				</Text>
			</View>
			<View style={styles.side}>
				<Text style={[styles.total, { color: c.text }]}>
					{formatXaf(entry.total, lang)}
				</Text>
				<View style={[styles.pill, { backgroundColor: c.primarySoft }]}>
					<Text style={[styles.pillText, { color: c.primary }]}>
						{t(purchaseStatusKey(entry.status))}
					</Text>
				</View>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 12,
		minHeight: 44,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	thumb: { width: 56, height: 56, borderRadius: 12 },
	main: { flex: 1, minWidth: 0, gap: 2 },
	title: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	side: { alignItems: "flex-end", gap: 6 },
	total: { fontSize: 14, fontFamily: Fonts.bodyBold },
	pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
	pillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
});
