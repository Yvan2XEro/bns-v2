import { Ionicons } from "@expo/vector-icons";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	Linking,
	Pressable,
	Share,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	useAnimatedReaction,
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { ShopBrandProvider, useBrandFor } from "@/src/components/shop/brand";
import { DeliveryCities } from "@/src/components/shop/DeliveryCities";
import { LegalBlock } from "@/src/components/shop/LegalBlock";
import { PickupPoints } from "@/src/components/shop/PickupPoints";
import {
	CONTACT_BAR_HEIGHT,
	ShopContactBar,
} from "@/src/components/shop/ShopContactBar";
import { ShopHeader } from "@/src/components/shop/ShopHeader";
import { ShopListControls } from "@/src/components/shop/ShopListControls";
import { ShopReviewCard } from "@/src/components/shop/ShopReviewCard";
import { ShopSortSheet } from "@/src/components/shop/ShopSortSheet";
import type { ShopTab } from "@/src/components/shop/ShopTabs";
import { ShopTopBar, TOP_BAR_ROW } from "@/src/components/shop/ShopTopBar";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { useCategories } from "@/src/hooks/useListings";
import { useMyShops } from "@/src/hooks/useMyShops";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { useContactShop, useShopReviews } from "@/src/hooks/useShopReviews";
import {
	usePublicShop,
	useShopCategoryCounts,
	useShopListings,
} from "@/src/hooks/useShops";
import { ApiError } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { isOwnShop } from "@/src/lib/buyBox";
import { useTranslation } from "@/src/lib/i18n";
import { telLink, whatsappLink } from "@/src/lib/shopContact";
import { shopUrl } from "@/src/lib/shopHandle";
import {
	categoryTreeOf,
	compactBarOpacity,
	compactBarThreshold,
	contactBarVisible,
	footerSpacer,
	pinOffset,
	type ShopSort,
	shopCategoryChips,
	stickyTop,
	tabSwitchOffset,
} from "@/src/lib/shopStorefront";
import type { ListingHit, PublicShop } from "@/src/types/api";
import type { PublicShopReview } from "../../../api/src/contracts/publicShopReviews";

type Item =
	| { kind: "row"; listings: ListingHit[] }
	| { kind: "reviewsIntro" }
	| { kind: "review"; review: PublicShopReview }
	| { kind: "about" };

const SEARCH_DEBOUNCE_MS = 300;

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<Item>);

