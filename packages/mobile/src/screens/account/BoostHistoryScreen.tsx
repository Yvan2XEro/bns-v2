import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
	ActivityIndicator,
	Platform,
	Pressable,
	RefreshControl,
	SectionList,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { useGroupedColors } from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { StatusTag, type StatusTone } from "@/src/components/shop/Tags";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { appDateLocale, parseDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

const PAGE_SIZE = 15;
const CHART_H = 64;
/** Thumbnail (48) and gap (12) past the row's 16pt edge. */
const TEXT_INSET = 16 + 48 + 12;

type Palette = ReturnType<typeof useGroupedColors>;
type TFunction = (key: string, options?: Record<string, unknown>) => string;

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(days: number | undefined | null, t: TFunction): string {
	if (!days && days !== 0) return "—";
	if (days === 7) return t("boostHistory.week1");
	if (days === 14) return t("boostHistory.week2");
	if (days === 30) return t("boostHistory.month1");
	if (days === 60) return t("boostHistory.month2");
	if (days === 90) return t("boostHistory.month3");
	return t("boostHistory.days", { count: days });
}

function formatDateRange(
	createdAt: string | undefined | null,
	durationDays: number | undefined | null,
): string {
	// A missing/malformed createdAt used to render "Invalid Date → Invalid Date".
	const start = parseDate(createdAt);
	if (!start) return "—";
	const end = new Date(start);
	if (durationDays) end.setDate(end.getDate() + durationDays);
	const fmt = (d: Date) =>
		d.toLocaleDateString(appDateLocale(), { day: "numeric", month: "short" });
	return durationDays ? `${fmt(start)} → ${fmt(end)}` : fmt(start);
}

/** Each payment status's words and tone; the pill draws them in both themes. */
function getStatusConfig(
	t: TFunction,
): Record<string, { label: string; tone: StatusTone }> {
	return {
		completed: { label: t("boostHistory.statusCompleted"), tone: "success" },
		pending: { label: t("boostHistory.statusActive"), tone: "info" },
		failed: { label: t("boostHistory.statusFailed"), tone: "danger" },
		refunded: { label: t("boostHistory.statusRefunded"), tone: "neutral" },
	};
}

/** Share of the boost period already used, 0–1; null when it cannot be told. */
function boostProgress(item: any): number | null {
	if (!item.durationDays || item.status !== "pending") return null;
	// A missing createdAt used to produce NaN → width: "NaN%", which Yoga rejects.
	const startDate = parseDate(item.createdAt);
	if (!startDate) return null;
	const start = startDate.getTime();
	const end = start + item.durationDays * 86_400_000;
	return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

// ── Summary ────────────────────────────────────────────────────────────────────

function Summary({
	c,
	totalSpent,
	counts,
	months,
}: {
	c: Palette;
	totalSpent: number;
	counts: { total: number; active: number; completed: number };
	months: { label: string; value: number }[];
}) {
	const { t, i18n } = useTranslation();
	const max = Math.max(...months.map((m) => m.value), 1);
	const hasSpend = months.some((m) => m.value > 0);
	const stats = [
		{ label: t("boostHistory.total"), value: counts.total },
		{ label: t("boostHistory.active"), value: counts.active },
		{ label: t("boostHistory.completed"), value: counts.completed },
	];

	return (
		<View
			style={[
				styles.summary,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			{/* The figure that matters first: what boosting has cost. A fee paid,
			    not a price, so plain ink; the yellow stays for prices. */}
			<View
				accessible
				accessibilityLabel={`${t("boostHistory.totalSpent")}, ${formatPrice(totalSpent, i18n.language)}`}
				style={styles.spent}
			>
				<Text style={[styles.spentLabel, { color: c.mutedForeground }]}>
					{t("boostHistory.totalSpent")}
				</Text>
				<Text
					style={[styles.spentAmount, { color: c.foreground }]}
					numberOfLines={1}
					adjustsFontSizeToFit
				>
					{formatPrice(totalSpent, i18n.language)}
				</Text>
			</View>

			<View style={[styles.statStrip, { borderColor: c.border }]}>
				{stats.map((stat, i) => (
					<View
						key={stat.label}
						accessible
						accessibilityLabel={`${stat.label}: ${stat.value}`}
						style={[
							styles.stat,
							i > 0 && {
								borderLeftWidth: StyleSheet.hairlineWidth,
								borderLeftColor: c.border,
							},
						]}
					>
						<Text style={[styles.statValue, { color: c.foreground }]}>
							{stat.value}
						</Text>
						<Text
							style={[styles.statLabel, { color: c.mutedForeground }]}
							numberOfLines={1}
						>
							{stat.label}
						</Text>
					</View>
				))}
			</View>

			{hasSpend ? (
				<View
					style={styles.chart}
					accessible
					accessibilityLabel={`${t("boostHistory.monthlySpend")}, ${t("boostHistory.last6Months")}: ${months
						.map((m) => `${m.label} ${formatPrice(m.value, i18n.language)}`)
						.join(", ")}`}
				>
					<View style={styles.chartHeader}>
						<Text style={[styles.chartTitle, { color: c.foreground }]}>
							{t("boostHistory.monthlySpend")}
						</Text>
						<Text style={[styles.chartSub, { color: c.mutedForeground }]}>
							{t("boostHistory.last6Months")}
						</Text>
					</View>
					<View style={styles.bars}>
						{months.map((m) => (
							<View key={m.label} style={styles.barCol}>
								<View style={styles.barTrack}>
									<View
										style={[
											styles.bar,
											{
												height: Math.max(
													3,
													Math.round((m.value / max) * CHART_H),
												),
												backgroundColor: m.value > 0 ? c.primary : c.well,
											},
										]}
									/>
								</View>
								<Text
									style={[styles.barLabel, { color: c.mutedForeground }]}
									numberOfLines={1}
								>
									{m.label}
								</Text>
							</View>
						))}
					</View>
				</View>
			) : null}
		</View>
	);
}

// ── Boost row ──────────────────────────────────────────────────────────────────

function BoostRow({ item, c }: { item: any; c: Palette }) {
	const { t, i18n } = useTranslation();
	const cfg = getStatusConfig(t)[item.status] ?? getStatusConfig(t).pending;
	const imgUrl = resolveListingImageUrl(item.listing?.images?.[0], "thumbnail");
	const title = item.listing?.title ?? t("boostHistory.deletedListing");
	const durationLabel = formatDuration(item.durationDays, t);
	const dateRange = formatDateRange(item.createdAt, item.durationDays);
	const progress = boostProgress(item);
	const amount =
		item.amount != null ? formatPrice(item.amount, i18n.language) : "—";
	const listingId = item.listing?.id ?? item.listing;

	return (
		<Pressable
			onPress={() => listingId && router.push(`/listing/${listingId}`)}
			disabled={!listingId}
			accessibilityRole="button"
			accessibilityLabel={[title, cfg.label, durationLabel, dateRange, amount]
				.filter(Boolean)
				.join(", ")}
			android_ripple={{ color: c.well }}
			style={({ pressed }) => [
				styles.row,
				pressed && Platform.OS === "ios" ? { backgroundColor: c.well } : null,
			]}
		>
			{imgUrl ? (
				<Image
					source={{ uri: imgUrl }}
					style={[styles.thumb, { backgroundColor: c.well }]}
					contentFit="cover"
				/>
			) : (
				<View
					style={[
						styles.thumb,
						styles.thumbFallback,
						{ backgroundColor: c.sunTint },
					]}
				>
					<Ionicons name="rocket-outline" size={20} color={c.warningText} />
				</View>
			)}

			<View style={styles.rowText}>
				<View style={styles.rowTop}>
					<Text
						style={[styles.rowTitle, { color: c.foreground }]}
						numberOfLines={1}
					>
						{title}
					</Text>
					<Text style={[styles.rowAmount, { color: c.foreground }]}>
						{amount}
					</Text>
				</View>
				<View style={styles.rowMeta}>
					<Text
						style={[styles.rowMetaText, { color: c.mutedForeground }]}
						numberOfLines={1}
					>
						{`${durationLabel} · ${dateRange}`}
					</Text>
					<StatusTag label={cfg.label} tone={cfg.tone} />
				</View>
				{progress !== null ? (
					<View
						style={[styles.progressTrack, { backgroundColor: c.well }]}
						accessibilityElementsHidden
						importantForAccessibility="no-hide-descendants"
					>
						<View
							style={[
								styles.progressFill,
								{
									width: `${Math.round(progress * 100)}%`,
									backgroundColor: c.sun,
								},
							]}
						/>
					</View>
				) : null}
			</View>
		</Pressable>
	);
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export function BoostHistoryScreen() {
	const c = useGroupedColors();
	const { user } = useAuth();
	const { t } = useTranslation();
	const { centeredContent } = useResponsive();

	const {
		data,
		isLoading,
		isError,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
		refetch,
	} = useInfiniteQuery({
		queryKey: ["boost-payments"],
		queryFn: ({ pageParam = 1 }) =>
			api.get<{
				docs: any[];
				totalDocs: number;
				hasNextPage: boolean;
				nextPage: number | null;
			}>(
				`/api/boost-payments?sort=-createdAt&depth=2&limit=${PAGE_SIZE}&page=${pageParam}`,
			),
		getNextPageParam: (lastPage) =>
			lastPage?.hasNextPage ? lastPage.nextPage : undefined,
		initialPageParam: 1,
		enabled: !!user,
	});

	const payments = useMemo(
		() => data?.pages.flatMap((p) => p?.docs ?? []) ?? [],
		[data],
	);

	const summary = useMemo(() => {
		const completed = payments.filter((p: any) => p.status === "completed");
		const now = new Date();
		const locale = appDateLocale();
		const months = Array.from({ length: 6 }, (_, i) => {
			const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
			const value = completed
				.filter((p: any) => {
					const pd = parseDate(p.createdAt);
					return (
						pd &&
						pd.getFullYear() === d.getFullYear() &&
						pd.getMonth() === d.getMonth()
					);
				})
				.reduce((acc: number, p: any) => acc + (p.amount ?? 0), 0);
			return {
				label: d.toLocaleDateString(locale, { month: "short" }),
				value,
			};
		});
		return {
			totalSpent: completed.reduce(
				(acc: number, p: any) => acc + (p.amount ?? 0),
				0,
			),
			counts: {
				total: payments.length,
				active: payments.filter((p: any) => p.status === "pending").length,
				completed: completed.length,
			},
			months,
		};
	}, [payments]);

	// Running boosts first, where a seller looks for them; the rest below.
	const sections = useMemo(() => {
		const running = payments.filter((p: any) => p.status === "pending");
		const past = payments.filter((p: any) => p.status !== "pending");
		return [
			{ key: "active", title: t("boostHistory.active"), data: running },
			{ key: "history", title: t("boostHistory.history"), data: past },
		].filter((s) => s.data.length > 0);
	}, [payments, t]);

	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("boostHistory.title")} />

			{isLoading ? (
				<OrderListSkeleton rows={5} />
			) : isError && payments.length === 0 ? (
				<EmptyState
					icon="alert-circle-outline"
					title={t("common.error")}
					ctaLabel={t("common.retry")}
					onCta={() => void refetch()}
				/>
			) : payments.length === 0 ? (
				<EmptyState
					icon="rocket-outline"
					title={t("boostHistory.noBoosts")}
					subtitle={t("boostHistory.noBoostsSubtitle")}
					ctaLabel={t("boostHistory.viewMyListings")}
					onCta={() => router.push("/account/listings")}
				/>
			) : (
				<SectionList
					sections={sections}
					keyExtractor={(item) => item.id}
					stickySectionHeadersEnabled={false}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={c.primary}
							colors={[c.primary]}
						/>
					}
					ListHeaderComponent={
						<Summary
							c={c}
							totalSpent={summary.totalSpent}
							counts={summary.counts}
							months={summary.months}
						/>
					}
					renderSectionHeader={({ section }) => (
						<Text
							accessibilityRole="header"
							style={[styles.sectionTitle, { color: c.mutedForeground }]}
						>
							{section.title}
						</Text>
					)}
					renderItem={({ item, index, section }) => (
						<View
							style={[
								styles.groupRow,
								{ backgroundColor: c.card, borderColor: c.border },
								index === 0 && styles.groupFirst,
								index === section.data.length - 1 && styles.groupLast,
							]}
						>
							{index > 0 ? (
								<View
									style={[styles.separator, { backgroundColor: c.border }]}
								/>
							) : null}
							<BoostRow item={item} c={c} />
						</View>
					)}
					contentContainerStyle={[styles.list, centeredContent]}
					onEndReached={() => {
						if (hasNextPage && !isFetchingNextPage) fetchNextPage();
					}}
					onEndReachedThreshold={0.3}
					ListFooterComponent={
						isFetchingNextPage ? (
							<ActivityIndicator style={styles.footerSpinner} color={c.link} />
						) : null
					}
					showsVerticalScrollIndicator={false}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	list: { padding: 16, paddingTop: 20, paddingBottom: 48 },
	footerSpinner: { marginVertical: 16 },

	/* Summary */
	summary: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	spent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 2 },
	spentLabel: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
	spentAmount: {
		fontSize: 30,
		lineHeight: 36,
		letterSpacing: -0.8,
		fontFamily: Fonts.displayExtrabold,
	},
	statStrip: {
		flexDirection: "row",
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	stat: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, gap: 2 },
	statValue: {
		fontSize: 20,
		lineHeight: 24,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	statLabel: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodyMedium,
		textAlign: "center",
	},
	chart: {
		paddingHorizontal: 16,
		paddingTop: 14,
		paddingBottom: 14,
		gap: 12,
	},
	chartHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
	},
	chartTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	chartSub: { fontSize: 12, fontFamily: Fonts.body },
	bars: { flexDirection: "row", gap: 10 },
	barCol: { flex: 1, alignItems: "center", gap: 6 },
	barTrack: { height: CHART_H, width: "100%", justifyContent: "flex-end" },
	bar: { width: "100%", borderRadius: 4 },
	barLabel: { fontSize: 11, lineHeight: 14, fontFamily: Fonts.body },

	/* Sections */
	sectionTitle: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 13,
		lineHeight: 18,
		marginLeft: 16,
		marginTop: 24,
		marginBottom: 8,
	},
	groupRow: {
		borderLeftWidth: StyleSheet.hairlineWidth,
		borderRightWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	groupFirst: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopLeftRadius: 14,
		borderTopRightRadius: 14,
	},
	groupLast: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomLeftRadius: 14,
		borderBottomRightRadius: 14,
	},
	separator: { height: StyleSheet.hairlineWidth, marginLeft: TEXT_INSET },

	/* Row */
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 72,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	thumb: { width: 48, height: 48, borderRadius: 10 },
	thumbFallback: { alignItems: "center", justifyContent: "center" },
	rowText: { flex: 1, gap: 4 },
	rowTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
	rowTitle: {
		flex: 1,
		fontSize: 15,
		lineHeight: 21,
		fontFamily: Fonts.bodyMedium,
	},
	rowAmount: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.displayBold },
	rowMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
	rowMetaText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
	},
	progressTrack: {
		height: 4,
		borderRadius: 2,
		overflow: "hidden",
		marginTop: 4,
	},
	progressFill: { height: 4, borderRadius: 2 },
});
