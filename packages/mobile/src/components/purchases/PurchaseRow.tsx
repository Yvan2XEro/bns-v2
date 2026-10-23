import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { formatOrderDate } from "@/src/lib/orderMoney";
import {
	type PurchaseStatusTone,
	purchasePaymentKey,
	purchaseStatusKey,
	purchaseStatusTone,
} from "@/src/lib/purchaseActions";
import { purchaseLiveArrival } from "@/src/lib/shipmentTracking";
import type { OrderListEntry, OrderStatusName } from "@/src/types/order";
import { LevelBadge } from "../shop/LevelBadge";
import { ShopAvatar } from "../shop/ShopAvatar";
import { useShopTheme } from "../shop/theme";

const TONES: Record<
	PurchaseStatusTone,
	{ light: [string, string]; dark: [string, string] }
> = {
	neutral: { light: ["#f1f5f9", "#475569"], dark: ["#1e293b", "#cbd5e1"] },
	progress: { light: ["#dbeafe", "#1e40af"], dark: ["#172554", "#93c5fd"] },
	success: { light: ["#dcfce7", "#166534"], dark: ["#052e16", "#86efac"] },
	danger: { light: ["#fee2e2", "#991b1b"], dark: ["#450a0a", "#fca5a5"] },
};

/** The buyer-facing status as a tinted pill with a dot. */
export function PurchaseStatusPill({ status }: { status: OrderStatusName }) {
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const [bg, fg] = TONES[purchaseStatusTone(status)][isDark ? "dark" : "light"];
	return (
		<View style={[styles.pill, { backgroundColor: bg }]}>
			<View style={[styles.dot, { backgroundColor: fg }]} />
			<Text style={[styles.pillText, { color: fg }]}>
				{t(purchaseStatusKey(status))}
			</Text>
		</View>
	);
}

export function PurchaseRow({
	entry,
	onPress,
	selected,
}: {
	entry: OrderListEntry;
	onPress: () => void;
	/** Open in the detail pane beside the list. */
	selected?: boolean;
}) {
	const c = useShopTheme();
	const selectedStyle = useSelectedRowStyle()(selected);
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const number = t("purchases.orderNumber", { number: entry.orderNumber });
	const paymentKey = purchasePaymentKey(entry);
	const liveArrival = purchaseLiveArrival(entry);

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${entry.firstItemTitle}, ${number}`}
			accessibilityState={{ selected: Boolean(selected) }}
			style={({ pressed }) => [
				styles.card,
				{ backgroundColor: c.card, borderColor: c.border },
				selectedStyle,
				pressed && styles.pressed,
			]}
		>
			{entry.firstItemImageUrl ? (
				<Image
					source={{ uri: entry.firstItemImageUrl }}
					style={styles.thumb}
					contentFit="cover"
				/>
			) : (
				<View
					style={[
						styles.thumb,
						styles.thumbEmpty,
						{ backgroundColor: c.primarySoft },
					]}
				>
					<Ionicons name="bag-handle-outline" size={22} color={c.primary} />
				</View>
			)}
			<View style={styles.main}>
				<View style={styles.topRow}>
					<View style={styles.shop}>
						<ShopAvatar
							name={entry.shopName}
							logo={entry.shopLogoUrl}
							size={20}
							radius={6}
						/>
						<Text
							style={[styles.shopName, { color: c.text }]}
							numberOfLines={1}
						>
							{entry.shopName}
						</Text>
						<LevelBadge badge={entry.shopBadge} size="sm" />
					</View>
					<PurchaseStatusPill status={entry.status} />
				</View>
				<Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
					{entry.firstItemTitle}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
					{entry.orderNumber} · {formatOrderDate(entry.placedAt, lang)}
				</Text>
				<Text style={[styles.total, { color: c.text }]}>
					{formatPrice(entry.total, lang)}
					<Text style={[styles.meta, { color: c.muted }]}>
						{" · "}
						{t("purchases.itemCount", { count: entry.itemCount })}
						{paymentKey ? ` · ${t(paymentKey)}` : ""}
					</Text>
				</Text>
				{liveArrival ? (
					<View style={styles.arrival}>
						<Ionicons name="time-outline" size={14} color={c.primary} />
						<Text style={[styles.arrivalText, { color: c.primary }]}>
							{t("purchases.arrivalLive", { time: liveArrival })}
						</Text>
					</View>
				) : null}
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		gap: 12,
		padding: 14,
		borderRadius: 18,
		borderWidth: 1,
	},
	pressed: { opacity: 0.85 },
	thumb: { width: 56, height: 56, borderRadius: 14 },
	thumbEmpty: { alignItems: "center", justifyContent: "center" },
	main: { flex: 1, minWidth: 0, gap: 3 },
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		marginBottom: 2,
	},
	shop: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
	shopName: { fontSize: 12, fontFamily: Fonts.bodySemibold, flexShrink: 1 },
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 999,
		paddingHorizontal: 9,
		paddingVertical: 3,
	},
	dot: { width: 6, height: 6, borderRadius: 3 },
	pillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	title: { fontSize: 15, fontFamily: Fonts.displayBold, lineHeight: 20 },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	total: { fontSize: 14, fontFamily: Fonts.bodyBold },
	arrival: { flexDirection: "row", alignItems: "center", gap: 4 },
	arrivalText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
