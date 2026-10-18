import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	SHOP_AD_FILTERS,
	type ShopAdFilter,
	useCloseShopAd,
	useShopAds,
} from "@/src/hooks/useShopAds";
import { useMyShop } from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	kindPriceText,
	listingKindRules,
	profileOf,
} from "@/src/lib/listingKind";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { can } from "@/src/lib/shopRoles";
import { isShopOwner } from "@/src/lib/variants";
import type { ListingDoc } from "@/src/types/api";

/**
 * The shop's ads that are not products: an agency's flats, a recruiter's job
 * offers, a provider's services — and a store's own job offers. New ones go
 * through the ad form, which publishes in the active shop.
 */
export default function ShopAdsScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { showConfirm, showError } = useAlert();
	const [filter, setFilter] = useState<ShopAdFilter>("live");
	const mine = useMyShop();
	const shop = mine.data?.shop;
	const allowed = can(mine.data?.role, "catalogue.edit");
	// A shop ad's seller is the owner, and only the seller may edit or close it.
	const owner = isShopOwner(mine.data?.role);
	const ads = useShopAds(allowed ? shop?.id : undefined, filter);
	const close = useCloseShopAd(shop?.id);
	const rows: ListingDoc[] = useMemo(
		() => ads.data?.pages.flatMap((page) => page.docs) ?? [],
		[ads.data],
	);
	const counts = ads.data?.pages[0]?.counts;
	const profile = profileOf(shop?.profile);

	const confirmClose = (ad: ListingDoc) => {
		const closedAs = listingKindRules(ad.kind).closedAs;
		showConfirm(t(`listingKind.markClosed.${closedAs}`), ad.title, () =>
			close.mutate(ad.id, {
				onError: (error) =>
					showError(t("sellerAds.actionFailed"), resolveErrorMessage(error, t)),
			}),
		);
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("sellerAds.title")}
				subtitle={t(`sellerAds.subtitle.${profile}`)}
			/>
			{mine.isLoading || (allowed && ads.isLoading) ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : !allowed ? (
				<EmptyState illustration="auth" title={t("sellerAds.loadError")} />
			) : ads.isError ? (
				<EmptyState
					illustration="sell"
					title={t("sellerAds.loadError")}
					ctaLabel={t("sellerAds.retry")}
					onCta={() => void ads.refetch()}
				/>
			) : (
				<>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={styles.filtersScroll}
						contentContainerStyle={styles.filters}
					>
						{SHOP_AD_FILTERS.map((key) => {
							const on = key === filter;
							return (
								<Pressable
									key={key}
									onPress={() => setFilter(key)}
									accessibilityRole="tab"
									accessibilityState={{ selected: on }}
									style={[
										styles.filter,
										{
											borderColor: on ? c.primary : c.border,
											backgroundColor: on ? c.primarySoft : c.card,
										},
									]}
								>
									<Text
										style={[
											styles.filterText,
											{ color: on ? c.primary : c.text },
										]}
									>
										{t(`sellerAds.filter.${key}`)}
										{counts ? ` ${counts[key]}` : ""}
									</Text>
								</Pressable>
							);
						})}
					</ScrollView>
					<FlashList
						data={rows}
						keyExtractor={(ad) => ad.id}
						contentContainerStyle={styles.list}
						onEndReached={() => {
							if (ads.hasNextPage && !ads.isFetchingNextPage)
								void ads.fetchNextPage();
						}}
						ListEmptyComponent={
							<EmptyState
								illustration="sell"
								title={t(`sellerAds.empty.${profile}`)}
								subtitle={t("sellerAds.emptyHint")}
								ctaLabel={t("sellerAds.add")}
								onCta={() => router.push("/(tabs)/create")}
							/>
						}
						renderItem={({ item: ad }) => {
							const thumb = resolveListingImageUrl(ad.images?.[0], "thumbnail");
							const closedAs = listingKindRules(ad.kind).closedAs;
							return (
								<Pressable
									onPress={() => router.push(`/listing/${ad.id}`)}
									style={[
										styles.row,
										{ backgroundColor: c.card, borderColor: c.border },
									]}
								>
									{thumb ? (
										<Image source={{ uri: thumb }} style={styles.thumb} />
									) : (
										<View style={[styles.thumb, { backgroundColor: c.border }]}>
											<Ionicons
												name="image-outline"
												size={20}
												color={c.muted}
											/>
										</View>
									)}
									<View style={styles.texts}>
										<Text
											style={[styles.title, { color: c.text }]}
											numberOfLines={1}
										>
											{ad.title}
										</Text>
										<Text style={[styles.price, { color: c.text }]}>
											{kindPriceText(
												ad.price ? formatPrice(ad.price, i18n.language) : null,
												ad,
												(key) => t(`listingKind.${key}`),
											)}
										</Text>
										<Text
											style={[styles.meta, { color: c.muted }]}
											numberOfLines={1}
										>
											{ad.status === "sold"
												? t(`listingKind.closedAs.${closedAs}`)
												: t(`sellerAds.status.${ad.status}`)}
											{ad.location ? ` · ${ad.location}` : ""}
										</Text>
									</View>
									{owner && ad.status === "published" ? (
										<Pressable
											onPress={() => confirmClose(ad)}
											accessibilityRole="button"
											accessibilityLabel={t(
												`listingKind.markClosed.${closedAs}`,
											)}
											hitSlop={8}
											style={styles.action}
										>
											<Ionicons
												name="checkmark-circle-outline"
												size={22}
												color={c.primary}
											/>
										</Pressable>
									) : null}
									{owner ? (
										<Pressable
											onPress={() => router.push(`/listing/${ad.id}/edit`)}
											accessibilityRole="button"
											accessibilityLabel={t("sellerAds.edit")}
											hitSlop={8}
											style={styles.action}
										>
											<Ionicons
												name="pencil-outline"
												size={20}
												color={c.primary}
											/>
										</Pressable>
									) : null}
								</Pressable>
							);
						}}
					/>
					<Pressable
						onPress={() => router.push("/(tabs)/create")}
						accessibilityRole="button"
						style={[styles.add, { backgroundColor: c.primary }]}
					>
						<Ionicons name="add" size={20} color="#fff" />
						<Text style={styles.addText}>{t("sellerAds.add")}</Text>
					</Pressable>
				</>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	filtersScroll: { flexGrow: 0 },
	filters: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
	filter: {
		minHeight: 36,
		paddingHorizontal: 14,
		borderRadius: 18,
		borderWidth: 1.5,
		justifyContent: "center",
	},
	filterText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	list: { paddingHorizontal: 16, paddingBottom: 96 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 10,
		borderRadius: 12,
		borderWidth: 1,
		marginBottom: 8,
	},
	thumb: {
		width: 56,
		height: 56,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	texts: { flex: 1, gap: 2 },
	title: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	price: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 12 },
	action: { padding: 6 },
	add: {
		position: "absolute",
		right: 16,
		bottom: 24,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 48,
		paddingHorizontal: 18,
		borderRadius: 24,
	},
	addText: { color: "#fff", fontSize: 15, fontFamily: Fonts.bodySemibold },
});
