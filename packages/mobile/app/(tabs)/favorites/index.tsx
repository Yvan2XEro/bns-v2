import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import React, { useMemo } from "react";
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
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { useTranslation } from "@/src/lib/i18n";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<any[]>);

// Height of the expanded title row (icon 44 + gap between rows ~16)
const EXPANDED_ROW_H = 60;

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

export default function FavoritesScreen() {
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
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const mutedColor = c.mutedForeground;
	/** Brand words and outlines; fills behind white use `c.primaryFill`. */
	const primaryColor = c.link;
	const borderColor = c.border;
	const accentBg = bg;
	const heartTile = c.dangerTint;
	const heart = isDark ? c.dangerText : c.destructive;

	// ── Scroll ──────────────────────────────────────────────────────
	const scrollY = useSharedValue(0);
	const scrollHandler = useAnimatedScrollHandler({
		onScroll: (e) => {
			scrollY.value = e.contentOffset.y;
		},
	});

	// Expanded row shrinks from EXPANDED_ROW_H → 0
	const expandedRowStyle = useAnimatedStyle(() => ({
		height: interpolate(
			scrollY.value,
			[0, EXPANDED_ROW_H],
			[EXPANDED_ROW_H, 0],
			Extrapolation.CLAMP,
		),
		opacity: interpolate(
			scrollY.value,
			[0, EXPANDED_ROW_H * 0.6],
			[1, 0],
			Extrapolation.CLAMP,
		),
		overflow: "hidden",
	}));

	// Compact bar fades in once expanded row is mostly gone
	const compactStyle = useAnimatedStyle(() => ({
		opacity: interpolate(
			scrollY.value,
			[EXPANDED_ROW_H * 0.5, EXPANDED_ROW_H],
			[0, 1],
			Extrapolation.CLAMP,
		),
		transform: [
			{
				translateY: interpolate(
					scrollY.value,
					[EXPANDED_ROW_H * 0.5, EXPANDED_ROW_H],
					[6, 0],
					Extrapolation.CLAMP,
				),
			},
		],
	}));

	// ── Data ────────────────────────────────────────────────────────
	const { favorites, isLoading, refetch, toggleFavorite } =
		useFavoriteActions();

	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	const getListing = (fav: any) => fav.listing ?? fav;

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
	}, [favorites, query, sortKey, getListing]);

	const pairs = chunkIntoRows(filtered, columns);

	// ── Not logged in ───────────────────────────────────────────────
	if (!user) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View style={[styles.heartIconWrap, { backgroundColor: heartTile }]}>
						<Ionicons name="heart" size={22} color={heart} />
					</View>
					<Text
						accessibilityRole="header"
						style={[styles.pageTitle, { color: textColor }]}
					>
						{t("favorites.title")}
					</Text>
				</View>
				<View style={[styles.contentWrap, { backgroundColor: bg }]}>
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
					/>
				</View>
			</SafeAreaView>
		);
	}

	const hasToolbar = !isLoading && favorites.length > 0;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			{/* ══ Header ══ */}
			<View style={[styles.headerWrap, { backgroundColor: accentBg }]}>
				{/* Expanded row — collapses on scroll */}
				<Animated.View style={[styles.expandedRow, expandedRowStyle]}>
					<View style={[styles.heartIconWrap, { backgroundColor: heartTile }]}>
						<Ionicons name="heart" size={22} color={heart} />
					</View>
					<View style={{ flex: 1 }}>
						<Text
							accessibilityRole="header"
							style={[styles.pageTitle, { color: textColor }]}
						>
							{t("favorites.title")}
						</Text>
						{favorites.length > 0 && (
							<Text style={[styles.expandedCount, { color: mutedColor }]}>
								{filtered.length !== favorites.length
									? `${filtered.length} / ${t("favorites.listingCount", { count: favorites.length })}`
									: t("favorites.listingsSaved", { count: favorites.length })}
							</Text>
						)}
					</View>
					<Pressable
						onPress={() => router.push("/(tabs)/account")}
						accessibilityRole="button"
						accessibilityLabel={t("account.myAccount")}
						hitSlop={4}
						style={[styles.avatarBtn, { backgroundColor: cardBg, borderColor }]}
					>
						{(user as any)?.avatar?.url ? (
							<Image
								source={{ uri: (user as any).avatar.url }}
								style={styles.avatar}
								contentFit="cover"
							/>
						) : (
							<Ionicons name="person" size={18} color={mutedColor} />
						)}
					</Pressable>
				</Animated.View>

				{/* Compact bar — appears on scroll */}
				<Animated.View
					style={[styles.compactBar, compactStyle]}
					pointerEvents="none"
				>
					<Ionicons name="heart" size={14} color={heart} />
					<Text style={[styles.compactTitle, { color: textColor }]}>
						{t("favorites.title")}
					</Text>
					{favorites.length > 0 && (
						<View
							style={[styles.compactBadge, { backgroundColor: c.primaryFill }]}
						>
							<Text style={styles.compactBadgeText}>{filtered.length}</Text>
						</View>
					)}
				</Animated.View>

				{/* Search bar — always visible */}
				<View style={styles.searchWrap}>
					<View
						style={[
							styles.searchBar,
							{
								backgroundColor: cardBg,
								borderColor: query.length > 0 ? c.primary : c.borderStrong,
							},
						]}
					>
						<Ionicons name="search" size={18} color={mutedColor} />
						<TextInput
							value={query}
							onChangeText={setQuery}
							placeholder={t("favorites.searchPlaceholder")}
							placeholderTextColor={mutedColor}
							accessibilityLabel={t("favorites.searchPlaceholder")}
							selectionColor={c.primary}
							returnKeyType="search"
							style={[styles.searchInput, { color: textColor }]}
						/>
						{query.length > 0 && (
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
									<Ionicons name="close" size={12} color={textColor} />
								</View>
							</Pressable>
						)}
					</View>
				</View>
			</View>

			{/* ══ Content ══ */}
			<View style={[styles.contentWrap, { backgroundColor: bg }]}>
				{/* Sort pills */}
				{hasToolbar && (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={[styles.sortScroll, { borderBottomColor: borderColor }]}
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
									hitSlop={{ top: 6, bottom: 6 }}
									style={[
										styles.sortPill,
										{
											backgroundColor: active ? c.primaryTint : cardBg,
											borderColor: active ? c.primary : borderColor,
										},
									]}
								>
									<Ionicons
										name={s.icon as any}
										size={14}
										color={active ? primaryColor : mutedColor}
									/>
									<Text
										style={[
											styles.sortPillText,
											{ color: active ? primaryColor : textColor },
										]}
									>
										{t(s.labelKey)}
									</Text>
								</Pressable>
							);
						})}
					</ScrollView>
				)}

				{/* List */}
				{isLoading ? (
					<View style={styles.skeletonGrid}>
						{Array.from({ length: columns * 3 }).map((_, i) => (
							<SkeletonCard key={i} cardWidth={cardWidth} />
						))}
					</View>
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
							color={mutedColor}
							style={{ marginBottom: 12 }}
						/>
						<Text
							accessibilityRole="header"
							style={[styles.noResultTitle, { color: textColor }]}
						>
							{t("favorites.noResults")}
						</Text>
						<Text style={[styles.noResultSub, { color: mutedColor }]}>
							{t("favorites.noResultsFor", { query })}
						</Text>
						<Pressable
							onPress={() => setQuery("")}
							accessibilityRole="button"
							style={[
								styles.clearBtn,
								{ borderColor: c.borderStrong, backgroundColor: cardBg },
							]}
						>
							<Text style={[styles.clearBtnText, { color: primaryColor }]}>
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
										onToggleFavorite={() => toggleFavorite(getListing(fav))}
										onPress={(id) => router.push(`/listing/${id}`)}
									/>
								))}
							</View>
						)}
						keyExtractor={(row: any[]) => row.map((fav) => fav.id).join("|")}
						contentContainerStyle={styles.list}
						onScroll={scrollHandler}
						scrollEventThrottle={16}
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
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },

	/* ── Header ── */
	headerWrap: {
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 12,
		gap: 12,
		zIndex: 10,
	},
	noUserHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 14,
	},

	/* Expanded row */
	expandedRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	heartIconWrap: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	pageTitle: {
		fontSize: 30,
		lineHeight: 34,
		letterSpacing: -0.8,
		fontFamily: Fonts.displayExtrabold,
	},
	expandedCount: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
		marginTop: 2,
	},
	avatarBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		overflow: "hidden",
		flexShrink: 0,
	},
	avatar: { width: 40, height: 40 },

	/* Compact bar */
	compactBar: {
		position: "absolute",
		left: 16,
		right: 16,
		top: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		height: EXPANDED_ROW_H,
	},
	compactTitle: {
		fontSize: 16,
		fontFamily: Fonts.displayBold,
	},
	compactBadge: {
		borderRadius: 10,
		paddingHorizontal: 7,
		paddingVertical: 1,
		minWidth: 22,
		alignItems: "center",
	},
	compactBadgeText: {
		color: "#fff",
		fontSize: 11,
		fontFamily: Fonts.displayBold,
	},

	/* Search bar */
	searchWrap: {
		// intentionally no extra padding — gap: 12 in headerWrap handles spacing
	},
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

	/* ── Content ── */
	contentWrap: {
		flex: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},

	/* Sort row */
	sortScroll: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
	sortRow: {
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	sortPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 36,
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
	noResultTitle: {
		fontSize: 18,
		fontFamily: Fonts.displayBold,
		marginBottom: 6,
	},
	noResultSub: {
		fontSize: 15,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 20,
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
