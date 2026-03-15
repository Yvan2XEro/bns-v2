import { Ionicons } from "@expo/vector-icons";
import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
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
	withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { SkeletonCard } from "@/src/components/SkeletonCard";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

const { width } = Dimensions.get("window");

const SORTS = [
	{ key: "newest", label: "Récents", icon: "time-outline" as const },
	{ key: "price_asc", label: "Prix ↑", icon: "trending-up-outline" as const },
	{
		key: "price_desc",
		label: "Prix ↓",
		icon: "trending-down-outline" as const,
	},
];

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export default function HomeScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const queryClient = useQueryClient();

	// ── Search state ──────────────────────────────────────────────
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [sort, setSort] = useState("newest");
	const [searchFocused, setSearchFocused] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>();
	const inputRef = useRef<TextInput>(null);

	// ── Animations ────────────────────────────────────────────────
	const scrollY = useSharedValue(0);
	const searchActive = useSharedValue(0);

	const scrollHandler = useAnimatedScrollHandler({
		onScroll: (e) => {
			scrollY.value = e.contentOffset.y;
		},
	});

	// Ligne 1 : logo+nom+avatar se masquent quand search actif
	const topRowStyle = useAnimatedStyle(() => ({
		height: interpolate(
			searchActive.value,
			[0, 1],
			[52, 0],
			Extrapolation.CLAMP,
		),
		opacity: interpolate(
			searchActive.value,
			[0, 0.5],
			[1, 0],
			Extrapolation.CLAMP,
		),
		overflow: "hidden" as const,
		marginBottom: interpolate(
			searchActive.value,
			[0, 1],
			[8, 0],
			Extrapolation.CLAMP,
		),
	}));

	// Logo shrinks on scroll
	const logoAnimStyle = useAnimatedStyle(() => {
		const size = interpolate(
			scrollY.value,
			[0, 70],
			[44, 28],
			Extrapolation.CLAMP,
		);
		return { width: size, height: size, borderRadius: size * 0.2 };
	});

	// AppName shrinks on scroll
	const appNameAnimStyle = useAnimatedStyle(() => ({
		fontSize: interpolate(
			scrollY.value,
			[0, 70],
			[26, 18],
			Extrapolation.CLAMP,
		),
	}));

	// Bouton Annuler slide depuis la droite
	const cancelStyle = useAnimatedStyle(() => ({
		width: interpolate(searchActive.value, [0, 1], [0, 72]),
		opacity: searchActive.value,
		overflow: "hidden" as const,
	}));

	// ── Handlers ──────────────────────────────────────────────────
	const handleQueryChange = (text: string) => {
		setQuery(text);
		clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => setDebouncedQuery(text), 300);
	};

	const onSearchFocus = () => {
		setSearchFocused(true);
		searchActive.value = withTiming(1, { duration: 250 });
	};

	const onSearchCancel = () => {
		setSearchFocused(false);
		setQuery("");
		setDebouncedQuery("");
		searchActive.value = withTiming(0, { duration: 200 });
		inputRef.current?.blur();
	};

	// ── Colors ────────────────────────────────────────────────────
	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const accentBg = isDark ? "#111827" : "#eef2ff";

	// ── Queries (home) ────────────────────────────────────────────
	const { data: categoriesData } = useQuery({
		queryKey: ["categories"],
		queryFn: () => api.get<{ categories: any[] }>("/api/public/categories"),
		staleTime: 60 * 60 * 1000,
	});

	const {
		data: recentData,
		isLoading: recentLoading,
		isError: recentError,
		refetch: refetchRecent,
	} = useQuery({
		queryKey: ["listings", "recent"],
		queryFn: () =>
			api.get<{ hits: any[]; total: number }>(
				"/api/public/search?limit=20&sort=newest&offset=0",
			),
	});

	const { data: favData } = useQuery({
		queryKey: ["favorites"],
		queryFn: () => api.get<{ docs: any[] }>("/api/favorites?limit=200"),
		enabled: !!user,
	});

	const categories = (categoriesData?.categories ?? [])
		.filter(Boolean)
		.slice(0, 8);
	const rawHits = Array.isArray(recentData)
		? recentData
		: (recentData?.hits ?? []);
	const homeListings = rawHits.filter(Boolean).map((l: any) => ({
		...l,
		isBoosted: !!(l.boostedUntil && new Date(l.boostedUntil) > new Date()),
	}));
	const boostedListings = homeListings.filter((l: any) => l.isBoosted);
	const favoriteIds = new Set(
		(favData?.docs ?? []).map((f: any) => f.listing?.id ?? f.listing),
	);

	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await queryClient.invalidateQueries({ queryKey: ["listings"] });
		await queryClient.invalidateQueries({ queryKey: ["favorites"] });
		setRefreshing(false);
	};

	// ── Queries (search) ──────────────────────────────────────────
	const isSearchMode = searchFocused || query.length > 0;

	const searchParams: Record<string, string> = {
		sort,
		...(debouncedQuery ? { q: debouncedQuery } : {}),
	};
	const queryString = Object.entries(searchParams)
		.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
		.join("&");

	const {
		data: searchData,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading: searchLoading,
	} = useInfiniteQuery({
		queryKey: ["search", searchParams],
		queryFn: ({ pageParam = 0 }) =>
			api.get<{ hits: any[]; total: number }>(
				`/api/public/search?${queryString}&limit=20&offset=${pageParam}`,
			),
		getNextPageParam: (lastPage, pages) => {
			const offset = pages.length * 20;
			return offset < lastPage.total ? offset : undefined;
		},
		initialPageParam: 0,
		enabled: isSearchMode,
	});

	const searchListings = (searchData?.pages.flatMap((p) => p.hits) ?? [])
		.filter(Boolean)
		.map((l: any) => ({
			...l,
			isBoosted: !!(l.boostedUntil && new Date(l.boostedUntil) > new Date()),
		}));
	const totalDocs = searchData?.pages[0]?.total ?? 0;

	const searchPairs: any[][] = [];
	for (let i = 0; i < searchListings.length; i += 2)
		searchPairs.push(searchListings.slice(i, i + 2));

	// ── Render ────────────────────────────────────────────────────
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			{/* ══ Header ══ */}
			<View style={[styles.header, { backgroundColor: accentBg }]}>
				{/* ── Ligne 1 : Logo  |  Nom  |  spacer  |  Avatar ── */}
				<Animated.View style={[styles.topRow, topRowStyle]}>
					<Animated.View style={[styles.logoImgWrap, logoAnimStyle]}>
						<Image
							source={require("@/assets/icon2.png")}
							style={{ width: "100%", height: "100%" }}
							contentFit="contain"
						/>
					</Animated.View>
					<Animated.Text
						style={[styles.appName, { color: textColor }, appNameAnimStyle]}
					>
						{"Buy"}
						<Text style={{ color: "#f59e0b" }}>'N'</Text>
						{"Sellem"}
					</Animated.Text>

					<View style={{ flex: 1 }} />

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
							<Ionicons name="person-outline" size={18} color={mutedColor} />
						)}
					</Pressable>
				</Animated.View>

				{/* ── Ligne 2 : Barre de recherche  |  Annuler ── */}
				<View style={styles.searchRow}>
					<View
						style={[
							styles.searchWrap,
							{
								backgroundColor: cardBg,
								borderColor: isSearchMode ? primaryColor : borderColor,
							},
						]}
					>
						<View
							style={[
								styles.searchIconCircle,
								{ backgroundColor: isSearchMode ? primaryColor : accentBg },
							]}
						>
							<Ionicons
								name="search"
								size={15}
								color={isSearchMode ? "#fff" : primaryColor}
							/>
						</View>
						<TextInput
							ref={inputRef}
							value={query}
							onChangeText={handleQueryChange}
							onFocus={onSearchFocus}
							placeholder="Voitures, téléphones, maisons…"
							placeholderTextColor={mutedColor}
							style={[
								styles.searchInput,
								{ color: textColor, fontFamily: Fonts.body },
							]}
							returnKeyType="search"
						/>
						{query.length > 0 && (
							<Pressable
								onPress={() => {
									setQuery("");
									setDebouncedQuery("");
								}}
								hitSlop={10}
							>
								<Ionicons name="close-circle" size={18} color={mutedColor} />
							</Pressable>
						)}
					</View>

					{/* Bouton Annuler animé */}
					<Animated.View style={cancelStyle}>
						<Pressable onPress={onSearchCancel} style={styles.cancelBtn}>
							<Text style={[styles.cancelText, { color: primaryColor }]}>
								Annuler
							</Text>
						</Pressable>
					</Animated.View>
				</View>
			</View>

			{/* ══ Content ══ */}
			{isSearchMode ? (
				/* ── MODE RECHERCHE ── */
				<View style={[styles.content, { backgroundColor: bg }]}>
					<View style={[styles.sortBar, { borderBottomColor: borderColor }]}>
						<View style={styles.sortPills}>
							{SORTS.map((s) => {
								const active = sort === s.key;
								return (
									<Pressable
										key={s.key}
										onPress={() => setSort(s.key)}
										style={[
											styles.sortPill,
											{
												backgroundColor: active
													? primaryColor
													: isDark
														? "#1e293b"
														: "#f1f5f9",
											},
										]}
									>
										<Ionicons
											name={s.icon}
											size={12}
											color={active ? "#fff" : mutedColor}
										/>
										<Text
											style={[
												styles.sortText,
												{
													color: active ? "#fff" : mutedColor,
													fontFamily: Fonts.bodySemibold,
												},
											]}
										>
											{s.label}
										</Text>
									</Pressable>
								);
							})}
						</View>
						{debouncedQuery && totalDocs > 0 && !searchLoading && (
							<View
								style={[styles.countBadge, { backgroundColor: primaryColor }]}
							>
								<Text style={styles.countText}>{totalDocs}</Text>
							</View>
						)}
					</View>

					{searchLoading ? (
						<View style={styles.skeletonGrid}>
							{Array.from({ length: 6 }).map((_, i) => (
								<SkeletonCard key={i} />
							))}
						</View>
					) : searchListings.length === 0 ? (
						<EmptyState
							icon="search-outline"
							title="Aucun résultat"
							subtitle="Essayez d'autres mots-clés"
							ctaLabel="Effacer"
							onCta={() => {
								setQuery("");
								setDebouncedQuery("");
							}}
						/>
					) : (
						<FlatList
							data={searchPairs}
							renderItem={({ item }) => (
								<View style={styles.row}>
									{item.map((listing: any) => (
										<ListingCard
											key={listing.id}
											listing={listing}
											isFavorite={favoriteIds.has(listing.id)}
											onToggleFavorite={() => {}}
											onPress={(id) => router.push(`/listing/${id}`)}
										/>
									))}
								</View>
							)}
							keyExtractor={(_, i) => String(i)}
							contentContainerStyle={styles.list}
							onEndReached={() =>
								hasNextPage && !isFetchingNextPage && fetchNextPage()
							}
							onEndReachedThreshold={0.5}
							showsVerticalScrollIndicator={false}
							ListFooterComponent={
								isFetchingNextPage ? (
									<ActivityIndicator
										color={primaryColor}
										style={{ margin: 16 }}
									/>
								) : null
							}
						/>
					)}
				</View>
			) : (
				/* ── MODE ACCUEIL ── */
				<AnimatedScrollView
					style={{ flex: 1 }}
					showsVerticalScrollIndicator={false}
					onScroll={scrollHandler}
					scrollEventThrottle={16}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={primaryColor}
						/>
					}
				>
					<View style={[styles.homeContent, { backgroundColor: bg }]}>
						{/* Catégories */}
						{categories.length > 0 && (
							<View style={styles.section}>
								<View style={styles.sectionHeader}>
									<Text style={[styles.sectionTitle, { color: textColor }]}>
										Catégories
									</Text>
								</View>
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									contentContainerStyle={styles.catList}
								>
									{categories.map((cat: any, i: number) => (
										<CategoryIcon
											key={cat.id}
											category={cat}
											colorIndex={i}
											onPress={() => {
												setQuery(cat.name ?? "");
												setDebouncedQuery(cat.name ?? "");
												onSearchFocus();
											}}
										/>
									))}
								</ScrollView>
							</View>
						)}

						{/* À la une */}
						{boostedListings.length > 0 && (
							<View style={styles.section}>
								<View style={styles.sectionHeader}>
									<View style={styles.sectionTitleRow}>
										<Ionicons name="flash" size={16} color="#f59e0b" />
										<Text style={[styles.sectionTitle, { color: textColor }]}>
											À la une
										</Text>
									</View>
								</View>
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									pagingEnabled
									contentContainerStyle={styles.featuredList}
								>
									{boostedListings.slice(0, 6).map((listing: any) => (
										<Pressable
											key={listing.id}
											onPress={() => router.push(`/listing/${listing.id}`)}
											style={[
												styles.featuredCard,
												{ backgroundColor: cardBg, width: width - 48 },
											]}
										>
											<Image
												source={{
													uri:
														resolveListingImageUrl(listing.images?.[0]) ??
														undefined,
												}}
												style={styles.featuredImage}
												contentFit="cover"
												placeholder={{
													blurhash: "LGF5?xYk^6#M@-5c,1J5@[or[Q6.",
												}}
											/>
											<View style={styles.featuredOverlay}>
												<View style={styles.featuredBadge}>
													<Ionicons name="flash" size={11} color="#fff" />
													<Text style={styles.featuredBadgeText}>À la une</Text>
												</View>
												<Text style={styles.featuredPrice}>
													{listing.price?.toLocaleString()} XAF
												</Text>
												<Text style={styles.featuredTitle} numberOfLines={1}>
													{listing.title}
												</Text>
												<View style={styles.featuredMeta}>
													<Ionicons
														name="location-outline"
														size={12}
														color="rgba(255,255,255,0.8)"
													/>
													<Text style={styles.featuredMetaText}>
														{listing.location}
													</Text>
												</View>
											</View>
										</Pressable>
									))}
								</ScrollView>
							</View>
						)}

						{/* Annonces récentes */}
						<View style={styles.section}>
							<View style={styles.sectionHeader}>
								<Text style={[styles.sectionTitle, { color: textColor }]}>
									Annonces récentes
								</Text>
								<Pressable onPress={onSearchFocus}>
									<Text style={[styles.seeAll, { color: primaryColor }]}>
										Voir tout
									</Text>
								</Pressable>
							</View>
							{recentLoading ? (
								<View style={styles.grid}>
									{Array.from({ length: 6 }).map((_, i) => (
										<SkeletonCard key={i} />
									))}
								</View>
							) : recentError ? (
								<EmptyState
									icon="cloud-offline-outline"
									title="Erreur de chargement"
									subtitle="Vérifiez votre connexion"
									ctaLabel="Réessayer"
									onCta={() => refetchRecent()}
								/>
							) : homeListings.length === 0 ? (
								<EmptyState
									icon="storefront-outline"
									title="Aucune annonce"
									subtitle="Soyez le premier à publier !"
									ctaLabel="Publier"
									onCta={() => router.push("/(tabs)/create")}
								/>
							) : (
								<View style={styles.grid}>
									{homeListings.map((listing: any) => (
										<ListingCard
											key={listing.id}
											listing={listing}
											isFavorite={favoriteIds.has(listing.id)}
											onToggleFavorite={() => {}}
											onPress={(id) => router.push(`/listing/${id}`)}
										/>
									))}
								</View>
							)}
						</View>
					</View>
				</AnimatedScrollView>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },

	/* ── Header ── */
	header: {
		paddingHorizontal: 14,
		paddingTop: 6,
		paddingBottom: 10,
		gap: 0, // géré par marginBottom animé de topRow
	},

	/* Ligne 1 : logo | nom | spacer | avatar */
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		height: 52, // hauteur fixe → l'animation collapse à 0
		marginBottom: 8,
		overflow: "hidden",
	},
	logoImgWrap: { width: 44, height: 44, borderRadius: 9, overflow: "hidden" },
	appName: {
		fontSize: 26,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
	},
	avatarBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		overflow: "hidden",
	},
	avatar: { width: 36, height: 36 },

	/* Ligne 2 : search + annuler */
	searchRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	searchWrap: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 16,
		borderWidth: 1.5,
		paddingHorizontal: 8,
		paddingVertical: 8,
		shadowColor: "#1e40af",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 6,
		elevation: 2,
	},
	searchIconCircle: {
		width: 32,
		height: 32,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	searchInput: {
		flex: 1,
		fontSize: 15,
		padding: 0,
	},
	cancelBtn: {
		paddingHorizontal: 2,
		alignItems: "center",
		justifyContent: "center",
		height: 44,
	},
	cancelText: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},

	/* ── Home content ── */
	homeContent: {
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		paddingBottom: 40,
	},
	section: { marginTop: 20 },
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 16,
		marginBottom: 12,
	},
	sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	sectionTitle: { fontSize: 17, fontFamily: Fonts.displayBold },
	seeAll: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	catList: { paddingHorizontal: 16, gap: 8 },

	/* ── Featured ── */
	featuredList: { paddingHorizontal: 16, gap: 12 },
	featuredCard: { borderRadius: 14, overflow: "hidden" },
	featuredImage: { width: "100%", height: 190 },
	featuredOverlay: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		padding: 12,
		backgroundColor: "rgba(0,0,0,0.45)",
	},
	featuredBadge: {
		backgroundColor: "#f59e0b",
		alignSelf: "flex-start",
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 3,
		marginBottom: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	featuredBadgeText: {
		color: "#fff",
		fontSize: 11,
		fontFamily: Fonts.displayBold,
	},
	featuredPrice: {
		color: "#fff",
		fontSize: 18,
		fontFamily: Fonts.displayExtrabold,
	},
	featuredTitle: { color: "#fff", fontSize: 14, fontFamily: Fonts.body },
	featuredMeta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: 2,
	},
	featuredMetaText: {
		color: "rgba(255,255,255,0.8)",
		fontSize: 12,
		fontFamily: Fonts.body,
	},

	/* ── Grid ── */
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		paddingHorizontal: 16,
		gap: 12,
		paddingBottom: 20,
	},

	/* ── Search mode ── */
	content: {
		flex: 1,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		overflow: "hidden",
	},
	sortBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderBottomWidth: 1,
	},
	sortPills: { flexDirection: "row", gap: 6 },
	sortPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	sortText: { fontSize: 12 },
	countBadge: {
		borderRadius: 10,
		paddingHorizontal: 8,
		paddingVertical: 2,
		minWidth: 28,
		alignItems: "center",
	},
	countText: { color: "#fff", fontSize: 12, fontFamily: Fonts.displayBold },
	list: { padding: 16, gap: 12, paddingBottom: 40 },
	row: { flexDirection: "row", gap: 12, marginBottom: 0 },
	skeletonGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		padding: 16,
		gap: 12,
	},
});