export default function ShopScreen() {
	const { handle } = useLocalSearchParams<{ handle: string }>();
	const c = useShopTheme();
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const { webUrl } = useAppConfig();
	const { columns, cardWidth, gutter } = useResponsive();
	const { favoriteIds, toggleFavorite } = useFavoriteActions();
	const barHeight = insets.top + TOP_BAR_ROW;

	const { data, error, isLoading, refetch } = usePublicShop(handle);
	const redirectTo = data && "redirectTo" in data ? data.redirectTo : null;
	const shop: PublicShop | null = data && "shop" in data ? data.shop : null;
	const brand = useBrandFor(shop?.brandColor);

	// A previous handle answers with the current one; replace so "back" does
	// not bounce through the old address.
	useEffect(() => {
		if (redirectTo)
			router.replace({
				pathname: "/s/[handle]",
				params: { handle: redirectTo },
			});
	}, [redirectTo]);

	const [tab, setTab] = useState<ShopTab>("listings");
	const [category, setCategory] = useState<string | null>(null);
	const [sort, setSort] = useState<ShopSort>("newest");
	const [sortOpen, setSortOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	useEffect(() => {
		const timer = setTimeout(
			() => setDebouncedQuery(query.trim()),
			SEARCH_DEBOUNCE_MS,
		);
		return () => clearTimeout(timer);
	}, [query]);
	const activeQuery = searchOpen ? debouncedQuery : "";

	const listings = useShopListings(shop?.id, {
		q: activeQuery,
		category,
		sort,
	});
	const hits: ListingHit[] = listings.data?.pages.flatMap((p) => p.hits) ?? [];
	const listingTotal = listings.data?.pages[0]?.total ?? null;
	const rows = chunkIntoRows(hits, columns);
	const categoryCounts = useShopCategoryCounts(shop?.id);
	const { data: categoriesData } = useCategories();
	const tree = useMemo(
		() => categoryTreeOf(categoriesData?.categories ?? []),
		[categoriesData],
	);
	const chips = shopCategoryChips(categoryCounts.data, tree);
	const chipsTotal = chips?.reduce((sum, chip) => sum + chip.count, 0) ?? 0;
	// Fetched on every tab: the first page's `total` is the "Avis" count.
	const reviews = useShopReviews(shop?.id);
	const reviewList = reviews.data?.pages.flatMap((p) => p.reviews) ?? [];
	const reviewTotal = reviews.data?.pages[0]?.total ?? 0;

	const { user } = useAuth();
	const pathname = usePathname();
	const { showError } = useAlert();
	const { data: myShops } = useMyShops();
	const contactShop = useContactShop();
	const ownShop = shop
		? isOwnShop({
				viewerId: user?.id ?? null,
				sellerId: shop.owner.id,
				shopId: shop.id,
				memberOf: (myShops ?? []).map((entry) => entry.shopId),
			})
		: false;

	// ─── Scroll geometry ──────────────────────────────────────────────────
	const listRef = useRef<FlashListRef<Item>>(null);
	const scrollY = useSharedValue(0);
	/** The tabs' y in the content: the hero's height. 0 until measured. */
	const stickyY = useSharedValue(0);
	const nameBottom = useSharedValue(0);
	const contactBottom = useSharedValue(0);
	const barHeightSv = useSharedValue(barHeight);
	useEffect(() => {
		barHeightSv.value = barHeight;
	}, [barHeight, barHeightSv]);
	const [stickyHeight, setStickyHeight] = useState(0);
	const [spacer, setSpacer] = useState(0);
	const viewport = useRef(0);
	const savedOffsets = useRef<Partial<Record<ShopTab, number>>>({});

	const onScroll = useAnimatedScrollHandler((event) => {
		scrollY.value = event.contentOffset.y;
	});

	const progress = useDerivedValue(() =>
		nameBottom.value > 0
			? compactBarOpacity(
					scrollY.value,
					compactBarThreshold(nameBottom.value, barHeightSv.value),
				)
			: 0,
	);
	const contactShown = useDerivedValue<number>(() =>
		contactBarVisible(scrollY.value, contactBottom.value, barHeightSv.value)
			? 1
			: 0,
	);
	const [collapsed, setCollapsed] = useState(false);
	const [contactBarShown, setContactBarShown] = useState(false);
	useAnimatedReaction(
		() => progress.value >= 1,
		(now, before) => {
			if (now !== before) scheduleOnRN(setCollapsed, now);
		},
	);
	useAnimatedReaction(
		() => contactShown.value === 1,
		(now, before) => {
			if (now !== before) scheduleOnRN(setContactBarShown, now);
		},
	);

	const stickyStyle = useAnimatedStyle(() => ({
		opacity: stickyY.value > 0 ? 1 : 0,
		transform: [
			{
				translateY: stickyTop(stickyY.value, scrollY.value, barHeightSv.value),
			},
		],
	}));

	const pin = () => pinOffset(stickyY.value, barHeight);
	// Kept until the content is tall enough to reach it: a tab swap shrinks
	// the content before the footer spacer has grown back.
	const pendingOffset = useRef<number | null>(null);
	const scrollTo = useCallback((offset: number, animated = false) => {
		pendingOffset.current = offset;
		requestAnimationFrame(() =>
			listRef.current?.scrollToOffset({ offset, animated }),
		);
	}, []);

	const changeTab = (next: ShopTab) => {
		if (next === tab) return;
		const current = scrollY.value;
		savedOffsets.current[tab] = current;
		setTab(next);
		const target = tabSwitchOffset({
			current,
			pin: pin(),
			saved: savedOffsets.current[next],
		});
		if (target !== current) scrollTo(target);
	};

	// A new filter starts its results at the top of the list, never back up
	// under the banner.
	const filterKey = `${activeQuery}|${category ?? ""}|${sort}`;
	const lastFilterKey = useRef(filterKey);
	useEffect(() => {
		if (lastFilterKey.current === filterKey) return;
		lastFilterKey.current = filterKey;
		savedOffsets.current.listings = undefined;
		const top = pinOffset(stickyY.value, barHeight);
		if (scrollY.value > top) scrollTo(top);
	}, [filterKey, barHeight, scrollTo, scrollY, stickyY]);

	const openSearch = () => {
		if (tab !== "listings") changeTab("listings");
		setSearchOpen(true);
		const top = pin();
		if (scrollY.value < top) scrollTo(top, true);
	};
	const closeSearch = useCallback(() => {
		setSearchOpen(false);
		setQuery("");
		setDebouncedQuery("");
	}, []);
	// Android's back closes the search before leaving the shop.
	useEffect(() => {
		if (!searchOpen) return;
		const sub = BackHandler.addEventListener("hardwareBackPress", () => {
			closeSearch();
			return true;
		});
		return () => sub.remove();
	}, [searchOpen, closeSearch]);

	const [refreshing, setRefreshing] = useState(false);
	const refreshAll = async () => {
		setRefreshing(true);
		try {
			await Promise.all([
				refetch(),
				listings.refetch(),
				categoryCounts.refetch(),
				reviews.refetch(),
			]);
		} finally {
			setRefreshing(false);
		}
	};

	const contact = () => {
		if (!shop) return;
		if (!user) {
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
			return;
		}
		contactShop.mutate(shop.id, {
			onSuccess: ({ conversationId }) =>
				router.push(`/messages/${conversationId}`),
			onError: (error) =>
				showError(t("common.error"), resolveErrorMessage(error, t)),
		});
	};

	const items: Item[] =
		tab === "listings"
			? rows.map((listingsRow) => ({ kind: "row", listings: listingsRow }))
			: tab === "reviews"
				? [
						{ kind: "reviewsIntro" },
						...reviewList.map((review): Item => ({ kind: "review", review })),
					]
				: [{ kind: "about" }];
	const active = tab === "reviews" ? reviews : listings;

	const share = async () => {
		if (!shop) return;
		const url = shopUrl(shop.handle, webUrl);
		await Share.share({ message: `${shop.name}\n${url}`, url });
	};

	const back = () =>
		router.canGoBack() ? router.back() : router.replace("/(tabs)/home");

	if (isLoading || redirectTo) {
		return (
			<View style={[styles.center, { backgroundColor: c.bg }]}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
	}

	if (!shop) {
		const notFound =
			!error || (error instanceof ApiError && error.status === 404);
		return (
			<View
				style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}
			>
				<Pressable
					onPress={back}
					style={styles.plainBack}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={t("common.back")}
				>
					<Ionicons name="arrow-back" size={22} color={c.text} />
				</Pressable>
				<EmptyState
					illustration="notFound"
					title={notFound ? t("shop.notFoundTitle") : t("home.errorTitle")}
					subtitle={t("shop.notFoundSubtitle")}
					ctaLabel={t("common.retry")}
					onCta={() => refetch()}
				/>
			</View>
		);
	}

	const whatsapp = whatsappLink(shop.contact.whatsapp);
	const phone = telLink(shop.contact.phone);
	const statusBarStyle =
		collapsed || searchOpen
			? c.isDark
				? "light"
				: "dark"
			: shop.banner?.url
				? "light"
				: brand.statusBarStyle;

	const loadedShop = shop;
	function renderShopItem(item: Item) {
		if (item.kind === "reviewsIntro") {
			return (
				<View style={styles.reviewsIntro}>
					<Text style={[styles.section, { color: c.text }]}>
						{t("shop.reviewsTitle")}
					</Text>
					<Text style={[styles.hint, { color: c.muted }]}>
						{t("shop.reviewsHint")}
					</Text>
					{reviewList.length === 0 ? (
						reviews.isLoading ? (
							<ActivityIndicator
								color={brand.accentText}
								style={{ margin: 24 }}
							/>
						) : (
							<Text style={[styles.empty, { color: c.muted }]}>
								{reviews.isError
									? t("shop.reviewsUnavailable")
									: t("shop.noReviews")}
							</Text>
						)
					) : null}
				</View>
			);
		}
		if (item.kind === "review") {
			return <ShopReviewCard review={item.review} />;
		}
		if (item.kind === "about") {
			return (
				<View style={styles.about}>
					{loadedShop.description ? (
						<View style={{ gap: 4 }}>
							<Text style={[styles.section, { color: c.text }]}>
								{t("shop.aboutDescription")}
							</Text>
							<Text style={[styles.body, { color: c.body }]}>
								{loadedShop.description}
							</Text>
						</View>
					) : null}
					{loadedShop.returnPolicy ? (
						<View style={{ gap: 4 }}>
							<Text style={[styles.section, { color: c.text }]}>
								{t("shop.aboutReturnPolicy")}
							</Text>
							<Text style={[styles.body, { color: c.body }]}>
								{loadedShop.returnPolicy}
							</Text>
						</View>
					) : null}
					<LegalBlock
						legal={loadedShop.legal}
						verified={loadedShop.legalVerified}
					/>
					<PickupPoints handle={loadedShop.handle} />
					<DeliveryCities shopId={loadedShop.id} />
				</View>
			);
		}
		return (
			<View style={[styles.row, { gap: gutter }]}>
				{item.listings.map((listing) => (
					<ListingCard
						key={listing.id}
						listing={{
							...listing,
							price: listing.price ?? undefined,
							isBoosted: Boolean(
								listing.boostedUntil &&
									new Date(listing.boostedUntil) > new Date(),
							),
						}}
						width={cardWidth}
						isFavorite={favoriteIds.has(listing.id)}
						onToggleFavorite={() => toggleFavorite({ ...listing })}
						onPress={(id) => router.push(`/listing/${id}`)}
					/>
				))}
			</View>
		);
	}

	const showContactBar = !ownShop && !searchOpen;

	return (
		<ShopBrandProvider brandColor={shop.brandColor}>
			<View style={[styles.root, { backgroundColor: c.bg }]}>
				<StatusBar style={statusBarStyle} />

				<AnimatedFlashList
					ref={listRef}
					data={items}
					keyExtractor={(item, index) =>
						item.kind === "review" ? item.review.id : `${item.kind}-${index}`
					}
					getItemType={(item) => item.kind}
					onScroll={onScroll}
					scrollEventThrottle={16}
					onScrollBeginDrag={() => {
						pendingOffset.current = null;
					}}
					maintainVisibleContentPosition={{ disabled: true }}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					refreshing={refreshing}
					onRefresh={refreshAll}
					progressViewOffset={barHeight}
					onLayout={(e) => {
						viewport.current = e.nativeEvent.layout.height;
					}}
					onContentSizeChange={(_w, contentHeight) => {
						const next = footerSpacer({
							contentHeight,
							currentSpacer: spacer,
							viewportHeight: viewport.current,
							pin: pinOffset(stickyY.value, barHeight),
						});
						if (Math.abs(next - spacer) > 1) setSpacer(next);
						const wanted = pendingOffset.current;
						if (
							wanted !== null &&
							contentHeight - viewport.current >= wanted - 1
						) {
							pendingOffset.current = null;
							if (Math.abs(scrollY.value - wanted) > 1)
								listRef.current?.scrollToOffset({
									offset: wanted,
									animated: false,
								});
						}
					}}
					// No horizontal padding here: the banner runs edge to edge and
					// to the top; everything under it is inset by PAGE_GUTTER.
					contentContainerStyle={{
						paddingBottom:
							insets.bottom + 24 + (ownShop ? 0 : CONTACT_BAR_HEIGHT),
					}}
					onEndReached={() =>
						tab !== "about" &&
						active.hasNextPage &&
						!active.isFetchingNextPage &&
						active.fetchNextPage()
					}
					onEndReachedThreshold={0.5}
					ListHeaderComponent={
						<View>
							<View
								style={styles.hero}
								onLayout={(e) => {
									stickyY.value = e.nativeEvent.layout.height;
								}}
							>
								<ShopHeader
									shop={shop}
									onShare={share}
									onNameBottom={(y) => {
										nameBottom.value = y;
									}}
								/>
								{!ownShop || phone || whatsapp ? (
									<View
										style={styles.contactRow}
										onLayout={(e) => {
											const { y, height } = e.nativeEvent.layout;
											contactBottom.value = y + height;
										}}
									>
										{!ownShop ? (
											<Pressable
												onPress={contact}
												disabled={contactShop.isPending}
												style={[
													styles.primaryBtn,
													{
														backgroundColor: brand.accent,
														opacity: contactShop.isPending ? 0.7 : 1,
													},
												]}
												accessibilityRole="button"
												accessibilityLabel={t("shop.contactShop")}
											>
												{contactShop.isPending ? (
													<ActivityIndicator color={brand.onAccent} />
												) : (
													<>
														<Ionicons
															name="chatbox-outline"
															size={18}
															color={brand.onAccent}
														/>
														<Text
															style={[
																styles.primaryText,
																{ color: brand.onAccent },
															]}
														>
															{t("shop.contactShop")}
														</Text>
													</>
												)}
											</Pressable>
										) : null}
										{phone ? (
											<Pressable
												onPress={() => Linking.openURL(phone)}
												style={[styles.iconBtn, { borderColor: c.border }]}
												accessibilityRole="button"
												accessibilityLabel={t("shop.call")}
											>
												<Ionicons
													name="call-outline"
													size={19}
													color={c.text}
												/>
											</Pressable>
										) : null}
										{whatsapp ? (
											<Pressable
												onPress={() => Linking.openURL(whatsapp)}
												style={[styles.iconBtn, { borderColor: c.border }]}
												accessibilityRole="button"
												accessibilityLabel={t("shop.whatsapp")}
											>
												<Ionicons
													name="logo-whatsapp"
													size={19}
													color="#16a34a"
												/>
											</Pressable>
										) : null}
									</View>
								) : null}
							</View>
							{/* The pinned controls are drawn over this slot, see `stickyStyle`. */}
							<View style={{ height: stickyHeight, marginBottom: 12 }} />
						</View>
					}
					renderItem={({ item }) => (
						<View style={{ paddingHorizontal: PAGE_GUTTER }}>
							{renderShopItem(item)}
						</View>
					)}
					ListEmptyComponent={
						active.isLoading ? (
							<ActivityIndicator
								color={brand.accentText}
								style={{ margin: 24 }}
							/>
						) : (
							<Text style={[styles.empty, { color: c.muted }]}>
								{activeQuery || category
									? t("shop.noListingsFiltered")
									: t("shop.noListings")}
							</Text>
						)
					}
					ListFooterComponent={
						<View>
							{active.isFetchingNextPage ? (
								<ActivityIndicator
									color={brand.accentText}
									style={{ margin: 16 }}
								/>
							) : null}
							<Pressable
								onPress={() =>
									router.push({
										pathname: "/report",
										params: { targetType: "shop", targetId: shop.id },
									})
								}
								style={styles.report}
								accessibilityRole="button"
								accessibilityLabel={t("shop.report")}
							>
								<Ionicons name="flag-outline" size={14} color={c.muted} />
								<Text style={[styles.reportText, { color: c.muted }]}>
									{t("shop.report")}
								</Text>
							</Pressable>
							<View style={{ height: spacer }} />
						</View>
					}
				/>

				<Animated.View
					style={[styles.sticky, stickyStyle]}
					onLayout={(e) => setStickyHeight(e.nativeEvent.layout.height)}
				>
					<ShopListControls
						tab={tab}
						onTabChange={changeTab}
						reviewCount={reviewTotal}
						chips={chips}
						chipsTotal={chipsTotal}
						category={category}
						onCategoryChange={setCategory}
						total={listings.isLoading ? null : listingTotal}
						query={activeQuery}
						sort={sort}
						onOpenSort={() => setSortOpen(true)}
						onSearchEverywhere={() =>
							router.push({
								pathname: "/(tabs)/search",
								params: { q: activeQuery },
							})
						}
					/>
				</Animated.View>

				<ShopTopBar
					shop={shop}
					insetTop={insets.top}
					progress={progress}
					collapsed={collapsed}
					searchOpen={searchOpen}
					query={query}
					onQueryChange={setQuery}
					onOpenSearch={openSearch}
					onCloseSearch={closeSearch}
					onBack={back}
					onShare={share}
				/>

				{showContactBar ? (
					<ShopContactBar
						visible={contactShown}
						shown={contactBarShown}
						insetBottom={insets.bottom}
						pending={contactShop.isPending}
						onContact={contact}
						onWhatsapp={whatsapp ? () => Linking.openURL(whatsapp) : null}
					/>
				) : null}

				<ShopSortSheet
					visible={sortOpen}
					value={sort}
					onChange={(next) => {
						setSort(next);
						setSortOpen(false);
					}}
					onClose={() => setSortOpen(false)}
				/>
			</View>
		</ShopBrandProvider>
	);
}

const PAGE_GUTTER = 16;

const styles = StyleSheet.create({
	root: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	plainBack: { padding: 16 },
	hero: { gap: 16, paddingBottom: 16 },
	sticky: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
	section: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
	},
	reviewsIntro: { gap: 4, marginBottom: 12 },
	about: { gap: 16 },
	row: { flexDirection: "row", marginBottom: 12 },
	empty: { textAlign: "center", fontFamily: Fonts.body, margin: 24 },
	report: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 20,
	},
	reportText: { fontSize: 13, fontFamily: Fonts.body },
	hint: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
	body: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 21 },
	contactRow: { flexDirection: "row", gap: 10, paddingHorizontal: PAGE_GUTTER },
	primaryBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 46,
		borderRadius: 14,
	},
	primaryText: { color: "#fff", fontSize: 15, fontFamily: Fonts.displayBold },
	iconBtn: {
		width: 46,
		height: 46,
		borderRadius: 14,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
});
