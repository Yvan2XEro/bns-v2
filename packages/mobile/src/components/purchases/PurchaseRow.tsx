import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
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
import { inkOf } from "../checkout/fill";
import { LevelBadge } from "../shop/LevelBadge";
import { ShopAvatar } from "../shop/ShopAvatar";
import { useShopTheme } from "../shop/theme";

const TONES: Record<
	PurchaseStatusTone,
	{ light: [string, string]; dark: [string, string] }
> = {
	neutral: {
		light: [Colors.light.well, Colors.light.body],
		dark: [Colors.dark.card, Colors.dark.body],
	},
	progress: {
		light: [Colors.light.primaryTint, Colors.light.link],
		dark: [Colors.dark.primaryTint, Colors.dark.link],
	},
	success: {
		light: [Colors.light.successTint, Colors.light.successText],
		dark: [Colors.dark.successTint, Colors.dark.successText],
	},
	danger: {
		light: [Colors.light.dangerTint, Colors.light.dangerText],
		dark: [Colors.dark.dangerTint, Colors.dark.dangerText],
	},
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
	// The one buyer task the list can see: a protected order still to pay
	// before it lapses. Flagged on the row so nobody has to open each order.
	const mustPay =
		entry.paymentMethod === "mobile_money" &&
		entry.status === "placed" &&
		(entry.paymentStatus === "unpaid" ||
			entry.paymentStatus === "awaiting_payment");
	const todo = mustPay ? t("purchases.todoPay") : null;

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${todo ? `${todo}, ` : ""}${entry.firstItemTitle}, ${number}, ${t(purchaseStatusKey(entry.status))}, ${formatPrice(entry.total, lang)}`}
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
					<Ionicons name="bag-handle-outline" size={22} color={inkOf(c)} />
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
				<View style={styles.totalRow}>
					<Text style={[styles.total, { color: c.text }]}>
						{formatPrice(entry.total, lang)}
					</Text>
					<Text
						style={[styles.meta, styles.totalMeta, { color: c.muted }]}
						numberOfLines={1}
					>
						{t("purchases.itemCount", { count: entry.itemCount })}
						{paymentKey ? ` · ${t(paymentKey)}` : ""}
					</Text>
				</View>
				{todo ? (
					<View style={styles.arrival}>
						<Ionicons name="alert-circle" size={14} color={c.warningText} />
						<Text style={[styles.arrivalText, { color: c.warningText }]}>
							{todo}
						</Text>
					</View>
				) : null}
				{liveArrival ? (
					<View style={styles.arrival}>
						<Ionicons name="time-outline" size={14} color={inkOf(c)} />
						<Text style={[styles.arrivalText, { color: inkOf(c) }]}>
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
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	pressed: { opacity: 0.85 },
	thumb: { width: 64, height: 64, borderRadius: 12 },
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
	shopName: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 999,
		paddingHorizontal: 9,
		paddingVertical: 3,
	},
	dot: { width: 6, height: 6, borderRadius: 3 },
	pillText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
	title: { fontSize: 15, fontFamily: Fonts.bodySemibold, lineHeight: 20 },
	meta: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },
	totalRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 8,
		marginTop: 2,
	},
	total: {
		fontSize: 18,
		lineHeight: 24,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.3,
		fontVariant: ["tabular-nums"],
	},
	totalMeta: { flexShrink: 1 },
	arrival: { flexDirection: "row", alignItems: "center", gap: 4 },
	arrivalText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
});
