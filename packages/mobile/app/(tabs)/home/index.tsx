import { Ionicons } from "@expo/vector-icons";
import { useCounts } from "@novu/react-native";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
	FlatList,
	KeyboardAvoidingView,
	Modal,
	Platform,
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
import { useNotificationReady } from "@/src/contexts/NotificationReadyContext";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import {
	resolveImageUrl,
	resolveListingImageUrl,
} from "@/src/lib/resolveImageUrl";

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

// ─── Notification bell ────────────────────────────────────────────────────────
// Isolated component so useCounts (from @novu/react-native) runs inside
// NovuProvider. When the user is not authenticated, this component is not
// rendered so the hook is never called outside its provider.

function NotificationBell({
	cardBg,
	borderColor,
	mutedColor,
}: {
	cardBg: string;
	borderColor: string;
	mutedColor: string;
}) {
	const { counts } = useCounts({ filters: [{ read: false }] });
	const unseenCount = counts?.[0]?.count ?? 0;

	return (
		<Pressable
			onPress={() => router.push("/account/notifications")}
			style={[styles.bellBtn, { backgroundColor: cardBg, borderColor }]}
		>
			<Ionicons name="notifications-outline" size={18} color={mutedColor} />
			{unseenCount > 0 && <View style={styles.bellBadge} />}
		</Pressable>
	);
}

