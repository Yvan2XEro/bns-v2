import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Pressable,
	Share,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { ShopBrandProvider, useBrandFor } from "@/src/components/shop/brand";
import { DeliveryCities } from "@/src/components/shop/DeliveryCities";
import { LegalBlock } from "@/src/components/shop/LegalBlock";
import { PickupPoints } from "@/src/components/shop/PickupPoints";
import { ShopHeader } from "@/src/components/shop/ShopHeader";
import { ShopReviewCard } from "@/src/components/shop/ShopReviewCard";
import { type ShopTab, ShopTabs } from "@/src/components/shop/ShopTabs";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { useMyShops } from "@/src/hooks/useMyShops";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { useContactShop, useShopReviews } from "@/src/hooks/useShopReviews";
import { usePublicShop, useShopListings } from "@/src/hooks/useShops";
import { ApiError } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { isOwnShop } from "@/src/lib/buyBox";
import { useTranslation } from "@/src/lib/i18n";
import { telLink, whatsappLink } from "@/src/lib/shopContact";
import { shopUrl } from "@/src/lib/shopHandle";
import type { ListingHit, PublicShop } from "@/src/types/api";
import type { PublicShopReview } from "../../../api/src/contracts/publicShopReviews";

type Item =
	| { kind: "row"; listings: ListingHit[] }
	| { kind: "review"; review: PublicShopReview }
	| { kind: "about" };

export default function ShopScreen() {
	const { handle } = useLocalSearchParams<{ handle: string }>();
	const c = useShopTheme();
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const { webUrl } = useAppConfig();
	const { columns, cardWidth, gutter } = useResponsive();
	const { favoriteIds, toggleFavorite } = useFavoriteActions();

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
	const listings = useShopListings(shop?.id);
	const hits: ListingHit[] = listings.data?.pages.flatMap((p) => p.hits) ?? [];
	const rows = chunkIntoRows(hits, columns);
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
				? reviewList.map((review) => ({ kind: "review", review }))
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

	return (
		<ShopBrandProvider brandColor={shop.brandColor}>
			<View style={[styles.root, { backgroundColor: c.bg }]}>
				<StatusBar style={shop.banner?.url ? "light" : brand.statusBarStyle} />
				<Pressable
					onPress={back}
					style={[styles.backBtn, { top: insets.top + 10 }]}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={t("common.back")}
				>
					<Ionicons name="arrow-back" size={20} color="#fff" />
				</Pressable>
				<Pressable
					onPress={share}
					style={[styles.shareBtn, { top: insets.top + 10 }]}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={t("shop.shareLabel", { name: shop.name })}
				>
					<Ionicons name="share-outline" size={20} color="#fff" />
				</Pressable>

				<FlashList<Item>
					data={items}
					keyExtractor={(item, index) =>
						item.kind === "review" ? item.review.id : `${item.kind}-${index}`
					}
					getItemType={(item) => item.kind}
					contentContainerStyle={{
						padding: 16,
						paddingBottom: insets.bottom + 24,
					}}
					onEndReached={() =>
						tab !== "about" &&
						active.hasNextPage &&
						!active.isFetchingNextPage &&
						active.fetchNextPage()
					}
					onEndReachedThreshold={0.5}
					ListHeaderComponent={
						<View style={{ gap: 16, marginBottom: 12 }}>
							<ShopHeader shop={shop} onShare={share} />
							{!ownShop || phone || whatsapp ? (
								<View style={styles.contactRow}>
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
											<Ionicons name="call-outline" size={19} color={c.text} />
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
							<ShopTabs
								active={tab}
								onChange={setTab}
								reviewCount={reviewTotal}
							/>
							{tab === "listings" ? (
								<Text style={[styles.section, { color: c.text }]}>
									{t("shop.listingsTitle", {
										count: shop.publishedListingCount,
									})}
								</Text>
							) : null}
							{tab === "reviews" ? (
								<View style={{ gap: 4 }}>
									<Text style={[styles.section, { color: c.text }]}>
										{t("shop.reviewsTitle")}
									</Text>
									<Text style={[styles.hint, { color: c.muted }]}>
										{t("shop.reviewsHint")}
									</Text>
								</View>
							) : null}
						</View>
					}
					renderItem={({ item }) => {
						if (item.kind === "review") {
							return <ShopReviewCard review={item.review} />;
						}
						if (item.kind === "about") {
							return (
								<View style={{ gap: 16 }}>
									{shop.description ? (
										<View style={{ gap: 4 }}>
											<Text style={[styles.section, { color: c.text }]}>
												{t("shop.aboutDescription")}
											</Text>
											<Text style={[styles.body, { color: c.body }]}>
												{shop.description}
											</Text>
										</View>
									) : null}
									<LegalBlock
										legal={shop.legal}
										verified={shop.legalVerified}
									/>
									<PickupPoints handle={shop.handle} />
									<DeliveryCities shopId={shop.id} />
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
					}}
					ListEmptyComponent={
						active.isLoading ? (
							<ActivityIndicator
								color={brand.accentText}
								style={{ margin: 24 }}
							/>
						) : (
							<Text style={[styles.empty, { color: c.muted }]}>
								{tab === "reviews"
									? reviews.isError
										? t("shop.reviewsUnavailable")
										: t("shop.noReviews")
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
						</View>
					}
				/>
			</View>
		</ShopBrandProvider>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	plainBack: { padding: 16 },
	backBtn: {
		position: "absolute",
		left: 14,
		zIndex: 10,
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.45)",
	},
	shareBtn: {
		position: "absolute",
		right: 14,
		zIndex: 10,
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.45)",
	},
	section: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
	},
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
	contactRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
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
