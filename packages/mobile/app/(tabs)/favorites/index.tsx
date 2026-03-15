import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
	FlatList,
	Pressable,
	RefreshControl,
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
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { SkeletonCard } from "@/src/components/SkeletonCard";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<any[]>);

// Height of the expanded title row (icon 44 + gap between rows ~16)
const EXPANDED_ROW_H = 60;

const SORTS = [
	{ key: "recent", label: "Récents", icon: "time-outline" },
	{ key: "price_asc", label: "Prix ↑", icon: "trending-up-outline" },
	{ key: "price_desc", label: "Prix ↓", icon: "trending-down-outline" },
	{ key: "az", label: "A → Z", icon: "text-outline" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

export default function FavoritesScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const queryClient = useQueryClient();

	const [query, setQuery] = React.useState("");
	const [sortKey, setSortKey] = React.useState<SortKey>("recent");
	const [refreshing, setRefreshing] = React.useState(false);

	// ── Colors ──────────────────────────────────────────────────────
	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const accentBg = isDark ? "#111827" : "#eef2ff";
	const inputBg = isDark ? "#162032" : "#f1f5f9";

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
	const { data, isLoading, refetch } = useQuery({
		queryKey: ["favorites"],
		queryFn: () => api.get<{ docs: any[] }>("/api/favorites?depth=1&limit=100"),
		enabled: !!user,
	});

	const favorites = data?.docs ?? [];

	const onRefresh = async () => {
		setRefreshing(true);
		await queryClient.invalidateQueries({ queryKey: ["favorites"] });
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

	const pairs: any[][] = [];
	for (let i = 0; i < filtered.length; i += 2)
		pairs.push(filtered.slice(i, i + 2));

	// ── Not logged in ───────────────────────────────────────────────
	if (!user) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View style={[styles.heartIconWrap, { backgroundColor: "#fee2e2" }]}>
						<Ionicons name="heart" size={22} color="#ef4444" />
					</View>
					<Text style={[styles.pageTitle, { color: textColor }]}>Favoris</Text>
				</View>
				<View style={[styles.contentWrap, { backgroundColor: bg }]}>
					<EmptyState
						icon="heart-outline"
						title="Connectez-vous"
						subtitle="Créez un compte pour sauvegarder vos annonces favorites"
						ctaLabel="Se connecter"
						onCta={() => router.push("/auth/login")}
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
					<View style={[styles.heartIconWrap, { backgroundColor: "#fee2e2" }]}>
						<Ionicons name="heart" size={22} color="#ef4444" />
					</View>
					<View style={{ flex: 1 }}>
						<Text style={[styles.pageTitle, { color: textColor }]}>
							Favoris
						</Text>
						{favorites.length > 0 && (
							<Text style={[styles.expandedCount, { color: mutedColor }]}>
								{filtered.length !== favorites.length
									? `${filtered.length} / ${favorites.length} annonce${favorites.length > 1 ? "s" : ""}`
									: `${favorites.length} annonce${favorites.length > 1 ? "s" : ""} sauvegardée${favorites.length > 1 ? "s" : ""}`}
							</Text>
						)}
					</View>
					<Pressable
						onPress={() => router.push("/(tabs)/account")}
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
					<Ionicons name="heart" size={14} color="#ef4444" />
					<Text style={[styles.compactTitle, { color: textColor }]}>
						Favoris
					</Text>
					{favorites.length > 0 && (
						<View
							style={[styles.compactBadge, { backgroundColor: primaryColor }]}
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
								borderColor: query.length > 0 ? primaryColor : borderColor,
								shadowColor: primaryColor,
								shadowOpacity: query.length > 0 ? 0.18 : 0,
							},
						]}
					>
						<View
							style={[
								styles.searchIconBubble,
								{
									backgroundColor:
										query.length > 0
											? primaryColor
											: isDark
												? "#1e3a5f"
												: "#dbeafe",
								},
							]}
						>
							<Ionicons
								name="search"
								size={14}
								color={query.length > 0 ? "#fff" : primaryColor}
							/>
						</View>
						<TextInput
							value={query}
							onChangeText={setQuery}
							placeholder="Rechercher dans mes favoris…"
							placeholderTextColor={mutedColor}
							style={[styles.searchInput, { color: textColor }]}
						/>
						{query.length > 0 && (
							<Pressable onPress={() => setQuery("")} hitSlop={10}>
								<View
									style={[
										styles.clearBubble,
										{ backgroundColor: isDark ? "#334155" : "#e2e8f0" },
									]}
								>
									<Ionicons name="close" size={11} color={mutedColor} />
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
					<View style={[styles.sortRow, { borderBottomColor: borderColor }]}>
						{SORTS.map((s) => {
							const active = sortKey === s.key;
							return (
								<Pressable
									key={s.key}
									onPress={() => setSortKey(s.key)}
									style={[
										styles.sortPill,
										{
											backgroundColor: active ? primaryColor : inputBg,
											borderColor: active ? primaryColor : borderColor,
										},
									]}
								>
									<Ionicons
										name={s.icon as any}
										size={11}
										color={active ? "#fff" : mutedColor}
									/>
									<Text
										style={[
											styles.sortPillText,
											{ color: active ? "#fff" : mutedColor },
										]}
									>
										{s.label}
									</Text>
								</Pressable>
							);
						})}
					</View>
				)}

				{/* List */}
				{isLoading ? (
					<View style={styles.skeletonGrid}>
						{Array.from({ length: 6 }).map((_, i) => (
							<SkeletonCard key={i} />
						))}
					</View>
				) : favorites.length === 0 ? (
					<EmptyState
						icon="heart-outline"
						title="Aucun favori"
						subtitle="Ajoutez des annonces à vos favoris pour les retrouver facilement"
						ctaLabel="Parcourir"
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
						<Text style={[styles.noResultTitle, { color: textColor }]}>
							Aucun résultat
						</Text>
						<Text style={[styles.noResultSub, { color: mutedColor }]}>
							Aucun favori ne correspond à « {query} »
						</Text>
						<Pressable
							onPress={() => setQuery("")}
							style={[styles.clearBtn, { borderColor: primaryColor }]}
						>
							<Text style={[styles.clearBtnText, { color: primaryColor }]}>
								Effacer
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
										isFavorite
										onToggleFavorite={() => {}}
										onPress={(id) => router.push(`/listing/${id}`)}
									/>
								))}
							</View>
						)}
						keyExtractor={(_: any, i: number) => String(i)}
						contentContainerStyle={styles.list}
						onScroll={scrollHandler}
						scrollEventThrottle={16}
						showsVerticalScrollIndicator={false}
						refreshControl={
							<RefreshControl
								refreshing={refreshing}
								onRefresh={onRefresh}
								tintColor={primaryColor}
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
		fontSize: 24,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.4,
		lineHeight: 28,
	},
	expandedCount: {
		fontSize: 12,
		fontFamily: Fonts.body,
		marginTop: 1,
	},
	avatarBtn: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		overflow: "hidden",
		flexShrink: 0,
	},
	avatar: { width: 38, height: 38 },

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
		gap: 9,
		borderRadius: 16,
		borderWidth: 1.5,
		paddingHorizontal: 10,
		paddingVertical: 9,
		shadowOffset: { width: 0, height: 3 },
		shadowRadius: 8,
		elevation: 0,
	},
	searchIconBubble: {
		width: 28,
		height: 28,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
	},
	searchInput: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	clearBubble: {
		width: 20,
		height: 20,
		borderRadius: 10,
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
	sortRow: {
		flexDirection: "row",
		gap: 7,
		paddingHorizontal: 14,
		paddingVertical: 12,
		borderBottomWidth: 1,
	},
	sortPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		borderWidth: 1.5,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	sortPillText: {
		fontSize: 12,
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
		fontSize: 13,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 20,
		marginBottom: 20,
	},
	clearBtn: {
		borderRadius: 20,
		borderWidth: 1.5,
		paddingHorizontal: 20,
		paddingVertical: 8,
	},
	clearBtnText: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},

	/* List */
	list: { padding: 16, gap: 12, paddingBottom: 40 },
	row: { flexDirection: "row", gap: 12 },
	skeletonGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		padding: 16,
		gap: 12,
	},
});
