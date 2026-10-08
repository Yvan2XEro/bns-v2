import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
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
import { DeliveryCities } from "@/src/components/shop/DeliveryCities";
import { LegalBlock } from "@/src/components/shop/LegalBlock";
import { PickupPoints } from "@/src/components/shop/PickupPoints";
import { ShopHeader } from "@/src/components/shop/ShopHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { usePublicShop, useShopListings } from "@/src/hooks/useShops";
import { ApiError } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";
import { telLink, whatsappLink } from "@/src/lib/shopContact";
import { shopUrl } from "@/src/lib/shopHandle";
import type { ListingHit, PublicShop } from "@/src/types/api";

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

	// A previous handle answers with the current one; replace so "back" does
	// not bounce through the old address.
	useEffect(() => {
		if (redirectTo)
			router.replace({
				pathname: "/s/[handle]",
				params: { handle: redirectTo },
			});
	}, [redirectTo]);

	const listings = useShopListings(shop?.id);
	const hits: ListingHit[] = listings.data?.pages.flatMap((p) => p.hits) ?? [];
	const rows = chunkIntoRows(hits, columns);

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
		<View style={[styles.root, { backgroundColor: c.bg }]}>
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

			<FlashList
				data={rows}
				keyExtractor={(_, index) => String(index)}
				contentContainerStyle={{
					padding: 16,
					paddingBottom: insets.bottom + 110,
				}}
				onEndReached={() =>
					listings.hasNextPage &&
					!listings.isFetchingNextPage &&
					listings.fetchNextPage()
				}
				onEndReachedThreshold={0.5}
				ListHeaderComponent={
					<View style={{ gap: 16, marginBottom: 4 }}>
						<ShopHeader shop={shop} onShare={share} />
						<LegalBlock legal={shop.legal} verified={shop.legalVerified} />
						<PickupPoints handle={shop.handle} />
						<DeliveryCities shopId={shop.id} />
						<Text style={[styles.section, { color: c.text }]}>
							{t("shop.listingsTitle", { count: shop.publishedListingCount })}
						</Text>
					</View>
				}
				renderItem={({ item }) => (
					<View style={[styles.row, { gap: gutter }]}>
						{item.map((listing) => (
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
				)}
				ListEmptyComponent={
					listings.isLoading ? (
						<ActivityIndicator color={c.primary} style={{ margin: 24 }} />
					) : (
						<Text style={[styles.empty, { color: c.muted }]}>
							{t("shop.noListings")}
						</Text>
					)
				}
				ListFooterComponent={
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
				}
			/>

			{whatsapp || phone ? (
				<View
					style={[
						styles.actionBar,
						{
							backgroundColor: c.card,
							borderTopColor: c.border,
							paddingBottom: insets.bottom + 12,
						},
					]}
				>
					{phone ? (
						<Pressable
							onPress={() => Linking.openURL(phone)}
							style={[styles.secondaryBtn, { borderColor: c.border }]}
							accessibilityRole="button"
							accessibilityLabel={t("shop.call")}
						>
							<Ionicons name="call-outline" size={18} color={c.primary} />
							<Text style={[styles.secondaryText, { color: c.primary }]}>
								{t("shop.call")}
							</Text>
						</Pressable>
					) : null}
					{whatsapp ? (
						<Pressable
							onPress={() => Linking.openURL(whatsapp)}
							style={[styles.primaryBtn, { backgroundColor: c.primary }]}
							accessibilityRole="button"
							accessibilityLabel={t("shop.whatsapp")}
						>
							<Ionicons name="logo-whatsapp" size={18} color="#fff" />
							<Text style={styles.primaryText}>{t("shop.whatsapp")}</Text>
						</Pressable>
					) : null}
				</View>
			) : null}
		</View>
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
	actionBar: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	primaryBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 48,
		borderRadius: 14,
	},
	primaryText: { color: "#fff", fontSize: 15, fontFamily: Fonts.displayBold },
	secondaryBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 48,
		borderRadius: 14,
		borderWidth: 1,
	},
	secondaryText: { fontSize: 15, fontFamily: Fonts.displayBold },
});
