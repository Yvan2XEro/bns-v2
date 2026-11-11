import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { dangerInk } from "@/src/components/shop/ink";
import { AmountTag, StatusTag } from "@/src/components/shop/Tags";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { statusLabelKey } from "@/src/lib/orderStatus";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { type RowQuickAction, rowAcceptBy } from "@/src/lib/sellerOrders";
import type { OrderListEntry } from "@/src/types/order";
import { AcceptCountdown } from "./AcceptCountdown";
import { SheetButton } from "./FormBits";
import { orderStatusTone } from "./statusTone";
import { TierBadge } from "./TierBadge";

export function OrderRow({
	order,
	onPress,
	actions = [],
	onAccept,
	onDecline,
	accepting,
	busy,
	error,
	selected,
}: {
	order: OrderListEntry;
	onPress: () => void;
	/** `rowQuickActions` for this row; empty renders the plain card. */
	actions?: readonly RowQuickAction[];
	onAccept?: () => void;
	onDecline?: () => void;
	accepting?: boolean;
	busy?: boolean;
	error?: string | null;
	/** Open in the detail pane beside the list. */
	selected?: boolean;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const image = resolveImageUrl(order.firstItemImageUrl);
	const selectedStyle = useSelectedRowStyle()(selected);
	const acceptBy = rowAcceptBy(order);
	const status = t(`orderStatus.${statusLabelKey(order.status, "seller")}`);

	return (
		<View
			style={[
				styles.card,
				{ backgroundColor: c.card, borderColor: c.border },
				selectedStyle,
			]}
		>
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				accessibilityState={{ selected: Boolean(selected) }}
				accessibilityLabel={`${t("sellerOrders.orderTitle", {
					number: order.orderNumber,
				})}, ${status}`}
				style={({ pressed }) => [styles.main, pressed && styles.pressed]}
			>
				{image ? (
					<Image
						source={{ uri: image }}
						style={styles.thumb}
						contentFit="cover"
					/>
				) : (
					<View
						style={[
							styles.thumb,
							styles.thumbEmpty,
							{ backgroundColor: c.neutralSoft },
						]}
					>
						<Ionicons name="cube-outline" size={22} color={c.muted} />
					</View>
				)}
				<View style={styles.body}>
					<View style={styles.line}>
						<Text style={[styles.number, { color: c.text }]} numberOfLines={1}>
							{order.orderNumber}
						</Text>
						<AmountTag label={formatPrice(order.total, lang)} size="sm" />
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
					<View style={[styles.line, styles.statusLine]}>
						<StatusTag label={status} tone={orderStatusTone(order.status)} />
						{order.phoneTier ? <TierBadge tier={order.phoneTier} /> : null}
					</View>
					{acceptBy ? <AcceptCountdown acceptBy={acceptBy} /> : null}
				</View>
			</Pressable>
			{actions.length > 0 ? (
				<View style={styles.actions}>
					{actions.includes("decline") ? (
						<View style={styles.action}>
							<SheetButton
								label={t("sellerOrders.decline")}
								tone="danger"
								outline
								disabled={busy}
								onPress={() => onDecline?.()}
							/>
						</View>
					) : null}
					{actions.includes("accept") ? (
						<View style={styles.action}>
							<SheetButton
								label={t("sellerOrders.accept")}
								pending={accepting}
								disabled={busy}
								onPress={() => onAccept?.()}
							/>
						</View>
					) : null}
				</View>
			) : null}
			{error ? (
				<Text
					accessibilityRole="alert"
					style={[styles.error, { color: dangerInk(c) }]}
				>
					{error}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		gap: 12,
		padding: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
	},
	main: { flexDirection: "row", gap: 12, minHeight: 48 },
	pressed: { opacity: 0.7 },
	actions: { flexDirection: "row", gap: 10 },
	action: { flex: 1 },
	error: { fontSize: 13, fontFamily: Fonts.body },
	thumb: { width: 60, height: 60, borderRadius: 10 },
	thumbEmpty: { alignItems: "center", justifyContent: "center" },
	body: { flex: 1, gap: 3 },
	line: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	number: {
		flex: 1,
		fontSize: 16,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	statusLine: { justifyContent: "flex-start", marginTop: 3 },
});
