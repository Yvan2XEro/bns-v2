import { Ionicons } from "@expo/vector-icons";
import { useCounts } from "@novu/react-native";
import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import React, { useCallback, useRef } from "react";
import {
	ActivityIndicator,
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
import { useNotificationReady } from "@/src/contexts/NotificationReadyContext";
import { useApplyLaunchMode } from "@/src/hooks/useAppMode";
import { useCategoryCounts } from "@/src/hooks/useCategoryCounts";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import {
	CATEGORIES_QUERY_KEY,
	CATEGORIES_STALE_TIME_MS,
} from "@/src/hooks/useListings";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { categoryTree } from "@/src/lib/categoryTree";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { useUserLocation } from "@/src/lib/useUserLocation";
import { rankByCounts } from "../../../../api/src/contracts/categoryCounts";

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
const RECENT_PAGE = 20;
const FEATURED_GAP = 12;
// The field is a button into the Search tab; it never holds text here.
const noop = () => undefined;
// Header collapse on scroll: sizes at rest and fully scrolled.
const LOGO_MAX = 44;
const LOGO_MIN = 28;
const NAME_MAX = 26;
const NAME_MIN = 18;

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
	const { t } = useTranslation();
	const { user } = useAuth();
	const novuReady = useNotificationReady();
	const queryClient = useQueryClient();
	const { width, isTablet, columns, cardWidth } = useResponsive();
	// Hero cards stay readable instead of becoming a 970pt letterbox on iPad.
	const featuredWidth = isTablet ? Math.min(520, width - 48) : width - 48;
	const featuredHeight = isTablet ? 260 : 190;

	const inputRef = useRef<TextInput>(null);

	// ── Animations ────────────────────────────────────────────────
	const scrollY = useSharedValue(0);

	const scrollHandler = useAnimatedScrollHandler({
		onScroll: (e) => {
			scrollY.value = e.contentOffset.y;
		},
	});

	// Logo and name shrink on scroll, by transform only: the 44pt logo scales
	// to 28pt from its left edge, and the name (26pt → 18pt) scales from its own
	// left edge while sliding left by the 16pt the logo gave up. Layout never
	// changes, so nothing reflows on the JS or UI thread while scrolling.
	const logoAnimStyle = useAnimatedStyle(() => ({
		transform: [
			{
				scale: interpolate(
					scrollY.value,
					[0, 70],
					[1, LOGO_MIN / LOGO_MAX],
					Extrapolation.CLAMP,
				),
			},
		],
	}));

	const appNameAnimStyle = useAnimatedStyle(() => ({
		transform: [
			{
				translateX: interpolate(
					scrollY.value,
					[0, 70],
					[0, LOGO_MIN - LOGO_MAX],
					Extrapolation.CLAMP,
				),
			},
			{
				scale: interpolate(
					scrollY.value,
					[0, 70],
					[1, NAME_MIN / NAME_MAX],
					Extrapolation.CLAMP,
				),
			},
		],
	}));

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
		detecting: locationDetecting,
		browsePlace,
		setBrowsePlace,
	} = useUserLocation();
	const browseCity = browsePlace?.name ?? null;

	// A city the user picked by hand carries coordinates too, so "near you"
	// works with no permission at all once a location is remembered. Without
	// coordinates the section stays hidden: the location card right above it
	// is the one place that asks, and its sheet offers "Autour de moi".
	// Skeletons only while something is actually in flight. With the permission
	// granted but no fix obtainable (geocoder down, GPS off), fall through to the
	// "nothing nearby" card rather than spinning forever.
	const locationPending = !locationHydrated || locationDetecting;
	const showNearby = !!userCoords || locationPending;

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
	// The paid slot follows the browsing city; a city with no boosted listing
	// falls back to the national selection rather than an empty hero.
	const { data: featuredData } = useQuery({
		queryKey: ["listings", "featured", browseCity],
		queryFn: async () => {
			const base =
				"/api/public/search?limit=6&boosted=true&sort=boosted&offset=0";
			if (browseCity) {
				const local = await api.get<{ hits: any[]; total: number }>(
					`${base}&location=${encodeURIComponent(browseCity)}`,
				);
				if ((local?.hits?.length ?? 0) > 0) return local;
			}
			return api.get<{ hits: any[]; total: number }>(base);
		},
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
				<View style={styles.topRow}>
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
				</View>

				{/* ── Ligne 2 : la recherche ── */}
				{/* One search for the whole app: the field opens the Search tab,
				    which has the recent searches, suggestions and shops. */}
				<SearchField
					ref={inputRef}
					value=""
					onChangeText={noop}
					onFocus={() => {
						inputRef.current?.blur();
						router.push({
							pathname: "/(tabs)/search",
							params: { focus: "1" },
						});
					}}
					placeholder={t("home.searchPlaceholderDetailed")}
				/>
			</View>

			{/* ══ Content ══ */}
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
						colors={[c.primaryFill]}
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
										style={[styles.catCell, { width: `${100 / catColumns}%` }]}
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
															params: {
																category: rubric.id,
																entry: String(Date.now()),
															},
														})
											}
										/>
									</View>
								))}
								{rubrics.length > homeRubrics && (
									<View
										style={[styles.catCell, { width: `${100 / catColumns}%` }]}
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

					{/* ── Près de vous: right under the place it depends on ── */}
					{showNearby && (
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
							{!userCoords ? (
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
					)}

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
								// Snap card by card: the cards are narrower than the screen,
								// so paging by screen width drifts off by the third one.
								snapToInterval={featuredWidth + FEATURED_GAP}
								snapToAlignment="start"
								decelerationRate="fast"
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
														"medium",
													) ?? undefined,
											}}
											style={[styles.featuredImage, { height: featuredHeight }]}
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
												<Text style={styles.featuredMetaText} numberOfLines={1}>
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
								// The full search, kept on the city this feed shows.
								onPress={() =>
									router.push({
										pathname: "/(tabs)/search",
										params: {
											...(browseCity ? { location: browseCity } : {}),
											entry: String(Date.now()),
										},
									})
								}
								style={styles.seeAllBtn}
								accessibilityRole="button"
								accessibilityLabel={`${
									browseCity
										? t("home.recentListingsIn", { city: browseCity })
										: t("home.recentListings")
								}, ${t("home.seeAll")}`}
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
				</View>
			</AnimatedScrollView>
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
	},

	/* Ligne 1 : logo | nom | spacer | avatar */
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		height: 52,
		marginBottom: 8,
	},
	logoImgWrap: {
		width: LOGO_MAX,
		height: LOGO_MAX,
		borderRadius: 9,
		overflow: "hidden",
		transformOrigin: "left center",
	},
	appName: {
		fontSize: NAME_MAX,
		transformOrigin: "left center",
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
	featuredList: { paddingHorizontal: 16, gap: FEATURED_GAP },
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
	locationPromptSub: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
		marginTop: 2,
	},
	locationEmpty: { flex: 1, marginTop: 0 },
	nearbyList: { paddingHorizontal: 16, gap: 12 },
});
