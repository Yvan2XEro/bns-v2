import { Ionicons } from "@expo/vector-icons";
import { useCounts } from "@novu/react-native";
import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import React, { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	type TextInput,
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
import { ShellPattern } from "@/src/components/brand/BackgroundPattern";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { ListingGridSkeleton } from "@/src/components/listing/Skeletons";
import { LocationCard } from "@/src/components/location/LocationCard";
import { SearchField } from "@/src/components/SearchBar";
import { SkeletonCard } from "@/src/components/SkeletonCard";
import { useDiscoveryPalette } from "@/src/components/search/palette";
import {
	SaveSearchButton,
	SaveSearchDialog,
} from "@/src/components/search/SaveSearch";
import {
	FiltersChip,
	SortBar,
	type SortKey,
} from "@/src/components/search/SortBar";
import { useNotificationReady } from "@/src/contexts/NotificationReadyContext";
import { useApplyLaunchMode } from "@/src/hooks/useAppMode";
import { useCategoryCounts } from "@/src/hooks/useCategoryCounts";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import {
	CATEGORIES_QUERY_KEY,
	CATEGORIES_STALE_TIME_MS,
} from "@/src/hooks/useListings";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { categoryTree } from "@/src/lib/categoryTree";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import {
	resolveImageUrl,
	resolveListingImageUrl,
} from "@/src/lib/resolveImageUrl";
import { useUserLocation } from "@/src/lib/useUserLocation";
import { rankByCounts } from "../../../../api/src/contracts/categoryCounts";

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
const RECENT_PAGE = 20;

// ─── Notification bell ────────────────────────────────────────────────────────
// Isolated component so useCounts (from @novu/react-native) runs inside
// NovuProvider. When the user is not authenticated, this component is not
// rendered so the hook is never called outside its provider.

function NotificationBell({
	cardBg,
	borderColor,
	mutedColor,
	shellColor,
}: {
	cardBg: string;
	borderColor: string;
	mutedColor: string;
	shellColor: string;
}) {
	const { t } = useTranslation();
	const { counts } = useCounts({ filters: [{ read: false }] });
	const unseenCount = counts?.[0]?.count ?? 0;

	return (
		<Pressable
			onPress={() => router.push("/account/notifications")}
			hitSlop={4}
			accessibilityRole="button"
			accessibilityLabel={t("notifications.title")}
			style={[styles.bellBtn, { backgroundColor: cardBg, borderColor }]}
		>
			<Ionicons name="notifications-outline" size={20} color={mutedColor} />
			{unseenCount > 0 && (
				<View style={[styles.bellBadge, { borderColor: shellColor }]} />
			)}
		</Pressable>
	);
}
const darkIcon = require("@/assets/icon2-dark.png");
export default function HomeScreen() {
	useApplyLaunchMode();
	const c = useDiscoveryPalette();
	const reducedMotion = useReducedMotion();
	const { t } = useTranslation();
	const { user } = useAuth();
	const novuReady = useNotificationReady();
	const queryClient = useQueryClient();
	const filterParams = useLocalSearchParams();
	const { width, isTablet, columns, cardWidth } = useResponsive();
	// Hero cards stay readable instead of becoming a 970pt letterbox on iPad.
	const featuredWidth = isTablet ? Math.min(520, width - 48) : width - 48;
	const featuredHeight = isTablet ? 260 : 190;

	// ── Search state ──────────────────────────────────────────────
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [sort, setSort] = useState<SortKey>("newest");
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
		searchActive.value = withTiming(1, {
			duration: reducedMotion ? 0 : 250,
		});
	};

	const onSearchCancel = () => {
		setSearchFocused(false);
		setQuery("");
		setDebouncedQuery("");
		searchActive.value = withTiming(0, {
			duration: reducedMotion ? 0 : 200,
		});
		inputRef.current?.blur();
		// Efface aussi les filtres URL si présents
		if (activeFilterCount > 0) {
			const resetParams: Record<string, undefined> = {
				category: undefined,
				minPrice: undefined,
				maxPrice: undefined,
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
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const mutedColor = c.mutedForeground;
	const primaryColor = c.primary;
	const borderColor = c.border;
	// The ndop shell: the home header is the one indigo field in the app.
	const accentBg = c.shell;
	const shellIcon = c.shellForeground;
	const shellBtnBg = "rgba(255,255,255,0.12)";
	const shellBtnBorder = "rgba(255,255,255,0.16)";

	// White status-bar ink over the indigo, restored for every other screen.
	useFocusEffect(
		useCallback(() => {
			setStatusBarStyle("light");
			return () => setStatusBarStyle("auto");
		}, []),
	);

	// ── Géolocalisation ───────────────────────────────────────────
	// The remembered location: AsyncStorage when signed out, the user's profile
	// when signed in. `useUserLocation` hydrates from storage and re-reads the
	// permission with the non-prompting API — it never opens a dialog on mount.
	// The in-context prompt below is still the only thing that can ask.
	const {
		coords: userCoords,
		hydrated: locationHydrated,
		permission: locationPermission,
		detecting: locationDetecting,
		requestDetection,
		browsePlace,
		setBrowsePlace,
	} = useUserLocation();
	const browseCity = browsePlace?.name ?? null;

	// A city the user picked by hand carries coordinates too, so "near you"
	// works with no permission at all once a location is remembered.
	const showLocationPrompt =
		locationHydrated && !userCoords && locationPermission !== "granted";
	const locationRefused = locationPermission === "denied";
	// Skeletons only while something is actually in flight. With the permission
	// granted but no fix obtainable (geocoder down, GPS off), fall through to the
	// "nothing nearby" card rather than spinning forever.
	const locationPending = !locationHydrated || locationDetecting;

	// ── Save search dialog ─────────────────────────────────────────
	const [saveDialogOpen, setSaveDialogOpen] = useState(false);

	// ── Queries (home) ────────────────────────────────────────────
	const { data: categoriesData } = useQuery({
		queryKey: CATEGORIES_QUERY_KEY,
		queryFn: () => api.get<{ categories: any[] }>("/api/public/categories"),
		staleTime: CATEGORIES_STALE_TIME_MS,
	});

	// The feed goes on past the first twenty: "Show more" loads the next page
	// on demand, so a slow connection only pays for what is looked at.
	const {
		data: recentData,
		isLoading: recentLoading,
		isError: recentError,
		refetch: refetchRecent,
		fetchNextPage: fetchMoreRecent,
		hasNextPage: hasMoreRecent,
		isFetchingNextPage: loadingMoreRecent,
	} = useInfiniteQuery({
		queryKey: ["listings", "recent", browseCity],
		queryFn: ({ pageParam }: { pageParam: number }) =>
			api.get<{ hits: any[]; total: number }>(
				`/api/public/search?limit=${RECENT_PAGE}&sort=newest&offset=${pageParam}${
					browseCity ? `&location=${encodeURIComponent(browseCity)}` : ""
				}`,
			),
		initialPageParam: 0,
		getNextPageParam: (last, pages) => {
			const loaded = pages.reduce((n, page) => n + (page.hits?.length ?? 0), 0);
			return (last.hits?.length ?? 0) === RECENT_PAGE && loaded < last.total
				? loaded
				: undefined;
		},
	});
	const { data: featuredData } = useQuery({
		queryKey: ["listings", "featured"],
		queryFn: () =>
			api.get<{ hits: any[]; total: number }>(
				"/api/public/search?limit=6&boosted=true&sort=boosted&offset=0",
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

	// Two rows of rubrics; when there are more, the last cell is "See all".
	// The browsing city's best stocked rubrics first.
	const categoryCounts = useCategoryCounts(browseCity);
	const rubrics = React.useMemo(
		() =>
			rankByCounts(
				categoryTree(categoriesData?.categories ?? []),
				categoryCounts,
			).map((rubric) => ({
				...rubric,
				image: rubric.imageUrl ? { url: rubric.imageUrl } : undefined,
			})),
		[categoriesData, categoryCounts],
	);
	const catColumns = isTablet ? 8 : 4;
	const homeRubrics =
		rubrics.length > catColumns * 2 ? catColumns * 2 - 1 : rubrics.length;
	const rawHits = (recentData?.pages ?? []).flatMap((page) => page.hits ?? []);
	const homeListings = rawHits.filter(Boolean).map((l: any) => ({
		...l,
		isBoosted: !!(l.boostedUntil && new Date(l.boostedUntil) > new Date()),
	}));
	const boostedListings = (featuredData?.hits ?? [])
		.filter(Boolean)
		.map((l: any) => ({
			...l,
			isBoosted: !!(l.boostedUntil && new Date(l.boostedUntil) > new Date()),
		}));
	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
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
			// The endpoint can answer with a bare array (see rawHits above) and a
			// page can be null; reading `.total` off either throws inside
			// TanStack's pagination path and blanks the screen.
			const total = Array.isArray(lastPage)
				? lastPage.length
				: (lastPage?.total ?? 0);
			return offset < total ? offset : undefined;
		},
		initialPageParam: 0,
		enabled: isSearchMode,
	});

	const searchListings = (
		searchData?.pages.flatMap((p: any) =>
			Array.isArray(p) ? p : (p?.hits ?? []),
		) ?? []
	)
		.filter(Boolean)
		.map((l: any) => ({
			...l,
			isBoosted: !!(l.boostedUntil && new Date(l.boostedUntil) > new Date()),
		}));
	const totalDocs = searchData?.pages[0]?.total ?? 0;

	const searchPairs = chunkIntoRows(searchListings, columns);
	const canSave = !!(debouncedQuery || activeFilterCount > 0) && !!user;

	const clearSearch = () => {
		clearTimeout(debounceRef.current || undefined);
		setQuery("");
		setDebouncedQuery("");
	};
	// The empty state's "Clear filters" clears the query too: clearing the
	// text alone left a filtered search that still matched nothing.
	const clearFilters = () => {
		clearSearch();
		const reset: Record<string, undefined> = {
			category: undefined,
			minPrice: undefined,
			maxPrice: undefined,
			location: undefined,
			radius: undefined,
		};
		for (const key of Object.keys(attrParams)) reset[key] = undefined;
		router.setParams(reset);
	};

	// ── Render ────────────────────────────────────────────────────
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			{/* ══ Header ══ */}
			<View style={[styles.header, { backgroundColor: accentBg }]}>
				<ShellPattern />
				{/* ── Ligne 1 : Logo  |  Nom  |  spacer  |  Avatar ── */}
				<Animated.View style={[styles.topRow, topRowStyle]}>
					<Animated.View style={[styles.logoImgWrap, logoAnimStyle]}>
						<Image
							source={darkIcon}
							style={{ width: "100%", height: "100%" }}
							contentFit="contain"
						/>
					</Animated.View>
					<Animated.Text
						style={[styles.appName, { color: "#ffffff" }, appNameAnimStyle]}
					>
						{"Buy"}
						<Text style={{ color: c.sun }}>'N'</Text>
						{"Sellem"}
					</Animated.Text>

					<View style={{ flex: 1 }} />

					<CartHeaderButton
						style={[
							styles.bellBtn,
							{ backgroundColor: shellBtnBg, borderColor: shellBtnBorder },
						]}
						color={shellIcon}
						size={20}
					/>

					{/* Bell icon — only rendered after NovuProvider context is established */}
					{user && novuReady && (
						<NotificationBell
							cardBg={shellBtnBg}
							borderColor={shellBtnBorder}
							mutedColor={shellIcon}
							shellColor={accentBg}
						/>
					)}

					<Pressable
						onPress={() => router.push("/(tabs)/account")}
						hitSlop={4}
						accessibilityRole="button"
						accessibilityLabel={t("account.title")}
						style={[
							styles.avatarBtn,
							{ backgroundColor: shellBtnBg, borderColor: shellBtnBorder },
						]}
					>
						{user?.avatar?.url ? (
							<Image
								source={{
									uri:
										resolveListingImageUrl(user.avatar, "thumbnail") ??
										user.avatar.url,
								}}
								style={styles.avatar}
								contentFit="cover"
							/>
						) : (
							<Ionicons name="person-outline" size={20} color={shellIcon} />
						)}
					</Pressable>
				</Animated.View>

				{/* ── Ligne 2 : Barre de recherche  |  Annuler ── */}
				<View style={styles.searchRow}>
					<SearchField
						ref={inputRef}
						value={query}
						onChangeText={handleQueryChange}
						// One search for the whole app: the full screen has the recent
						// searches, category suggestions and shops this field lacked.
						onFocus={() => {
							inputRef.current?.blur();
							router.push({
								pathname: "/(tabs)/search",
								params: { focus: "1" },
							});
						}}
						onClear={clearSearch}
						active={isSearchMode}
						placeholder={t("home.searchPlaceholderDetailed")}
						style={styles.searchField}
					/>

					{/* Bouton Annuler animé */}
					<Animated.View style={cancelStyle}>
						<Pressable
							onPress={onSearchCancel}
							style={styles.cancelBtn}
							accessibilityRole="button"
						>
							<Text style={[styles.cancelText, { color: shellIcon }]}>
								{t("common.cancel")}
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
						<SortBar
							sort={sort}
							onChange={setSort}
							trailing={
								<FiltersChip count={activeFilterCount} onPress={openFilters} />
							}
						/>

						{searchLoading ? (
							<View style={styles.skeletonGrid}>
								<ListingGridSkeleton
									cardWidth={cardWidth}
									columns={columns}
									rows={3}
								/>
							</View>
						) : searchListings.length === 0 ? (
							<EmptyState
								icon="search-outline"
								title={t("search.noResults")}
								subtitle={
									activeFilterCount > 0
										? t("search.noResultsHint")
										: t("search.noResultsHintShort")
								}
								{...(activeFilterCount > 0
									? { ctaLabel: t("search.clearFilters"), onCta: clearFilters }
									: query
										? { ctaLabel: t("search.clearSearch"), onCta: clearSearch }
										: {})}
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
												width={cardWidth}
												isFavorite={favoriteIds.has(listing.id)}
												onToggleFavorite={() => toggleFavorite(listing)}
												onPress={(id) => router.push(`/listing/${id}`)}
											/>
										))}
									</View>
								)}
								keyExtractor={(row: any[]) =>
									row.map((listing) => listing.id).join("|")
								}
								contentContainerStyle={[
									styles.list,
									// The save button floats over the grid: the last row clears it.
									{ paddingBottom: canSave ? 96 : 40 },
								]}
								ListHeaderComponent={
									totalDocs > 0 ? (
										<Text
											style={[styles.resultCount, { color: mutedColor }]}
											accessibilityLiveRegion="polite"
										>
											{t("search.resultsCount", { count: totalDocs })}
										</Text>
									) : null
								}
								keyboardDismissMode="on-drag"
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

					{canSave && (
						<SaveSearchButton onPress={() => setSaveDialogOpen(true)} />
					)}
				</>
			) : (
				/* ── MODE ACCUEIL ── */
				<AnimatedScrollView
					style={{ flex: 1 }}
					contentContainerStyle={{ flexGrow: 1 }}
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
						{/* Catégories: the rubrics in two rows, the rest one tap away */}
						{rubrics.length > 0 && (
							<View style={styles.section}>
								<View style={styles.sectionHeader}>
									<Text
										style={[styles.sectionTitle, { color: textColor }]}
										accessibilityRole="header"
									>
										{t("home.categories")}
									</Text>
									<Pressable
										onPress={() => router.push("/categories")}
										style={styles.seeAllBtn}
										accessibilityRole="button"
										accessibilityLabel={t("categories.title")}
									>
										<Text style={[styles.seeAll, { color: c.link }]}>
											{t("home.seeAll")}
										</Text>
									</Pressable>
								</View>
								<View style={styles.catGrid}>
									{rubrics.slice(0, homeRubrics).map((rubric) => (
										<View
											key={rubric.id}
											style={[
												styles.catCell,
												{ width: `${100 / catColumns}%` },
											]}
										>
											<CategoryIcon
												category={rubric}
												// A rubric opens its sub-categories; one without any
												// goes straight to the search filtered on it.
												onPress={() =>
													rubric.children.length > 0
														? router.push({
																pathname: "/categories",
																params: { rubric: rubric.id },
															})
														: router.push({
																pathname: "/(tabs)/search",
																params: { category: rubric.id },
															})
												}
											/>
										</View>
									))}
									{rubrics.length > homeRubrics && (
										<View
											style={[
												styles.catCell,
												{ width: `${100 / catColumns}%` },
											]}
										>
											<Pressable
												onPress={() => router.push("/categories")}
												style={styles.catMore}
												accessibilityRole="button"
												accessibilityLabel={t("categories.title")}
											>
												<View
													style={[
														styles.catMoreIcon,
														{ backgroundColor: c.primaryTint, borderColor },
													]}
												>
													<Ionicons name="grid" size={22} color={c.link} />
												</View>
												<Text
													style={[styles.catMoreLabel, { color: c.link }]}
													numberOfLines={2}
												>
													{t("categories.more")}
												</Text>
											</Pressable>
										</View>
									)}
								</View>
							</View>
						)}

						{/* Localisation du fil */}
						<View style={styles.locationSection}>
							<LocationCard />
						</View>

						{/* À la une */}
						{boostedListings.length > 0 && (
							<View style={styles.section}>
								<View style={styles.sectionHeader}>
									<View style={styles.sectionTitleRow}>
										<Text
											style={[styles.sectionTitle, { color: textColor }]}
											accessibilityRole="header"
										>
											{t("home.featured")}
										</Text>
									</View>
								</View>
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									pagingEnabled={!isTablet}
									contentContainerStyle={styles.featuredList}
								>
									{boostedListings.slice(0, 6).map((listing: any) => (
										<Pressable
											key={listing.id}
											onPress={() => router.push(`/listing/${listing.id}`)}
											accessibilityRole="button"
											accessibilityLabel={[
												listing.title,
												listing.price
													? formatPrice(listing.price, i18n.language)
													: t("listing.priceOnRequest"),
												listing.location,
												t("home.featuredBadge"),
											]
												.filter(Boolean)
												.join(", ")}
											style={({ pressed }) => [
												styles.featuredCard,
												{ backgroundColor: cardBg, width: featuredWidth },
												pressed && styles.pressed,
											]}
										>
											<Image
												source={{
													uri:
														resolveListingImageUrl(
															listing.images?.[0],
															"thumbnail",
														) ?? undefined,
												}}
												style={[
													styles.featuredImage,
													{ height: featuredHeight },
												]}
												contentFit="cover"
												placeholder={{
													blurhash: "LGF5?xYk^6#M@-5c,1J5@[or[Q6.",
												}}
											/>
											<View style={styles.featuredBadge}>
												<Ionicons name="flash" size={12} color={c.sun} />
												<Text style={styles.featuredBadgeText}>
													{t("home.featuredBadge")}
												</Text>
											</View>
											<View style={styles.featuredOverlay}>
												<View style={styles.featuredPriceTag}>
													<Text style={styles.featuredPrice} numberOfLines={1}>
														{listing.price
															? formatPrice(listing.price, i18n.language)
															: t("listing.priceOnRequest")}
													</Text>
												</View>
												<Text style={styles.featuredTitle} numberOfLines={1}>
													{listing.title}
												</Text>
												<View style={styles.featuredMeta}>
													<Ionicons
														name="location-outline"
														size={13}
														color="rgba(255,255,255,0.86)"
													/>
													<Text
														style={styles.featuredMetaText}
														numberOfLines={1}
													>
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
								<Text
									style={[
										styles.sectionTitle,
										styles.sectionTitleShrink,
										{ color: textColor },
									]}
									numberOfLines={1}
									accessibilityRole="header"
								>
									{browseCity
										? t("home.recentListingsIn", { city: browseCity })
										: t("home.recentListings")}
								</Text>
								<Pressable
									onPress={onSearchFocus}
									style={styles.seeAllBtn}
									accessibilityRole="button"
								>
									<Text style={[styles.seeAll, { color: c.link }]}>
										{t("home.seeAll")}
									</Text>
								</Pressable>
							</View>
							{recentLoading ? (
								<View style={styles.gridSkeleton}>
									<ListingGridSkeleton
										cardWidth={cardWidth}
										columns={columns}
										rows={3}
									/>
								</View>
							) : recentError ? (
								<EmptyState
									icon="cloud-offline-outline"
									title={t("home.errorTitle")}
									subtitle={t("home.errorSub")}
									ctaLabel={t("common.retry")}
									onCta={() => refetchRecent()}
								/>
							) : homeListings.length === 0 ? (
								<EmptyState
									icon="storefront-outline"
									title={t("home.noListings")}
									subtitle={
										browseCity
											? t("home.noListingsIn", { city: browseCity })
											: t("home.noListingsSub")
									}
									ctaLabel={
										browseCity
											? t("locationSheet.seeAllCities")
											: t("home.publish")
									}
									onCta={() =>
										browseCity
											? void setBrowsePlace(null)
											: router.push("/(tabs)/create")
									}
								/>
							) : (
								<View style={styles.grid}>
									{homeListings.map((listing: any) => (
										<ListingCard
											key={listing.id}
											listing={listing}
											width={cardWidth}
											isFavorite={favoriteIds.has(listing.id)}
											onToggleFavorite={() => toggleFavorite(listing)}
											onPress={(id) => router.push(`/listing/${id}`)}
										/>
									))}
								</View>
							)}
							{hasMoreRecent && (
								<Pressable
									onPress={() => void fetchMoreRecent()}
									disabled={loadingMoreRecent}
									accessibilityRole="button"
									accessibilityState={{ busy: loadingMoreRecent }}
									style={({ pressed }) => [
										styles.moreBtn,
										{ backgroundColor: cardBg, borderColor },
										pressed && styles.pressed,
									]}
								>
									{loadingMoreRecent ? (
										<ActivityIndicator color={primaryColor} />
									) : (
										<Text style={[styles.moreText, { color: c.link }]}>
											{t("home.showMore")}
										</Text>
									)}
								</Pressable>
							)}
						</View>

						{/* ── Annonces proches de vous ── */}
						<View style={styles.section}>
							<View style={styles.sectionHeader}>
								<View style={styles.sectionTitleRow}>
									<Ionicons name="navigate" size={16} color={c.link} />
									<Text
										style={[styles.sectionTitle, { color: textColor }]}
										accessibilityRole="header"
									>
										{t("home.nearbySection")}
									</Text>
								</View>
							</View>
							{showLocationPrompt ? (
								<Pressable
									// The single permission request in this screen, and it only
									// runs from this explicit press. A refusal or a dead geocoder
									// resolves normally — the card just stays put.
									disabled={locationDetecting}
									onPress={() => {
										void requestDetection();
									}}
									accessibilityRole="button"
									accessibilityState={{ busy: locationDetecting }}
									accessibilityLabel={t("home.enableLocation")}
									accessibilityHint={
										locationRefused
											? t("errors.locationPermission")
											: t("home.enableLocationSub")
									}
									style={({ pressed }) => [
										styles.locationPrompt,
										{ backgroundColor: cardBg, borderColor },
										pressed && styles.pressed,
									]}
								>
									<View
										style={[
											styles.locationIcon,
											{ backgroundColor: c.primaryTint },
										]}
									>
										<Ionicons
											name="location-outline"
											size={20}
											color={c.link}
										/>
									</View>
									<View style={{ flex: 1 }}>
										<Text
											style={[styles.locationPromptTitle, { color: textColor }]}
										>
											{t("home.enableLocation")}
										</Text>
										<Text style={[styles.locationPromptSub, { color: c.body }]}>
											{locationRefused
												? t("errors.locationPermission")
												: t("home.enableLocationSub")}
										</Text>
									</View>
									{locationDetecting ? (
										<ActivityIndicator size="small" color={primaryColor} />
									) : (
										<Ionicons
											name="chevron-forward"
											size={16}
											color={mutedColor}
										/>
									)}
								</Pressable>
							) : !userCoords && locationPending ? (
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									contentContainerStyle={styles.nearbyList}
								>
									{Array.from({ length: columns + 2 }).map((_, i) => (
										<SkeletonCard key={i} cardWidth={cardWidth} />
									))}
								</ScrollView>
							) : nearbyListings.length === 0 ? (
								<View
									style={[
										styles.locationPrompt,
										{ backgroundColor: cardBg, borderColor },
									]}
								>
									<View
										style={[styles.locationIcon, { backgroundColor: c.well }]}
									>
										<Ionicons name="map-outline" size={20} color={mutedColor} />
									</View>
									<Text
										style={[
											styles.locationPromptSub,
											styles.locationEmpty,
											{ color: c.body },
										]}
									>
										{t("home.noNearby")}
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
											width={cardWidth}
											isFavorite={favoriteIds.has(listing.id)}
											onToggleFavorite={() => toggleFavorite(listing)}
											onPress={(id) => router.push(`/listing/${id}`)}
										/>
									))}
								</ScrollView>
							)}
						</View>
					</View>
				</AnimatedScrollView>
			)}

			<SaveSearchDialog
				visible={saveDialogOpen}
				onClose={() => setSaveDialogOpen(false)}
				query={debouncedQuery}
				searchParams={searchParams}
				filters={{
					category: filterParams.category,
					minPrice: filterParams.minPrice,
					maxPrice: filterParams.maxPrice,
					location: filterParams.location,
					sort,
					...attrParams,
				}}
			/>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },

	/* ── Header ── */
	header: {
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 14,
		overflow: "hidden",
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
		letterSpacing: -0.8,
	},
	moreBtn: {
		marginTop: 4,
		marginHorizontal: 16,
		minHeight: 52,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	moreText: { fontSize: 16, fontFamily: Fonts.bodyBold },
	pressed: { opacity: 0.85 },
	bellBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		position: "relative",
	},
	bellBadge: {
		position: "absolute",
		top: 8,
		right: 8,
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: "#ffb81c",
		borderWidth: 2,
	},
	avatarBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		overflow: "hidden",
	},
	avatar: { width: 44, height: 44 },

	/* Ligne 2 : search + annuler */
	searchRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	searchField: { flex: 1 },
	cancelBtn: {
		paddingHorizontal: 4,
		alignItems: "center",
		justifyContent: "center",
		height: 48,
	},
	cancelText: {
		fontSize: 16,
		fontFamily: Fonts.bodySemibold,
	},

	/* ── Home content ── */
	homeContent: {
		flexGrow: 1,
		borderTopLeftRadius: 22,
		borderTopRightRadius: 22,
		paddingTop: 4,
		paddingBottom: 40,
	},
	section: { marginTop: 24 },
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 16,
		marginBottom: 12,
	},
	sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	sectionTitle: {
		fontSize: 20,
		lineHeight: 25,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.4,
	},
	sectionTitleShrink: { flexShrink: 1 },
	locationSection: { marginTop: 20 },
	seeAllBtn: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
	seeAll: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	catGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		paddingHorizontal: 8,
		rowGap: 12,
	},
	catCell: { alignItems: "center" },
	catMore: { alignItems: "center", width: 72 },
	catMoreIcon: {
		borderWidth: 1,
		width: 56,
		height: 56,
		borderRadius: 56 * 0.3,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 6,
	},
	catMoreLabel: {
		fontSize: 12,
		lineHeight: 15,
		textAlign: "center",
		fontFamily: Fonts.bodySemibold,
	},

	/* ── Featured ── */
	featuredList: { paddingHorizontal: 16, gap: 12 },
	featuredCard: { borderRadius: 16, overflow: "hidden" },
	featuredImage: { width: "100%", height: 190 },
	featuredOverlay: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		paddingHorizontal: 14,
		paddingTop: 12,
		paddingBottom: 12,
		backgroundColor: "rgba(18, 22, 58,0.66)",
		gap: 2,
	},
	featuredBadge: {
		position: "absolute",
		top: 12,
		left: 12,
		backgroundColor: "#12163a",
		borderRadius: 6,
		paddingHorizontal: 7,
		paddingVertical: 4,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	featuredBadgeText: {
		color: "#fff",
		fontSize: 12,
		fontFamily: Fonts.bodyBold,
	},
	featuredPriceTag: {
		position: "absolute",
		top: -18,
		left: 14,
		backgroundColor: "#ffb81c",
		borderRadius: 7,
		paddingHorizontal: 9,
		paddingTop: 3,
		paddingBottom: 4,
	},
	featuredPrice: {
		color: "#12163a",
		fontSize: 18,
		lineHeight: 22,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.4,
	},
	featuredTitle: {
		color: "#fff",
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
		marginTop: 10,
	},
	featuredMeta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: 2,
	},
	featuredMetaText: {
		flexShrink: 1,
		color: "rgba(255,255,255,0.86)",
		fontSize: 13,
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
	gridSkeleton: { paddingHorizontal: 16, paddingBottom: 20 },

	/* ── Search mode ── */
	content: {
		flex: 1,
		borderTopLeftRadius: 22,
		borderTopRightRadius: 22,
		overflow: "hidden",
	},
	list: { paddingHorizontal: 16, paddingTop: 12, gap: 16 },
	row: { flexDirection: "row", gap: 12 },
	resultCount: {
		fontSize: 13,
		fontFamily: Fonts.bodyMedium,
		marginBottom: -4,
	},
	skeletonGrid: { padding: 16 },

	/* ── Nearby / Location prompt ── */
	locationPrompt: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginHorizontal: 16,
		padding: 14,
		minHeight: 72,
		borderRadius: 16,
		borderWidth: 1,
	},
	locationIcon: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	locationPromptTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	locationPromptSub: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
		marginTop: 2,
	},
	locationEmpty: { flex: 1, marginTop: 0 },
	nearbyList: { paddingHorizontal: 16, gap: 12 },
});
