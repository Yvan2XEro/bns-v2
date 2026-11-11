import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
	Defs,
	LinearGradient,
	Path,
	Polyline,
	Rect,
	Stop,
} from "react-native-svg";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { StatusTag, type StatusTone } from "@/src/components/shop/Tags";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { appDateLocale, parseDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

const CHART_H = 72;

// ── Helpers ────────────────────────────────────────────────────────────────────

type TFunction = (key: string, options?: Record<string, unknown>) => string;

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
		d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
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

// ── Boost Item Card ────────────────────────────────────────────────────────────

function BoostCard({
	item,
	isDark,
	cardBg,
	borderColor,
	textColor,
	mutedColor,
}: any) {
	const { t, i18n } = useTranslation();
	const STATUS_CONFIG = getStatusConfig(t);
	const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
	const imgUrl = resolveListingImageUrl(item.listing?.images?.[0], "thumbnail");
	const durationLabel = formatDuration(item.durationDays, t);
	const dateRange = formatDateRange(item.createdAt, item.durationDays);
	const isActive =
		item.status === "pending" &&
		item.listing?.boostedUntil &&
		new Date(item.listing.boostedUntil) > new Date();

	// Progress bar: % of boost period consumed
	const progress = useMemo(() => {
		if (!item.durationDays || item.status !== "pending") return 1;
		// Without this guard a missing createdAt produced NaN → width: "NaN%",
		// which Yoga rejects.
		const startDate = parseDate(item.createdAt);
		if (!startDate) return 0;
		const start = startDate.getTime();
		const end = start + item.durationDays * 86400000;
		const now = Date.now();
		return Math.min(1, Math.max(0, (now - start) / (end - start)));
	}, [item]);

	return (
		<Pressable
			onPress={() =>
				router.push(`/listing/${item.listing?.id ?? item.listing}`)
			}
			style={[styles.card, { backgroundColor: cardBg, borderColor }]}
		>
			<View style={styles.cardInner}>
				{/* Left: image or rocket */}
				<View style={styles.thumbWrap}>
					{imgUrl ? (
						<Image
							source={{ uri: imgUrl }}
							style={styles.thumb}
							contentFit="cover"
						/>
					) : (
						<View
							style={[
								styles.thumbFallback,
								{
									backgroundColor: isDark
										? Colors.dark.sunTint
										: Colors.light.sunTint,
								},
							]}
						>
							<Ionicons
								name="rocket"
								size={22}
								color={
									isDark ? Colors.dark.warningText : Colors.light.warningText
								}
							/>
						</View>
					)}
					{isActive && <View style={styles.activeDot} />}
				</View>

				{/* Center: info */}
				<View style={styles.cardInfo}>
					<Text
						style={[styles.cardTitle, { color: textColor }]}
						numberOfLines={1}
					>
						{item.listing?.title ?? t("boostHistory.deletedListing")}
					</Text>

					{/* Duration + date */}
					<View style={styles.cardMeta}>
						<View
							style={[
								styles.durationPill,
								{
									backgroundColor: isDark
										? Colors.dark.sunTint
										: Colors.light.sunTint,
								},
							]}
						>
							<Ionicons
								name="flash"
								size={11}
								color={
									isDark ? Colors.dark.warningText : Colors.light.warningText
								}
							/>
							<Text
								style={[
									styles.durationPillText,
									{
										color: isDark
											? Colors.dark.warningText
											: Colors.light.warningText,
									},
								]}
							>
								{durationLabel}
							</Text>
						</View>
						<Text style={[styles.cardDate, { color: mutedColor }]}>
							{dateRange}
						</Text>
					</View>

					{/* Progress bar for active boosts */}
					{item.status === "pending" && (
						<View
							style={[
								styles.progressTrack,
								{ backgroundColor: isDark ? "#1a1f4a" : "#eceef5" },
							]}
						>
							<View
								style={[
									styles.progressFill,
									{
										width: `${progress * 100}%` as any,
										backgroundColor: "#ffb81c",
									},
								]}
							/>
						</View>
					)}
				</View>

				{/* Right: amount + status */}
				<View style={styles.cardRight}>
					{/* A fee paid, not a price: plain ink, the yellow stays for prices. */}
					<Text style={[styles.cardAmount, { color: textColor }]}>
						{item.amount != null
							? formatPrice(item.amount, i18n.language)
							: "—"}
					</Text>
					<StatusTag label={cfg.label} tone={cfg.tone} />
				</View>
			</View>
		</Pressable>
	);
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export function BoostHistoryScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const { t, i18n } = useTranslation();
	const { width, contentMaxWidth, centeredContent } = useResponsive();
	// Sparkline follows the real card width (list column is capped on tablets).
	const CHART_W = Math.min(width, contentMaxWidth) - 64;

	const c = Colors[isDark ? "dark" : "light"];
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const mutedColor = c.mutedForeground;
	/** Brand words and icons, legible in both themes. */
	const primaryColor = c.link;
	const borderColor = c.border;

	const PAGE_SIZE = 15;

	const {
		data,
		isLoading,
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

	const payments = data?.pages.flatMap((p) => p?.docs ?? []) ?? [];
	const completed = payments.filter(
		(p: any) => p.status === "completed",
	).length;
	const active = payments.filter((p: any) => p.status === "pending").length;
	const totalSpent = payments
		.filter((p: any) => p.status === "completed")
		.reduce((acc: number, p: any) => acc + (p.amount ?? 0), 0);

	// Sparkline: last 6 months
	const chartPoints = useMemo(() => {
		const now = new Date();
		const months = Array.from({ length: 6 }, (_, i) => {
			const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
			return payments
				.filter((p: any) => {
					const pd = new Date(p.createdAt);
					return (
						pd.getFullYear() === d.getFullYear() &&
						pd.getMonth() === d.getMonth() &&
						p.status === "completed"
					);
				})
				.reduce((acc: number, p: any) => acc + (p.amount ?? 0), 0);
		});
		const max = Math.max(...months, 1);
		return months.map((v, i) => ({
			x: (i / 5) * CHART_W,
			y: CHART_H - (v / max) * (CHART_H - 10),
			value: v,
		}));
	}, [payments, CHART_W]);

	const monthLabels = useMemo(
		() =>
			Array.from({ length: 6 }, (_, i) => {
				const d = new Date();
				d.setMonth(d.getMonth() - (5 - i));
				return d.toLocaleDateString(appDateLocale(), { month: "short" });
			}),
		[],
	);

	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	const cardProps = { isDark, cardBg, borderColor, textColor, mutedColor };

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			{/* Header */}
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<HeaderBackButton
					color={textColor}
					fallback="/(tabs)/account"
					style={styles.backBtn}
				/>
				<View style={{ flex: 1, alignItems: "center" }}>
					<Text
						accessibilityRole="header"
						style={[styles.headerTitle, { color: textColor }]}
					>
						{t("boostHistory.title")}
					</Text>
					<Text style={[styles.headerSub, { color: mutedColor }]}>
						{payments.length > 0
							? t("boostHistory.subtitle", { count: payments.length })
							: t("boostHistory.noBoosts")}
					</Text>
				</View>
				<View style={{ width: 40 }} />
			</View>

			{isLoading ? (
				<OrderListSkeleton rows={5} />
			) : payments.length === 0 ? (
				<EmptyState
					icon="rocket-outline"
					title={t("boostHistory.noBoosts")}
					subtitle={t("boostHistory.noBoostsSubtitle")}
					ctaLabel={t("boostHistory.viewMyListings")}
					onCta={() => router.push("/account/listings")}
				/>
			) : (
				<FlatList
					data={payments}
					keyExtractor={(item) => item.id}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={c.primary}
							colors={[c.primary]}
						/>
					}
					ListHeaderComponent={
						<View>
							{/* Stats row */}
							<View style={styles.statsRow}>
								{[
									{
										label: t("boostHistory.total"),
										value: String(payments.length),
										icon: "rocket-outline",
										color: primaryColor,
										iconBg: c.primaryTint,
									},
									{
										label: t("boostHistory.active"),
										value: String(active),
										icon: "flash",
										color: primaryColor,
										iconBg: c.primaryTint,
									},
									{
										label: t("boostHistory.completed"),
										value: String(completed),
										icon: "checkmark-circle",
										color: c.successText,
										iconBg: c.successTint,
									},
								].map(({ label, value, icon, color, iconBg }) => (
									<View
										key={label}
										style={[
											styles.statCard,
											{ backgroundColor: cardBg, borderColor },
										]}
									>
										<View
											style={[styles.statIconBox, { backgroundColor: iconBg }]}
										>
											<Ionicons name={icon as any} size={16} color={color} />
										</View>
										<Text style={[styles.statVal, { color }]}>{value}</Text>
										<Text style={[styles.statLabel, { color: mutedColor }]}>
											{label}
										</Text>
									</View>
								))}
							</View>

							{/* Total spent banner */}
							<View
								style={[
									styles.spentBanner,
									{
										backgroundColor: c.card,
										borderColor: c.sunTint,
									},
								]}
							>
								<View
									style={[
										styles.spentIconBox,
										{
											backgroundColor: isDark
												? Colors.dark.sunTint
												: Colors.light.sunTint,
										},
									]}
								>
									<Ionicons
										name="wallet-outline"
										size={18}
										color={c.warningText}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<Text style={[styles.spentLabel, { color: mutedColor }]}>
										{t("boostHistory.totalSpent")}
									</Text>
									<Text
										style={[
											styles.spentAmount,
											{ color: isDark ? "#ffc94a" : "#6e4700" },
										]}
									>
										{formatPrice(totalSpent, i18n.language)}
									</Text>
								</View>
							</View>

							{/* Sparkline */}
							{completed > 0 && (
								<View
									style={[
										styles.chartCard,
										{ backgroundColor: cardBg, borderColor },
									]}
								>
									<View style={styles.chartHeader}>
										<Text style={[styles.chartTitle, { color: textColor }]}>
											{t("boostHistory.monthlySpend")}
										</Text>
										<Text style={[styles.chartSub, { color: mutedColor }]}>
											{t("boostHistory.last6Months")}
										</Text>
									</View>
									<Svg width={CHART_W} height={CHART_H + 4}>
										<Defs>
											<LinearGradient
												id="boostGrad"
												x1="0"
												y1="0"
												x2="0"
												y2="1"
											>
												<Stop
													offset="0%"
													stopColor="#ffb81c"
													stopOpacity={0.25}
												/>
												<Stop
													offset="100%"
													stopColor="#ffb81c"
													stopOpacity={0}
												/>
											</LinearGradient>
										</Defs>
										<Path
											d={`M${chartPoints[0].x},${CHART_H} ${chartPoints.map((p) => `L${p.x},${p.y}`).join(" ")} L${chartPoints[chartPoints.length - 1].x},${CHART_H} Z`}
											fill="url(#boostGrad)"
										/>
										<Polyline
											points={chartPoints.map((p) => `${p.x},${p.y}`).join(" ")}
											fill="none"
											stroke="#ffb81c"
											strokeWidth={2}
											strokeLinejoin="round"
											strokeLinecap="round"
										/>
										{chartPoints.map((p, i) => (
											<Rect
												key={i}
												x={p.x - 3.5}
												y={p.y - 3.5}
												width={7}
												height={7}
												rx={3.5}
												fill={
													p.value > 0
														? "#ffb81c"
														: isDark
															? "#1a1f4a"
															: "#e1e3ee"
												}
												stroke={isDark ? "#0c1030" : "#ffffff"}
												strokeWidth={1.5}
											/>
										))}
									</Svg>
									<View style={styles.chartLabels}>
										{monthLabels.map((label, i) => (
											<Text
												key={i}
												style={[styles.chartLabel, { color: mutedColor }]}
											>
												{label}
											</Text>
										))}
									</View>
								</View>
							)}

							{/* Section separator */}
							<View style={styles.sectionRow}>
								<Text style={[styles.sectionLabel, { color: mutedColor }]}>
									{t("boostHistory.history")}
								</Text>
								<View
									style={[styles.sectionLine, { backgroundColor: borderColor }]}
								/>
							</View>
						</View>
					}
					contentContainerStyle={[
						styles.list,
						{ backgroundColor: bg },
						centeredContent,
					]}
					renderItem={({ item }) => <BoostCard item={item} {...cardProps} />}
					onEndReached={() => {
						if (hasNextPage && !isFetchingNextPage) fetchNextPage();
					}}
					onEndReachedThreshold={0.3}
					ListFooterComponent={
						isFetchingNextPage ? (
							<ActivityIndicator
								style={{ marginVertical: 16 }}
								color={primaryColor}
							/>
						) : !hasNextPage && payments.length > 0 ? (
							<Text style={[styles.endLabel, { color: mutedColor }]}>
								{t("boostHistory.endOfHistory")}
							</Text>
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

	/* Header */
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		fontSize: 18,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	headerSub: { fontSize: 12, fontFamily: Fonts.body, textAlign: "center" },

	/* Stats */
	statsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
	statCard: {
		flex: 1,
		borderRadius: 12,
		borderWidth: 1,
		padding: 12,
		alignItems: "center",
		gap: 4,
	},
	statIconBox: {
		width: 32,
		height: 32,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	statVal: { fontSize: 18, fontFamily: Fonts.displayExtrabold, lineHeight: 22 },
	statLabel: { fontSize: 12, fontFamily: Fonts.bodySemibold },

	/* Spent banner */
	spentBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 12,
		borderWidth: 1,
		padding: 14,
		marginBottom: 10,
	},
	spentIconBox: {
		width: 40,
		height: 40,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	spentLabel: { fontSize: 12, fontFamily: Fonts.body },
	spentAmount: { fontSize: 20, fontFamily: Fonts.displayExtrabold },

	/* Chart */
	chartCard: {
		borderRadius: 12,
		borderWidth: 1,
		padding: 14,
		marginBottom: 10,
		gap: 8,
	},
	chartHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	chartTitle: { fontSize: 13, fontFamily: Fonts.displayBold },
	chartSub: { fontSize: 12, fontFamily: Fonts.body },
	chartLabels: { flexDirection: "row", justifyContent: "space-between" },
	chartLabel: { fontSize: 11, fontFamily: Fonts.body },

	/* Section */
	sectionRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 10,
	},
	sectionLabel: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		letterSpacing: 0.8,
	},
	sectionLine: { flex: 1, height: 1 },

	list: { padding: 16, paddingTop: 12, gap: 8, paddingBottom: 40 },
	endLabel: {
		textAlign: "center",
		fontSize: 12,
		fontFamily: Fonts.body,
		marginVertical: 16,
	},

	/* Boost card */
	card: {
		borderRadius: 14,
		borderWidth: 1,
		overflow: "hidden",
		flexDirection: "row",
	},
	cardInner: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
		gap: 12,
	},
	thumbWrap: { position: "relative" },
	thumb: { width: 56, height: 56, borderRadius: 10 },
	thumbFallback: {
		width: 56,
		height: 56,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	activeDot: {
		position: "absolute",
		top: 4,
		right: 4,
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#34b26a",
		borderWidth: 1.5,
		borderColor: "#fff",
	},
	cardInfo: { flex: 1, gap: 5 },
	cardTitle: { fontSize: 13, fontFamily: Fonts.displayBold, lineHeight: 17 },
	cardMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
	durationPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		borderRadius: 20,
		paddingHorizontal: 7,
		paddingVertical: 3,
	},
	durationPillText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},
	cardDate: { fontSize: 12, fontFamily: Fonts.body },
	progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
	progressFill: { height: 4, borderRadius: 2 },
	cardRight: { alignItems: "flex-end", gap: 6 },
	cardAmount: {
		fontSize: 15,
		fontFamily: Fonts.displayBold,
		textAlign: "right",
		lineHeight: 19,
	},
});
