import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
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
				style={styles.main}
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
							{formatPrice(order.total, lang)}
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
						<Text
							style={[styles.status, { color: c.primary }]}
							numberOfLines={1}
						>
							{status}
						</Text>
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
					style={[styles.error, { color: c.danger }]}
				>
					{error}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: { gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
	main: { flexDirection: "row", gap: 12, minHeight: 44 },
	actions: { flexDirection: "row", gap: 10 },
	action: { flex: 1 },
	error: { fontSize: 13, fontFamily: Fonts.body },
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
