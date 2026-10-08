import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useShopInsights } from "@/src/hooks/useShopInsights";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import { can } from "@/src/lib/shopRoles";
import type { ShopRole } from "@/src/types/api";
import type { ShopInsightsView } from "../../../../api/src/types/shopInsights";

function actionLabel(
	t: (key: string, options?: Record<string, number | string>) => string,
	action: ShopInsightsView["actions"][number],
) {
	switch (action.type) {
		case "awaiting_reply":
			return t("sellerInsights.action_awaiting_reply", {
				count: action.count ?? 0,
			});
		case "out_of_stock_views":
			return t("sellerInsights.action_out_of_stock_views", {
				count: action.count ?? 0,
			});
		case "restock":
			return t("sellerInsights.action_restock");
		case "cod_refusal_rate":
			return t("sellerInsights.action_cod_refusal_rate");
		case "seller_cancellation_rate":
			return t("sellerInsights.action_seller_cancellation_rate");
		case "low_conversion":
			return t("sellerInsights.action_low_conversion");
		case "slow_response":
			return t("sellerInsights.action_slow_response");
	}
}

export function SellerInsightsSummary({
	shopId,
	role,
	enabled,
}: {
	shopId: string;
	role: ShopRole | null;
	enabled: boolean;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const canRead = enabled && can(role, "costs.view");
	const query = useShopInsights(canRead ? shopId : undefined, "7d");
	if (!canRead || !query.data) return null;
	const view = query.data;
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const response = view.responseTime.medianBucket
		? t(`sellerInsights.bucket_${view.responseTime.medianBucket}`)
		: t("sellerInsights.noResponse");
	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.top}>
				<View style={styles.heading}>
					<Ionicons name="analytics-outline" size={20} color={c.primary} />
					<Text style={[styles.title, { color: c.text }]}>
						{t("sellerInsights.title")}
					</Text>
				</View>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("sellerInsights.open")}
					style={[styles.openButton, { backgroundColor: c.primarySoft }]}
					onPress={() => router.push("./insights")}
				>
					<Text style={[styles.openText, { color: c.primary }]}>
						{t("sellerInsights.open")}
					</Text>
				</Pressable>
			</View>
			<View style={styles.metrics}>
				<Metric
					label={t("sellerInsights.gmv")}
					value={formatXaf(view.totals.current.gmvDelivered, lang)}
					delta={t("sellerInsights.previousDelta", {
						value: signedMoney(view.totals.delta.gmvDelivered, lang),
					})}
					palette={c}
				/>
				<Metric
					label={t("sellerInsights.orders")}
					value={String(view.totals.current.ordersDelivered)}
					delta={t("sellerInsights.previousDelta", {
						value: signedCount(view.totals.delta.ordersDelivered, lang),
					})}
					palette={c}
				/>
				<Metric
					label={t("sellerInsights.response")}
					value={response}
					palette={c}
				/>
			</View>
			{view.actions.slice(0, 2).map((action, index) => (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={actionLabel(t, action)}
					key={`${action.type}-${index}`}
					onPress={() =>
						router.push(
							action.type === "awaiting_reply" ? "./inbox" : "./insights",
						)
					}
					style={[styles.action, { borderColor: c.border }]}
				>
					<Text style={[styles.actionText, { color: c.body }]}>
						{actionLabel(t, action)}
					</Text>
					<Ionicons name="chevron-forward" size={16} color={c.muted} />
				</Pressable>
			))}
		</View>
	);
}

function Metric({
	label,
	value,
	delta,
	palette,
}: {
	label: string;
	value: string;
	delta?: string;
	palette: ReturnType<typeof useShopTheme>;
}) {
	return (
		<View style={styles.metric}>
			<Text numberOfLines={1} style={[styles.label, { color: palette.muted }]}>
				{label}
			</Text>
			<Text numberOfLines={1} style={[styles.value, { color: palette.text }]}>
				{value}
			</Text>
			{delta ? (
				<Text
					numberOfLines={2}
					style={[styles.delta, { color: palette.muted }]}
				>
					{delta}
				</Text>
			) : null}
		</View>
	);
}

function signedMoney(value: number, locale: string): string {
	const amount = new Intl.NumberFormat(locale, {
		maximumFractionDigits: 0,
	}).format(Math.abs(value));
	return `${value > 0 ? "+" : value < 0 ? "−" : ""}${amount} XAF`;
}

function signedCount(value: number, locale: string): string {
	const amount = new Intl.NumberFormat(locale, {
		maximumFractionDigits: 0,
	}).format(Math.abs(value));
	return `${value > 0 ? "+" : value < 0 ? "−" : ""}${amount}`;
}

const styles = StyleSheet.create({
	card: { borderRadius: 18, borderWidth: 1, padding: 15, gap: 12 },
	top: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	heading: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
	title: { fontSize: 15, fontFamily: Fonts.displayBold },
	openButton: {
		minHeight: 40,
		justifyContent: "center",
		paddingHorizontal: 12,
		borderRadius: 10,
	},
	openText: { fontSize: 12, fontFamily: Fonts.displayBold },
	metrics: { flexDirection: "row", gap: 10 },
	metric: { flex: 1, minWidth: 0, gap: 5 },
	label: { fontSize: 11, fontFamily: Fonts.body },
	value: { fontSize: 13, fontFamily: Fonts.displayBold },
	delta: { fontSize: 10, fontFamily: Fonts.body },
	action: {
		minHeight: 44,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 10,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
	},
	actionText: { flex: 1, fontSize: 12, fontFamily: Fonts.body },
});
