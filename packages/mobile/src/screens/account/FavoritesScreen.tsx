import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
	FlatList,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	Extrapolation,
	interpolate,
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { SkeletonCard } from "@/src/components/SkeletonCard";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { useTranslation } from "@/src/lib/i18n";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<any[]>);

const SORTS = [
	{ key: "recent", labelKey: "favorites.sortRecent", icon: "time-outline" },
	{
		key: "price_asc",
		labelKey: "favorites.sortPriceAsc",
		icon: "arrow-up-outline",
	},
	{
		key: "price_desc",
		labelKey: "favorites.sortPriceDesc",
		icon: "arrow-down-outline",
	},
	{ key: "az", labelKey: "favorites.sortAZ", icon: "text-outline" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

/** A favourite carries its listing, or is the listing (optimistic rows). */
const getListing = (fav: any) => fav.listing ?? fav;

/**
 * The favourites list, one screen for both ways in: the Favoris tab
 * (`variant="tab"`, a large title) and Account → Favoris (`"pane"`, the
 * account sub-page bar). Same search, sort, count and empty states in both.
 */
export function FavoritesScreen({
	variant = "pane",
}: {
	variant?: "tab" | "pane";
}) {
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const { user } = useAuth();
	const pathname = usePathname();
	const { columns, cardWidth } = useResponsive();

	const [query, setQuery] = React.useState("");
	const [sortKey, setSortKey] = React.useState<SortKey>("recent");
	const [refreshing, setRefreshing] = React.useState(false);

	// ── Colors ──────────────────────────────────────────────────────
	const c = Colors[isDark ? "dark" : "light"];

	// ── Scroll ──────────────────────────────────────────────────────
	// The large title stays put; once the grid slides under the header a
	// hairline draws the edge, the way a native large-title bar does.
	const scrollY = useSharedValue(0);
	const scrollHandler = useAnimatedScrollHandler({
		onScroll: (e) => {
			scrollY.value = e.contentOffset.y;
		},
	});
	const edgeStyle = useAnimatedStyle(() => ({
		opacity: interpolate(scrollY.value, [0, 12], [0, 1], Extrapolation.CLAMP),
	}));

	// ── Data ────────────────────────────────────────────────────────
	const { favorites, isLoading, isError, refetch, toggleFavorite } =
		useFavoriteActions();

	// The heart sits where a thumb lands while scrolling: a removal is
	// offered back for five seconds, as the cart does.
	const [removed, setRemoved] = useState<any | null>(null);
	useEffect(() => {
		if (!removed) return;
		const timer = setTimeout(() => setRemoved(null), 5000);
		return () => clearTimeout(timer);
	}, [removed]);
	const removeFavorite = (listing: any) => {
		setRemoved(listing);
		toggleFavorite(listing);
	};
	const undoRemove = () => {
		if (!removed) return;
		toggleFavorite(removed);
		setRemoved(null);
	};

	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	const filtered = useMemo(() => {
		let list = [...favorites];
		if (query.trim()) {
			const q = query.trim().toLowerCase();
			list = list.filter((fav) =>
				getListing(fav)?.title?.toLowerCase().includes(q),
			);
		}
		list.sort((a, b) => {
			const la = getListing(a);
			const lb = getListing(b);
			if (sortKey === "price_asc") return (la.price ?? 0) - (lb.price ?? 0);
			if (sortKey === "price_desc") return (lb.price ?? 0) - (la.price ?? 0);
			if (sortKey === "az")
				return (la.title ?? "").localeCompare(lb.title ?? "");
			return 0;
		});
		return list;
	}, [favorites, query, sortKey]);

	const pairs = chunkIntoRows(filtered, columns);

	const title = (
		<Text
			accessibilityRole="header"
			style={[styles.pageTitle, { color: c.foreground }]}
			numberOfLines={1}
		>
			{t("favorites.title")}
		</Text>
	);
	const paneHeader =
		variant === "pane" ? <SettingsHeader title={t("favorites.title")} /> : null;

	// ── Not logged in ───────────────────────────────────────────────
	if (!user) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.background }]}
			>
				{paneHeader ?? <View style={styles.titleRow}>{title}</View>}
				<EmptyState
					icon="heart-outline"
					title={t("favorites.signIn")}
					subtitle={t("favorites.signInSub")}
					ctaLabel={t("auth.login")}
					onCta={() =>
						router.push({
							pathname: "/auth/login",
							params: getAuthModalParams(pathname),
						})
					}
					secondaryLabel={t("account.createAccount")}
					onSecondary={() =>
						router.push({
							pathname: "/auth/register",
							params: getAuthModalParams(pathname),
						})
					}
				/>
			</SafeAreaView>
		);
	}

	const hasToolbar = !isLoading && favorites.length > 0;
	const countLine =
		favorites.length > 0
			? filtered.length !== favorites.length
				? `${filtered.length} / ${t("favorites.listingCount", { count: favorites.length })}`
				: t("favorites.listingsSaved", { count: favorites.length })
			: null;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			{/* ══ Header: large title on the ground, then the tools ══ */}
			{paneHeader}
			<View style={[styles.header, paneHeader ? styles.headerPane : null]}>
				{/* The Account tab is one tap away: no avatar shortcut here, and
				    no full-size avatar download on metered data. */}
				{paneHeader ? (
					countLine ? (
						<Text
							style={[
								styles.count,
								styles.countPane,
								{ color: c.mutedForeground },
							]}
						>
							{countLine}
						</Text>
					) : null
				) : (
					<View style={styles.titleRow}>
						<View style={styles.titleText}>
							{title}
							{countLine ? (
								<Text style={[styles.count, { color: c.mutedForeground }]}>
									{countLine}
								</Text>
							) : null}
						</View>
					</View>
				)}

				{hasToolbar ? (
					<View style={styles.searchWrap}>
						<View
							style={[
								styles.searchBar,
								{
									backgroundColor: c.card,
									borderColor: query.length > 0 ? c.primary : c.borderStrong,
								},
							]}
						>
							<Ionicons name="search" size={18} color={c.mutedForeground} />
							<TextInput
								value={query}
								onChangeText={setQuery}
								placeholder={t("favorites.searchPlaceholder")}
								placeholderTextColor={c.mutedForeground}
								accessibilityLabel={t("favorites.searchPlaceholder")}
								selectionColor={c.primary}
								returnKeyType="search"
								style={[styles.searchInput, { color: c.foreground }]}
							/>
							{query.length > 0 ? (
								<Pressable
									onPress={() => setQuery("")}
									hitSlop={14}
									accessibilityRole="button"
									accessibilityLabel={t("favorites.clear")}
								>
									<View
										style={[
											styles.clearBubble,
											{ backgroundColor: c.borderStrong },
										]}
									>
										<Ionicons name="close" size={12} color={c.foreground} />
									</View>
								</Pressable>
							) : null}
						</View>
					</View>
				) : null}

				{hasToolbar ? (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={styles.sortScroll}
						contentContainerStyle={styles.sortRow}
						accessibilityRole="radiogroup"
					>
						{SORTS.map((s) => {
							const active = sortKey === s.key;
							return (
								<Pressable
									key={s.key}
									onPress={() => setSortKey(s.key)}
									accessibilityRole="radio"
									accessibilityState={{ checked: active }}
									hitSlop={{ top: 4, bottom: 4 }}
									style={[
										styles.sortPill,
										active
											? {
													backgroundColor: c.primaryFill,
													borderColor: c.primaryFill,
												}
											: {
													backgroundColor: c.card,
													borderColor: c.borderStrong,
												},
									]}
								>
									<Ionicons
										name={s.icon}
										size={14}
										color={active ? "#ffffff" : c.mutedForeground}
									/>
									<Text
										style={[
											styles.sortPillText,
											{ color: active ? "#ffffff" : c.foreground },
										]}
									>
										{t(s.labelKey)}
									</Text>
								</Pressable>
							);
						})}
					</ScrollView>
				) : null}

				<Animated.View
					pointerEvents="none"
					style={[styles.edge, { backgroundColor: c.border }, edgeStyle]}
				/>
			</View>

			{/* ══ Content ══ */}
			{isLoading ? (
				<View
					style={styles.skeletonGrid}
					accessible
					accessibilityRole="progressbar"
					accessibilityLabel={t("common.loading")}
				>
					{Array.from({ length: columns * 3 }).map((_, i) => (
						<SkeletonCard key={i} cardWidth={cardWidth} />
					))}
				</View>
			) : isError && favorites.length === 0 ? (
				<EmptyState
					icon="alert-circle-outline"
					title={t("common.error")}
					subtitle={t("home.errorSub")}
					ctaLabel={t("common.retry")}
					onCta={() => void refetch()}
				/>
			) : favorites.length === 0 ? (
				<EmptyState
					icon="heart-outline"
					title={t("favorites.noFavorites")}
					subtitle={t("favorites.noFavoritesSub")}
					ctaLabel={t("favorites.browse")}
					onCta={() => router.push("/(tabs)/home")}
				/>
			) : filtered.length === 0 ? (
				<View style={styles.noResultWrap}>
					<Ionicons
						name="search-outline"
						size={40}
						color={c.mutedForeground}
						style={styles.noResultIcon}
					/>
					<Text
						accessibilityRole="header"
						style={[styles.noResultTitle, { color: c.foreground }]}
					>
						{t("favorites.noResults")}
					</Text>
					<Text style={[styles.noResultSub, { color: c.mutedForeground }]}>
						{t("favorites.noResultsFor", { query })}
					</Text>
					<Pressable
						onPress={() => setQuery("")}
						accessibilityRole="button"
						style={[
							styles.clearBtn,
							{ borderColor: c.borderStrong, backgroundColor: c.card },
						]}
					>
						<Text style={[styles.clearBtnText, { color: c.link }]}>
							{t("favorites.clear")}
						</Text>
					</Pressable>
				</View>
			) : (
				<AnimatedFlatList
					data={pairs}
					renderItem={({ item }: { item: any[] }) => (
						<View style={styles.row}>
							{item.map((fav: any) => (
								<ListingCard
									key={fav.id}
									listing={getListing(fav)}
									width={cardWidth}
									isFavorite
									onToggleFavorite={() => removeFavorite(getListing(fav))}
									onPress={(id) => router.push(`/listing/${id}`)}
								/>
							))}
						</View>
					)}
					keyExtractor={(row: any[]) => row.map((fav) => fav.id).join("|")}
					contentContainerStyle={styles.list}
					onScroll={scrollHandler}
					scrollEventThrottle={16}
					keyboardDismissMode="on-drag"
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={c.primary}
							colors={[c.primary]}
						/>
					}
				/>
			)}
			{removed ? (
				<View
					style={[styles.undoBar, { backgroundColor: c.foreground }]}
					accessibilityLiveRegion="polite"
				>
					<Text
						style={[styles.undoText, { color: c.background }]}
						numberOfLines={1}
					>
						{t("favorites.removed", {
							title: removed.title ?? "",
							defaultValue: "« {{title}} » retiré des favoris",
						})}
					</Text>
					<Pressable
						onPress={undoRemove}
						accessibilityRole="button"
						accessibilityLabel={t("cart.undo")}
						style={styles.undoButton}
					>
						<Text style={[styles.undoAction, { color: c.background }]}>
							{t("cart.undo")}
						</Text>
					</Pressable>
				</View>
			) : null}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },

	/* ── Header ── */
	header: { gap: 12, paddingBottom: 12 },
	// Tab roots share the h1 large title (30/34), like Account and Search.
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 52,
		paddingHorizontal: 16,
		paddingTop: 8,
	},
	titleText: { flex: 1 },
	pageTitle: {
		fontSize: 30,
		lineHeight: 34,
		letterSpacing: -0.8,
		fontFamily: Fonts.displayExtrabold,
	},
	count: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
		marginTop: 2,
	},
	headerPane: { paddingTop: 12 },
	countPane: { paddingHorizontal: 16, marginTop: 0 },
	undoBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginHorizontal: 16,
		marginBottom: 8,
		paddingLeft: 16,
		paddingRight: 4,
		paddingVertical: 4,
		borderRadius: 12,
	},
	undoText: { flex: 1, fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	// A 48pt target for the one action in the bar.
	undoButton: {
		minHeight: 48,
		minWidth: 48,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	undoAction: { fontSize: 15, fontFamily: Fonts.bodyBold },
	edge: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: StyleSheet.hairlineWidth,
	},

	/* Search bar */
	searchWrap: { paddingHorizontal: 16 },
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
	},
	// Android's TextInput carries its own vertical padding.
	searchInput: {
		flex: 1,
		fontSize: 16,
		fontFamily: Fonts.body,
		paddingVertical: 10,
	},
	clearBubble: {
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},

	/* Sort row */
	sortScroll: { flexGrow: 0 },
	sortRow: {
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 16,
	},
	sortPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 40,
		borderRadius: 999,
		borderWidth: 1,
		paddingHorizontal: 14,
	},
	sortPillText: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},

	/* No results */
	noResultWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 32,
	},
	noResultIcon: { marginBottom: 12 },
	noResultTitle: {
		fontSize: 18,
		fontFamily: Fonts.displayBold,
		marginBottom: 6,
	},
	noResultSub: {
		fontSize: 15,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 22,
		marginBottom: 20,
	},
	clearBtn: {
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 20,
		justifyContent: "center",
	},
	clearBtnText: {
		fontSize: 16,
		fontFamily: Fonts.bodyBold,
	},

	/* List */
	list: { padding: 16, gap: 16, paddingBottom: 40 },
	row: { flexDirection: "row", gap: 12 },
	skeletonGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		padding: 16,
		gap: 12,
	},
});
