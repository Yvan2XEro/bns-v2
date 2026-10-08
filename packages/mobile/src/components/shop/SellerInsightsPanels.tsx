import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { sparklineHeights } from "@/src/lib/insightChart";
import { formatXaf } from "@/src/lib/variants";
import type { ShopInsightsView } from "../../../../api/src/types/shopInsights";

export function InsightsHeader({
	view,
	period,
	onPeriod,
}: {
	view: ShopInsightsView;
	period: "7d" | "30d" | "90d";
	onPeriod: (period: "7d" | "30d" | "90d") => void;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const periodTabs = [
		{ value: "7d", label: t("sellerInsights.period7d") },
		{ value: "30d", label: t("sellerInsights.period30d") },
		{ value: "90d", label: t("sellerInsights.period90d") },
	] as const;
	const cards = [
		{
			label: t("sellerInsights.views"),
			value: new Intl.NumberFormat(lang).format(view.totals.current.views),
			values: view.daily.map((day) => day.views),
			delta: t("sellerInsights.previousDelta", {
				value: signedCount(view.totals.delta.views, lang),
			}),
			color: c.primary,
		},
		{
			label: t("sellerInsights.placed"),
			value: new Intl.NumberFormat(lang).format(
				view.totals.current.ordersPlaced,
			),
			values: view.daily.map((day) => day.ordersPlaced),
			delta: t("sellerInsights.previousDelta", {
				value: signedCount(view.totals.delta.ordersPlaced, lang),
			}),
			color: c.sell,
		},
		{
			label: t("sellerInsights.gmv"),
			value: formatXaf(view.totals.current.gmvDelivered, lang),
			values: view.daily.map((day) => day.gmvDelivered),
			delta: t("sellerInsights.previousDelta", {
				value: signed(view.totals.delta.gmvDelivered, lang),
			}),
			color: c.success,
		},
	];
	return (
		<View style={styles.header}>
			<View style={styles.titleRow}>
				<View style={{ flex: 1 }}>
					<Text style={[styles.title, { color: c.text }]}>
						{t("sellerInsights.title")}
					</Text>
				</View>
			</View>
			<View
				style={[
					styles.periods,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				{periodTabs.map((tab) => (
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ selected: period === tab.value }}
						key={tab.value}
						onPress={() => onPeriod(tab.value)}
						style={[
							styles.period,
							{
								backgroundColor:
									period === tab.value ? c.primary : "transparent",
							},
						]}
					>
						<Text
							style={[
								styles.periodText,
								{ color: period === tab.value ? "#fff" : c.body },
							]}
						>
							{tab.label}
						</Text>
					</Pressable>
				))}
			</View>
			<View style={styles.metrics}>
				{cards.map((card) => (
					<InsightMetric {...card} key={card.label} />
				))}
			</View>
			<View
				style={[
					styles.panel,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<PanelTitle title={t("sellerInsights.totals")} />
				<InlineValue
					label={t("sellerInsights.conversations")}
					value={periodTotal(
						view.totals.current.conversationsStarted,
						view.totals.delta.conversationsStarted,
						lang,
						t,
					)}
				/>
				<InlineValue
					label={t("sellerInsights.delivered")}
					value={periodTotal(
						view.totals.current.ordersDelivered,
						view.totals.delta.ordersDelivered,
						lang,
						t,
					)}
				/>
				<InlineValue
					label={t("sellerInsights.units")}
					value={periodTotal(
						view.totals.current.unitsDelivered,
						view.totals.delta.unitsDelivered,
						lang,
						t,
					)}
				/>
				<InlineValue
					label={t("sellerInsights.response")}
					value={responseLabel(view.responseTime.medianBucket, t)}
				/>
				<InlineValue
					label={t("sellerInsights.conversion")}
					value={percentage(view.funnel.conversion, t)}
				/>
			</View>
			<View
				style={[
					styles.panel,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<PanelTitle title={t("sellerInsights.funnel")} />
				<FunnelLine
					label={t("sellerInsights.views")}
					value={view.funnel.views}
					total={view.funnel.views}
				/>
				<FunnelLine
					label={t("sellerInsights.engaged")}
					value={view.funnel.engaged}
					total={view.funnel.views}
				/>
				<FunnelLine
					label={t("sellerInsights.placed")}
					value={view.funnel.ordersPlaced}
					total={view.funnel.views}
				/>
				<FunnelLine
					label={t("sellerInsights.delivered")}
					value={view.funnel.ordersDelivered}
					total={view.funnel.views}
				/>
			</View>
			<View
				style={[
					styles.panel,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<PanelTitle title={t("sellerInsights.rates")} />
				<InlineValue
					label={t("sellerInsights.sellerCancellation")}
					value={percentage(view.rates.sellerCancellation, t)}
				/>
				<InlineValue
					label={t("sellerInsights.codRefusal")}
					value={percentage(view.rates.codRefusal, t)}
				/>
				<InlineValue
					label={t("sellerInsights.deliveryCompletion")}
					value={percentage(view.rates.deliveryCompletion, t)}
				/>
				<InlineValue
					label={t("sellerInsights.withinHour")}
					value={percentage(view.responseTime.answeredWithinOneHour, t)}
				/>
				<InlineValue
					label={t("sellerInsights.awaiting")}
					value={String(view.responseTime.awaitingReply)}
				/>
			</View>
			<View
				style={[
					styles.panel,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<PanelTitle title={t("sellerInsights.stock")} />
				<InlineValue
					label={t("sellerInsights.turnover")}
					value={percentage(view.stock.turnover, t)}
				/>
				<InlineValue
					label={t("sellerInsights.restock")}
					value={String(view.stock.restock.length)}
				/>
				<InlineValue
					label={t("sellerInsights.outOfStock")}
					value={String(view.stock.outOfStockWithViews.length)}
				/>
			</View>
			<PanelTitle title={t("sellerInsights.topProducts")} />
		</View>
	);
}

export function InsightProductRow({
	product,
}: {
	product: ShopInsightsView["topProducts"][number];
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	return (
		<View
			style={[
				styles.listRow,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<View style={{ flex: 1 }}>
				<Text numberOfLines={1} style={[styles.rowTitle, { color: c.text }]}>
					{product.productTitle}
				</Text>
				<Text style={[styles.muted, { color: c.muted }]}>
					{t("sellerInsights.views")}: {product.views} ·{" "}
					{t("sellerInsights.placed")}: {product.ordersPlaced}
				</Text>
			</View>
			<Text style={[styles.rowTitle, { color: c.text }]}>
				{formatXaf(product.gmvDelivered, i18n.language)}
			</Text>
		</View>
	);
}

export function InsightsFooter({
	view,
	onAction,
}: {
	view: ShopInsightsView;
	onAction: (action: ShopInsightsView["actions"][number]) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View style={styles.footer}>
			{view.stock.restock.slice(0, 5).map((item) => (
				<Text key={item.variantId} style={[styles.muted, { color: c.muted }]}>
					{item.productTitle} ·{" "}
					{t("sellerInsights.daysCover", { days: item.daysOfCover })}
				</Text>
			))}
			{view.stock.restock.length === 0 ? (
				<Text style={[styles.muted, { color: c.muted }]}>
					{t("sellerInsights.noRestock")}
				</Text>
			) : null}
			<PanelTitle title={t("sellerInsights.actions")} />
			{view.actions.length === 0 ? (
				<Text style={[styles.muted, { color: c.muted }]}>
					{t("sellerInsights.noActions")}
				</Text>
			) : (
				view.actions.map((action, index) => (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={actionLabel(action, t)}
						key={`${action.type}-${index}`}
						onPress={() => onAction(action)}
						style={[styles.action, { borderColor: c.border }]}
					>
						<Text style={[styles.actionText, { color: c.body }]}>
							{actionLabel(action, t)}
						</Text>
						<Ionicons name="chevron-forward" size={16} color={c.muted} />
					</Pressable>
				))
			)}
		</View>
	);
}

function actionLabel(
	action: ShopInsightsView["actions"][number],
	t: (key: string, options?: Record<string, number | string>) => string,
) {
	const values = { count: action.count ?? 0 };
	return t(`sellerInsights.action_${action.type}`, values);
}

function FunnelLine({
	label,
	value,
	total,
}: {
	label: string;
	value: number;
	total: number;
}) {
	const c = useShopTheme();
	const width = total > 0 ? Math.max(2, (value / total) * 100) : 0;
	return (
		<View style={styles.funnelLine}>
			<View style={styles.inline}>
				<Text style={[styles.muted, { color: c.muted }]}>{label}</Text>
				<Text style={[styles.muted, { color: c.text }]}>{value}</Text>
			</View>
			<View style={[styles.track, { backgroundColor: c.neutralSoft }]}>
				<View
					style={[
						styles.fill,
						{ backgroundColor: c.primary, width: `${width}%` },
					]}
				/>
			</View>
		</View>
	);
}

function InlineValue({ label, value }: { label: string; value: string }) {
	const c = useShopTheme();
	return (
		<View style={styles.inline}>
			<Text style={[styles.muted, { color: c.muted }]}>{label}</Text>
			<Text style={[styles.inlineValue, { color: c.text }]}>{value}</Text>
		</View>
	);
}

function PanelTitle({ title }: { title: string }) {
	const c = useShopTheme();
	return <Text style={[styles.panelTitle, { color: c.text }]}>{title}</Text>;
}

function percentage(value: number | null, t: (key: string) => string): string {
	return value === null
		? t("sellerInsights.insufficient")
		: `${Math.round(value * 100)}%`;
}

function responseLabel(
	value: ShopInsightsView["responseTime"]["medianBucket"],
	t: (key: string) => string,
) {
	if (!value) return t("sellerInsights.noResponse");
	return t(`sellerInsights.bucket_${value}`);
}

function signed(value: number, locale: string): string {
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

function periodTotal(
	current: number,
	delta: number,
	locale: string,
	t: (key: string, options?: Record<string, number | string>) => string,
): string {
	return `${new Intl.NumberFormat(locale).format(current)} · ${t("sellerInsights.previousDelta", { value: signedCount(delta, locale) })}`;
}

export function InsightSparkline({
	values,
	color,
}: {
	values: readonly number[];
	color: string;
}) {
	const heights = sparklineHeights(values);
	return (
		<View style={styles.sparkline}>
			{heights.map((height, index) => (
				<View key={index} style={styles.sparkCell}>
					<View
						style={[
							styles.sparkBar,
							{
								backgroundColor: color,
								height: `${height}%`,
								minHeight: values[index] ? 3 : 0,
							},
						]}
					/>
				</View>
			))}
		</View>
	);
}

export function InsightMetric({
	label,
	value,
	delta,
	values,
	color,
}: {
	label: string;
	value: string;
	delta: string;
	values: number[];
	color: string;
}) {
	const c = useShopTheme();
	return (
		<View
			style={[
				styles.metricCard,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<Text numberOfLines={1} style={[styles.metricLabel, { color: c.muted }]}>
				{label}
			</Text>
			<Text numberOfLines={1} style={[styles.metricValue, { color: c.text }]}>
				{value}
			</Text>
			<Text numberOfLines={1} style={[styles.metricDelta, { color: c.muted }]}>
				{delta}
			</Text>
			<InsightSparkline values={values} color={color} />
		</View>
	);
}

const styles = StyleSheet.create({
	header: { gap: 12, padding: 16 },
	titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	title: { fontSize: 22, fontFamily: Fonts.displayBold },
	muted: { fontSize: 12, fontFamily: Fonts.body },
	periods: {
		flexDirection: "row",
		borderWidth: 1,
		borderRadius: 12,
		padding: 3,
	},
	period: {
		flex: 1,
		minHeight: 40,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 9,
		paddingHorizontal: 4,
	},
	periodText: { fontSize: 12, fontFamily: Fonts.displayBold },
	metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	metricCard: {
		width: "48%",
		flexGrow: 1,
		minHeight: 108,
		borderWidth: 1,
		borderRadius: 14,
		padding: 11,
		gap: 5,
	},
	metricLabel: { fontSize: 11, fontFamily: Fonts.body },
	metricValue: { fontSize: 16, fontFamily: Fonts.displayBold },
	metricDelta: { fontSize: 10, fontFamily: Fonts.body },
	panel: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
	panelTitle: { fontSize: 15, fontFamily: Fonts.displayBold, marginTop: 2 },
	funnelLine: { gap: 5 },
	inline: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 10,
	},
	inlineValue: { fontSize: 12, fontFamily: Fonts.displayBold },
	track: { height: 6, overflow: "hidden", borderRadius: 4 },
	fill: { height: "100%", borderRadius: 4 },
	listRow: {
		minHeight: 60,
		borderRadius: 12,
		borderWidth: 1,
		padding: 12,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	rowTitle: { fontSize: 12, fontFamily: Fonts.displayBold },
	footer: { paddingHorizontal: 16, paddingBottom: 36, gap: 12 },
	action: {
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
		paddingVertical: 9,
	},
	actionText: { flex: 1, fontSize: 12, fontFamily: Fonts.body },
	sparkline: {
		height: 23,
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 2,
	},
	sparkCell: { height: "100%", flex: 1, justifyContent: "flex-end" },
	sparkBar: { width: "100%", borderTopLeftRadius: 2, borderTopRightRadius: 2 },
});