export default function HomeScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const novuReady = useNotificationReady();
	const queryClient = useQueryClient();
	const filterParams = useLocalSearchParams();

	// ── Search state ──────────────────────────────────────────────
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [sort, setSort] = useState("newest");
	const [searchFocused, setSearchFocused] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
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
		clearTimeout(debounceRef.current || undefined);
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
		// Efface aussi les filtres URL si présents
		if (activeFilterCount > 0) {
			const resetParams: Record<string, undefined> = {
				category: undefined,
				minPrice: undefined,
				maxPrice: undefined,
				conditions: undefined,
				location: undefined,
				radius: undefined,
			};
			for (const key of Object.keys(attrParams)) {
				resetParams[key] = undefined;
			}
			router.setParams(resetParams);
		}
	};

	// ── Colors ────────────────────────────────────────────────────
	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const accentBg = isDark ? "#111827" : "#eef2ff";

	// ── Géolocalisation ───────────────────────────────────────────
	const [userCoords, setUserCoords] = useState<{
		lat: number;
		lng: number;
	} | null>(null);
	const [locationDenied, setLocationDenied] = useState(false);

	useEffect(() => {
		(async () => {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") {
				setLocationDenied(true);
				return;
			}
			const pos = await Location.getCurrentPositionAsync({
				accuracy: Location.Accuracy.Balanced,
			});
			setUserCoords({
				lat: pos.coords.latitude,
				lng: pos.coords.longitude,
			});
		})();
	}, []);

	// ── Save search dialog ─────────────────────────────────────────
	const [saveDialogOpen, setSaveDialogOpen] = useState(false);
	const [saveName, setSaveName] = useState("");
	const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
		"idle",
	);

	const { mutate: saveSearch } = useMutation({
		mutationFn: () => {
			const urlParams = new URLSearchParams();
			if (debouncedQuery) urlParams.set("q", debouncedQuery);
			for (const [k, v] of Object.entries(searchParams)) {
				if (v && k !== "sort") urlParams.set(k, v);
			}
			return api.post("/api/saved-searches", {
				name: saveName.trim() || debouncedQuery || "Ma recherche",
				query: debouncedQuery,
				filters: {
					category: filterParams.category,
					minPrice: filterParams.minPrice,
					maxPrice: filterParams.maxPrice,
					conditions: filterParams.conditions,
					location: filterParams.location,
					sort,
					...attrParams,
				},
				url: `/search?${urlParams.toString()}`,
			});
		},
		onSuccess: () => {
			setSaveStatus("saved");
			setTimeout(() => {
				setSaveDialogOpen(false);
				setSaveStatus("idle");
				setSaveName("");
			}, 1200);
		},
		onError: () => setSaveStatus("idle"),
	});

	const openSaveDialog = () => {
		setSaveName(debouncedQuery || "");
		setSaveStatus("idle");
		setSaveDialogOpen(true);
	};

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

	const { favoriteIds, toggleFavorite } = useFavoriteActions();

	const { data: nearbyData } = useQuery({
		queryKey: ["listings", "nearby", userCoords],
		queryFn: () =>
			api.get<{ hits: any[]; total: number }>(
				`/api/public/search?lat=${userCoords?.lat}&lng=${userCoords?.lng}&radius=50&limit=10&sort=newest`,
			),
		enabled: !!userCoords,
		staleTime: 5 * 60 * 1000,
	});
	const nearbyListings = (nearbyData?.hits ?? [])
		.filter(Boolean)
		.map((l: any) => ({
			...l,
			isBoosted: !!(l.boostedUntil && new Date(l.boostedUntil) > new Date()),
		}));

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
	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await queryClient.invalidateQueries({ queryKey: ["listings"] });
		await queryClient.invalidateQueries({ queryKey: ["favorites"] });
		setRefreshing(false);
	};

	// ── Queries (search) ──────────────────────────────────────────
	// Extraire les attr_* depuis les params URL
	const attrParams: Record<string, string> = {};
	for (const [key, value] of Object.entries(filterParams)) {
		if (key.startsWith("attr_") && typeof value === "string" && value) {
			attrParams[key] = value;
		}
	}

	const activeFilterCount = [
		filterParams.category,
		filterParams.minPrice,
		filterParams.maxPrice,
		filterParams.conditions,
		filterParams.location,
		...Object.values(attrParams),
	].filter(Boolean).length;

	const isSearchMode =
		searchFocused || query.length > 0 || activeFilterCount > 0;

	const openFilters = () =>
		router.push({
			pathname: "/filters",
			params: {
				returnTo: "/(tabs)/home",
				category: (filterParams.category as string) ?? "",
				minPrice: (filterParams.minPrice as string) ?? "",
				maxPrice: (filterParams.maxPrice as string) ?? "",
				conditions: (filterParams.conditions as string) ?? "",
				location: (filterParams.location as string) ?? "",
				radius: (filterParams.radius as string) ?? "",
				...attrParams,
			},
		});

	const searchParams: Record<string, string> = {
		sort,
		...(debouncedQuery ? { q: debouncedQuery } : {}),
		...(filterParams.category
			? { category: filterParams.category as string }
			: {}),
		...(filterParams.minPrice
			? { minPrice: filterParams.minPrice as string }
			: {}),
		...(filterParams.maxPrice
			? { maxPrice: filterParams.maxPrice as string }
			: {}),
		...(filterParams.conditions
			? { condition: filterParams.conditions as string }
			: {}),
		...(filterParams.location
			? { location: filterParams.location as string }
			: {}),
		...(filterParams.location && filterParams.radius
			? { radius: filterParams.radius as string }
			: {}),
		...attrParams,
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

					{/* Bell icon — only rendered after NovuProvider context is established */}
					{user && novuReady && (
						<NotificationBell
							cardBg={cardBg}
							borderColor={borderColor}
							mutedColor={mutedColor}
						/>
					)}

					<Pressable
						onPress={() => router.push("/(tabs)/account")}
						style={[styles.avatarBtn, { backgroundColor: cardBg, borderColor }]}
					>
						{(user as any)?.avatar?.url ? (
							<Image
								source={{
									uri:
										resolveImageUrl((user as any).avatar.url) ??
										(user as any).avatar.url,
								}}
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
				<>
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
							<View
								style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
							>
								{debouncedQuery && totalDocs > 0 && !searchLoading && (
									<View
										style={[
											styles.countBadge,
											{ backgroundColor: primaryColor },
										]}
									>
										<Text style={styles.countText}>{totalDocs}</Text>
									</View>
								)}
								<Pressable
									onPress={openFilters}
									style={[
										styles.sortPill,
										{
											backgroundColor:
												activeFilterCount > 0
													? primaryColor
													: isDark
														? "#1e293b"
														: "#f1f5f9",
										},
									]}
								>
									<Ionicons
										name="options"
										size={12}
										color={activeFilterCount > 0 ? "#fff" : mutedColor}
									/>
									<Text
										style={[
											styles.sortText,
											{
												color: activeFilterCount > 0 ? "#fff" : mutedColor,
												fontFamily: Fonts.bodySemibold,
											},
										]}
									>
										{activeFilterCount > 0
											? `Filtres (${activeFilterCount})`
											: "Filtres"}
									</Text>
								</Pressable>
							</View>
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
												onToggleFavorite={() => toggleFavorite(listing)}
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

					{/* Save Search FAB */}
					{(debouncedQuery || activeFilterCount > 0) && user && (
						<Pressable
							style={[styles.fab, { backgroundColor: primaryColor }]}
							onPress={openSaveDialog}
						>
							<Ionicons name="bookmark" size={18} color="#fff" />
							<Text style={[styles.fabText, { fontFamily: Fonts.displayBold }]}>
								Sauvegarder
							</Text>
						</Pressable>
					)}
				</>
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
									{categories.map((cat: any, _i: number) => (
										<CategoryIcon
											key={cat.id}
											category={cat}
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
											onToggleFavorite={() => toggleFavorite(listing)}
											onPress={(id) => router.push(`/listing/${id}`)}
										/>
									))}
								</View>
							)}
						</View>
					</View>

					{/* ── Annonces proches de vous ── */}
					<View style={styles.section}>
						<View style={styles.sectionHeader}>
							<View style={styles.sectionTitleRow}>
								<Ionicons name="navigate" size={16} color={primaryColor} />
								<Text style={[styles.sectionTitle, { color: textColor }]}>
									Près de vous
								</Text>
							</View>
						</View>
						{locationDenied ? (
							<Pressable
								onPress={async () => {
									const { status } =
										await Location.requestForegroundPermissionsAsync();
									if (status === "granted") {
										setLocationDenied(false);
										const pos = await Location.getCurrentPositionAsync({
											accuracy: Location.Accuracy.Balanced,
										});
										setUserCoords({
											lat: pos.coords.latitude,
											lng: pos.coords.longitude,
										});
									}
								}}
								style={[
									styles.locationPrompt,
									{
										backgroundColor: isDark ? "#1e293b" : "#eef2ff",
										borderColor: isDark ? "#1e3a5f" : "#bfdbfe",
									},
								]}
							>
								<Ionicons
									name="location-outline"
									size={20}
									color={primaryColor}
								/>
								<View style={{ flex: 1 }}>
									<Text
										style={[styles.locationPromptTitle, { color: textColor }]}
									>
										Activer la localisation
									</Text>
									<Text
										style={[styles.locationPromptSub, { color: mutedColor }]}
									>
										Découvrez les annonces autour de vous
									</Text>
								</View>
								<Ionicons name="chevron-forward" size={16} color={mutedColor} />
							</Pressable>
						) : !userCoords ? (
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={styles.nearbyList}
							>
								{Array.from({ length: 4 }).map((_, i) => (
									<SkeletonCard key={i} />
								))}
							</ScrollView>
						) : nearbyListings.length === 0 ? (
							<View
								style={[
									styles.locationPrompt,
									{
										backgroundColor: isDark ? "#1e293b" : "#f8fafc",
										borderColor,
									},
								]}
							>
								<Ionicons name="map-outline" size={20} color={mutedColor} />
								<Text style={[styles.locationPromptSub, { color: mutedColor }]}>
									Aucune annonce dans un rayon de 50 km
								</Text>
							</View>
						) : (
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={styles.nearbyList}
							>
								{nearbyListings.map((listing: any) => (
									<ListingCard
										key={listing.id}
										listing={listing}
										isFavorite={favoriteIds.has(listing.id)}
										onToggleFavorite={() => toggleFavorite(listing)}
										onPress={(id) => router.push(`/listing/${id}`)}
									/>
								))}
							</ScrollView>
						)}
					</View>
				</AnimatedScrollView>
			)}

			{/* Save dialog */}
			<Modal
				visible={saveDialogOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setSaveDialogOpen(false)}
			>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.modalOverlay}
				>
					<Pressable
						style={StyleSheet.absoluteFill}
						onPress={() => setSaveDialogOpen(false)}
					/>
					<View
						style={[styles.modalCard, { backgroundColor: cardBg, borderColor }]}
					>
						<Text style={[styles.modalTitle, { color: textColor }]}>
							Sauvegarder la recherche
						</Text>
						<Text style={[styles.modalSub, { color: mutedColor }]}>
							Nommez cette recherche pour la retrouver facilement.
						</Text>
						<TextInput
							value={saveName}
							onChangeText={setSaveName}
							placeholder={debouncedQuery || "Ex : Voitures à Douala"}
							placeholderTextColor={mutedColor}
							autoFocus
							style={[
								styles.modalInput,
								{
									color: textColor,
									borderColor: primaryColor,
									backgroundColor: isDark ? "#0b1120" : "#f8fafc",
								},
							]}
							returnKeyType="done"
							onSubmitEditing={() => saveStatus === "idle" && saveSearch()}
						/>
						<View style={styles.modalActions}>
							<Pressable
								onPress={() => setSaveDialogOpen(false)}
								style={[
									styles.modalBtn,
									{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
								]}
							>
								<Text style={[styles.modalBtnText, { color: mutedColor }]}>
									Annuler
								</Text>
							</Pressable>
							<Pressable
								onPress={() => saveStatus === "idle" && saveSearch()}
								disabled={saveStatus !== "idle"}
								style={[
									styles.modalBtn,
									{
										backgroundColor:
											saveStatus === "saved" ? "#16a34a" : primaryColor,
									},
								]}
							>
								{saveStatus === "saving" ? (
									<ActivityIndicator size="small" color="#fff" />
								) : saveStatus === "saved" ? (
									<>
										<Ionicons name="checkmark" size={15} color="#fff" />
										<Text style={styles.modalBtnTextPrimary}>Sauvegardé !</Text>
									</>
								) : (
									<>
										<Ionicons name="bookmark" size={15} color="#fff" />
										<Text style={styles.modalBtnTextPrimary}>Sauvegarder</Text>
									</>
								)}
							</Pressable>
						</View>
					</View>
				</KeyboardAvoidingView>
			</Modal>
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
	bellBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		position: "relative",
	},
	bellBadge: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#ef4444",
		borderWidth: 1.5,
		borderColor: "#fff",
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

	/* ── Save Search FAB ── */
	fab: {
		position: "absolute",
		bottom: 16,
		alignSelf: "center",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 18,
		paddingVertical: 12,
		borderRadius: 28,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 6,
	},
	fabText: { color: "#fff", fontSize: 14 },

	/* ── Save Search Modal ── */
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.5)",
		justifyContent: "flex-end",
	},
	modalCard: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		padding: 24,
		borderTopWidth: 1,
		gap: 12,
	},
	modalTitle: { fontSize: 17, fontFamily: Fonts.displayBold },
	modalSub: { fontSize: 13, fontFamily: Fonts.body },
	modalInput: {
		borderWidth: 1.5,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
	modalBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 12,
		paddingVertical: 13,
	},
	modalBtnText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	modalBtnTextPrimary: {
		color: "#fff",
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},

	/* ── Nearby / Location prompt ── */
	locationPrompt: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginHorizontal: 16,
		padding: 14,
		borderRadius: 12,
		borderWidth: 1,
	},
	locationPromptTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	locationPromptSub: { fontSize: 12, fontFamily: Fonts.body, marginTop: 2 },
	nearbyList: { paddingHorizontal: 16, gap: 12 },
});
