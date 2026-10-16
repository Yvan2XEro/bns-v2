import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Modal,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { CallSellerButton } from "@/src/components/CallSellerButton";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { BuyBox } from "@/src/components/order/BuyBox";
import { DeliveryEstimates } from "@/src/components/order/DeliveryEstimates";
import { ReviewStars } from "@/src/components/ReviewStars";
import { ShopSellerCard } from "@/src/components/shop/ShopSellerCard";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { useMyShops } from "@/src/hooks/useMyShops";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useStartConversation } from "@/src/hooks/useShopInbox";
import { usePublicShop } from "@/src/hooks/useShops";
import { api, getInstallationId } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { isOwnShop } from "@/src/lib/buyBox";
import { withContentLocale } from "@/src/lib/contentLocale";
import { formatDate, parseDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { buildListingAttributeGroups } from "@/src/lib/listingAttributes";
import { formatPrice, formatPriceRange } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { publicShopBadge } from "@/src/lib/verification";
import type {
	Favorite,
	ListingDoc,
	ListingImageItem,
	ListingShopRef,
	PayloadDoc,
	PayloadPage,
	ProductDoc,
	SimilarResponse,
	UserDoc,
} from "@/src/types/api";

type ListingTag = {
	emoji?: null | string;
	id: string;
	name: string;
	slug: string;
};

type ListingDetailDoc = ListingDoc & {
	attributes?: Record<string, boolean | number | string>;
	images?: ListingImageItem[];
	isBoosted?: boolean;
	seller?: null | string | UserDoc;
	tags?: null | ListingTag[];
	viewCount?: number;
};

type ListingResponse = ListingDetailDoc | PayloadDoc<ListingDetailDoc>;

function unwrapDoc<T>(value: PayloadDoc<T> | T): T {
	if (
		typeof value === "object" &&
		value !== null &&
		"doc" in value &&
		value.doc !== undefined
	) {
		return value.doc;
	}

	return value;
}

function isListingTag(value: unknown): value is ListingTag {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		typeof value.id === "string" &&
		"slug" in value &&
		typeof value.slug === "string" &&
		"name" in value &&
		typeof value.name === "string"
	);
}

export default function ListingDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const { t, i18n } = useTranslation();
	const { showError } = useAlert();
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
	const { width, height, isTablet, centeredContent } = useResponsive();
	// Gallery keeps a sane aspect instead of a 1024×300 letterbox on iPad.
	const galleryHeight = isTablet
		? Math.min(560, Math.round(width * 0.55))
		: 300;
	const { favoriteIds, toggleFavorite } = useFavoriteActions();
	const [imageIndex, setImageIndex] = useState(0);
	const [lightboxVisible, setLightboxVisible] = useState(false);
	const [lightboxIdx, setLightboxIdx] = useState(0);
	const [descExpanded, setDescExpanded] = useState(false);
	const startConversation = useStartConversation();
	const { webUrl } = useAppConfig();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { data: listingData, isLoading } = useQuery({
		queryKey: ["listing", id],
		queryFn: () =>
			api.get<ListingResponse>(
				withContentLocale(`/api/listings/${id}?depth=2`),
			),
		enabled: !!id,
	});

	const { mutate: trackListingView } = useMutation({
		mutationFn: async (listingId: string) => {
			const installId = await getInstallationId();
			return api.post(
				`/api/public/listings/${listingId}/view`,
				{},
				{ "X-BNS-Install-Id": installId },
			);
		},
	});

	useEffect(() => {
		if (id) trackListingView(id);
	}, [id, trackListingView]);

	const { data: favData } = useQuery({
		queryKey: ["favorite", id],
		queryFn: () =>
			api.get<PayloadPage<Favorite>>(
				`/api/favorites?where[listing][equals]=${id}&limit=1`,
			),
		enabled: !!user && !!id,
	});

	const { data: similarData } = useQuery({
		queryKey: ["similar", id],
		queryFn: () =>
			api.get<SimilarResponse>(`/api/public/similar?id=${id}&limit=6`),
		enabled: !!id,
	});

	const listing = listingData ? unwrapDoc(listingData) : undefined;
	const images: ListingImageItem[] = listing?.images ?? [];
	const seller = listing?.seller;
	const isOwner = user?.id === seller?.id;
	const favDoc = favData?.docs?.[0];
	const isFavorite = !!favDoc;

	// Most listings have no shop — this stays null and the rest of the page
	// renders exactly as it did before shops existed, with no extra request.
	const listingShop: ListingShopRef | null =
		listing && typeof listing.shop === "object" && listing.shop
			? listing.shop
			: null;
	// `listingShop` is a depth-populated relation with no computed badge (its
	// `level` is the raw, stale field) — re-fetch through the public shop
	// route for the server's expiry-aware badge, same reasoning as web's
	// `getShopBadge`.
	const { data: shopBadgeData } = usePublicShop(listingShop?.handle);
	const shopBadge = publicShopBadge(shopBadgeData);
	const listingProduct: ProductDoc | null =
		listing &&
		typeof listing.product === "object" &&
		listing.product &&
		"title" in listing.product
			? listing.product
			: null;
	const productId = listing?.product
		? typeof listing.product === "object"
			? listing.product.id
			: listing.product
		: null;
	const summary = listing?.productSummary ?? null;
	const { data: myShops } = useMyShops();
	const ownShop = isOwnShop({
		viewerId: user?.id ?? null,
		sellerId: seller && typeof seller === "object" ? seller.id : null,
		shopId: listingShop?.id ?? null,
		memberOf: (myShops ?? []).map((entry) => entry.shopId),
	});

	// Attribute slugs are meaningless to a buyer ("fuel_type"); the readable
	// name, type, unit and section all live on the category, so join the two.
	// `listing.category` is a relationship — a bare id string at depth 0 — and
	// the helper degrades to slugs rather than blank-screening on that.
	const attributeGroups = useMemo(
		() =>
			buildListingAttributeGroups(listing?.attributes, listing?.category, {
				yes: t("common.yes"),
				no: t("common.no"),
				locale: i18n.language?.startsWith("en") ? "en-US" : "fr-FR",
			}),
		[listing?.attributes, listing?.category, t, i18n.language],
	);

	const { mutate: toggleFav } = useMutation({
		mutationFn: () =>
			isFavorite
				? api.delete(`/api/favorites/${favDoc.id}`)
				: api.post("/api/favorites", { listing: id }),
		onMutate: async () => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			await queryClient.cancelQueries({ queryKey: ["favorite", id] });
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: ["favorite", id] });
			await queryClient.invalidateQueries({ queryKey: ["favorites"] });
		},
	});

	const handleShare = async () => {
		const url = `${webUrl ?? ""}/listing/${id}`;
		Share.share({
			title: listing?.title,
			url,
			message: `${listing?.title} — ${formatPrice(listing?.price ?? 0, i18n.language)}\n${url}`,
		});
	};

	const handleMessage = () => {
		if (!user) {
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
			return;
		}
		if (!id) return;
		// The server dedupes by (shop, buyer) for a shop listing, so messaging
		// two products of the same shop lands in one thread — see
		// `MessageSellerButton` on web, which this mirrors.
		startConversation.mutate(id, {
			onSuccess: ({ conversationId }) => {
				router.push(`/messages/${conversationId}?listing=${id}`);
			},
			onError: (error) => {
				showError(t("common.error"), resolveErrorMessage(error, t));
			},
		});
	};

	if (isLoading) {
		return (
			<View style={[styles.loader, { backgroundColor: bg }]}>
				<ActivityIndicator size="large" color={primaryColor} />
			</View>
		);
	}

	if (!listing) {
		return (
			<View style={[styles.root, { backgroundColor: bg }]}>
				<Pressable
					onPress={() => router.back()}
					style={[
						styles.backBtn,
						{
							top: safeTop + 12,
							backgroundColor: isDark ? "#1e293b" : "#ffffff",
							borderWidth: 1,
							borderColor,
						},
					]}
				>
					<Ionicons name="arrow-back" size={20} color={primaryColor} />
				</Pressable>
				<EmptyState
					illustration="notFound"
					title={t("listing.notFound")}
					subtitle={t("listing.notFoundSubtitle")}
					ctaLabel={t("listing.back")}
					onCta={() => router.back()}
					size={240}
				/>
			</View>
		);
	}

	// null when createdAt is missing/malformed — this used to render
	// "Il y a NaN jours" on the listing meta row.
	const timeAgo = (() => {
		const created = parseDate(listing.createdAt);
		if (!created) return null;
		const diff = Date.now() - created.getTime();
		const days = Math.floor(diff / 86400000);
		if (days === 0) return t("listing.today");
		if (days === 1) return t("listing.yesterday");
		return t("listing.daysAgo", { count: days });
	})();

	const sellerMemberSince = formatDate(
		typeof seller === "object" ? seller?.createdAt : undefined,
		{ year: "numeric", month: "long" },
	);

	const actionBarInset = safeBottom + 120;

	const categoryName =
		listing.category && typeof listing.category === "object"
			? listing.category.name
			: null;

	const listingTags = Array.isArray(listing.tags)
		? listing.tags.filter(isListingTag)
		: [];

	return (
		<View style={[styles.root, { backgroundColor: bg }]}>
			{/* Floating actions — always visible over the gallery */}
			<View
				style={[styles.topBar, { top: safeTop + 12 }]}
				pointerEvents="box-none"
			>
				<Pressable
					onPress={() => router.back()}
					style={styles.floatBtn}
					accessibilityRole="button"
					accessibilityLabel={t("listing.back")}
				>
					<Ionicons name="chevron-back" size={22} color="#0f172a" />
				</Pressable>
				<View style={styles.topBarEnd}>
					<Pressable
						onPress={handleShare}
						style={styles.floatBtn}
						accessibilityRole="button"
						accessibilityLabel={t("listing.share")}
					>
						<Ionicons name="share-outline" size={20} color="#0f172a" />
					</Pressable>
					{!isOwner && (
						<Pressable
							onPress={() => toggleFav()}
							style={styles.floatBtn}
							accessibilityRole="button"
							accessibilityLabel={
								isFavorite ? t("listing.saved") : t("listing.save")
							}
							accessibilityState={{ selected: isFavorite }}
						>
							<Ionicons
								name={isFavorite ? "heart" : "heart-outline"}
								size={20}
								color={isFavorite ? "#ef4444" : "#0f172a"}
							/>
						</Pressable>
					)}
				</View>
			</View>

			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingBottom: actionBarInset }}
			>
				{/* Image Gallery */}
				<View style={styles.gallery}>
					<ScrollView
						horizontal
						pagingEnabled
						showsHorizontalScrollIndicator={false}
						onMomentumScrollEnd={(e) => {
							setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width));
						}}
					>
						{images.length > 0 ? (
							images.map((img, i: number) => (
								<Pressable
									key={i}
									onPress={() => {
										setLightboxIdx(i);
										setLightboxVisible(true);
									}}
								>
									<Image
										source={{ uri: resolveListingImageUrl(img) ?? undefined }}
										style={{ width, height: galleryHeight }}
										contentFit="cover"
										placeholder={{ blurhash: "LGF5?xYk^6#M@-5c,1J5@[or[Q6." }}
									/>
								</Pressable>
							))
						) : (
							<View
								style={[
									styles.imagePlaceholder,
									{
										width,
										height: galleryHeight,
										backgroundColor: isDark ? "#1e293b" : "#e2e8f0",
									},
								]}
							>
								<Ionicons name="image-outline" size={60} color={mutedColor} />
							</View>
						)}
					</ScrollView>

					{/* Image indicators */}
					{images.length > 1 && (
						<View style={styles.indicators}>
							{images.map((_, i: number) => (
								<View
									key={i}
									style={[
										styles.dot,
										{
											backgroundColor:
												i === imageIndex ? "#fff" : "rgba(255,255,255,0.5)",
											width: i === imageIndex ? 16 : 6,
										},
									]}
								/>
							))}
						</View>
					)}

					{images.length > 1 && (
						<View
							style={[
								styles.photoCount,
								{ backgroundColor: "rgba(0,0,0,0.5)" },
							]}
						>
							<Ionicons name="camera-outline" size={12} color="#fff" />
							<Text style={styles.photoCountText}>
								{imageIndex + 1}/{images.length}
							</Text>
						</View>
					)}

					{listing.isBoosted && (
						<View style={styles.boostedBadge}>
							<Ionicons name="flash" size={12} color="#fff" />
							<Text style={styles.boostedText}>{t("listing.featured")}</Text>
						</View>
					)}
				</View>

				{/* Content — capped + centred on tablets so text stays readable */}
				<View
					style={[styles.content, { backgroundColor: bg }, centeredContent]}
				>
					{/* Price, title, chips, meta — straight on the sheet, no card */}
					<View style={styles.hero}>
						<Text style={[styles.price, { color: primaryColor }]}>
							{summary?.priceMin != null &&
							summary.priceMax != null &&
							summary.priceMax !== summary.priceMin
								? formatPriceRange(
										summary.priceMin,
										summary.priceMax,
										i18n.language,
									)
								: listing.price
									? formatPrice(listing.price, i18n.language)
									: t("listing.priceOnRequest")}
						</Text>
						<Text style={[styles.title, { color: textColor }]}>
							{listing.title}
						</Text>
						<View style={styles.metaRow2}>
							<View style={styles.metaItem}>
								<Ionicons name="location-outline" size={14} color="#f59e0b" />
								<Text style={[styles.metaText, { color: mutedColor }]}>
									{listing.location ?? "—"}
								</Text>
							</View>
							{timeAgo && (
								<View style={styles.metaItem}>
									<Ionicons name="time-outline" size={14} color={mutedColor} />
									<Text style={[styles.metaText, { color: mutedColor }]}>
										{timeAgo}
									</Text>
								</View>
							)}
							{listing.viewCount > 0 && (
								<View style={styles.metaItem}>
									<Ionicons name="eye-outline" size={14} color={mutedColor} />
									<Text style={[styles.metaText, { color: mutedColor }]}>
										{listing.viewCount}
									</Text>
								</View>
							)}
						</View>
						{(categoryName || listing.isBoosted) && (
							<View style={styles.chips}>
								{categoryName && (
									<View
										style={[
											styles.chip,
											{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
										]}
									>
										<Text style={[styles.chipText, { color: textColor }]}>
											{categoryName}
										</Text>
									</View>
								)}
								{listing.isBoosted && (
									<View style={[styles.chip, styles.chipFeatured]}>
										<Ionicons name="flash" size={12} color="#b45309" />
										<Text style={[styles.chipText, { color: "#92400e" }]}>
											{t("listing.featured")}
										</Text>
									</View>
								)}
							</View>
						)}
					</View>

					{/* Buying sits right under the price, as in the design. */}
					<DeliveryEstimates
						listingId={id}
						eligible={Boolean(
							listingProduct && listingShop && !listingShop.ordersRestrictedAt,
						)}
					/>
					<BuyBox
						listingId={id}
						product={listingProduct}
						shop={
							listingShop
								? {
										id: listingShop.id,
										restricted: Boolean(listingShop.ordersRestrictedAt),
									}
								: null
						}
						orderable={listing.orderable}
						ownShop={ownShop}
						productAvailable={summary?.available ?? null}
						signedIn={Boolean(user)}
					/>
					{/* Description */}
					<View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
						<Text style={[styles.sectionTitle, { color: textColor }]}>
							{t("listing.description")}
						</Text>
						<Text
							style={[
								styles.description,
								{ color: isDark ? "#cbd5e1" : "#334155" },
							]}
							numberOfLines={descExpanded ? undefined : 4}
						>
							{listing.description}
						</Text>
						{listing.description?.length > 150 && (
							<Pressable onPress={() => setDescExpanded(!descExpanded)}>
								<Text style={[styles.readMore, { color: primaryColor }]}>
									{descExpanded ? t("listing.readLess") : t("listing.readMore")}
								</Text>
							</Pressable>
						)}
					</View>

					{/* Attributes */}
					{attributeGroups.length > 0 && (
						<View
							style={[styles.card, { backgroundColor: cardBg, borderColor }]}
						>
							<Text style={[styles.sectionTitle, { color: textColor }]}>
								{t("listing.characteristics")}
							</Text>
							{attributeGroups.map((group) => (
								<View key={group.key} style={styles.attrGroup}>
									{group.title && (
										<Text
											style={[styles.attrGroupTitle, { color: mutedColor }]}
										>
											{group.title}
										</Text>
									)}
									<View style={styles.attrsGrid}>
										{group.items.map((attr) => (
											<View key={attr.slug} style={styles.attrItem}>
												<Text style={[styles.attrKey, { color: mutedColor }]}>
													{attr.label}
												</Text>
												<Text style={[styles.attrVal, { color: textColor }]}>
													{attr.value}
												</Text>
											</View>
										))}
									</View>
								</View>
							))}
						</View>
					)}

					{/* Tags */}
					{listingTags.length > 0 && (
						<View
							style={[styles.card, { backgroundColor: cardBg, borderColor }]}
						>
							<Text style={[styles.sectionTitle, { color: textColor }]}>
								Tags
							</Text>
							<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
								{listingTags.map((tag) => (
									<Pressable
										key={String(tag.id)}
										onPress={() =>
											router.push({
												pathname: "/(tabs)/search",
												params: { tags: tag.slug },
											})
										}
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: 4,
											borderRadius: 20,
											borderWidth: 1,
											borderColor: isDark ? "#1e3a5f" : "#bfdbfe",
											backgroundColor: isDark ? "#0f2544" : "#eff6ff",
											paddingHorizontal: 10,
											paddingVertical: 4,
										}}
									>
										{tag.emoji ? (
											<Text style={{ fontSize: 12 }}>{tag.emoji}</Text>
										) : null}
										<Text
											style={{
												fontSize: 12,
												color: primaryColor,
												fontFamily: Fonts.bodySemibold,
											}}
										>
											{tag.name}
										</Text>
									</Pressable>
								))}
							</View>
						</View>
					)}

					{listingShop ? (
						<ShopSellerCard
							shop={listingShop}
							badge={shopBadge}
							brandColor={
								shopBadgeData && "shop" in shopBadgeData
									? shopBadgeData.shop.brandColor
									: null
							}
							owner={seller && typeof seller === "object" ? seller : null}
						/>
					) : null}

					{/* Seller Card */}
					{seller && !listingShop && (
						<Pressable
							onPress={() => router.push(`/profile/${seller.id}`)}
							style={[styles.card, { backgroundColor: cardBg, borderColor }]}
						>
							<Text style={[styles.sectionTitle, { color: textColor }]}>
								{t("listing.seller")}
							</Text>
							<View style={styles.sellerRow}>
								{seller.avatar?.url ? (
									<Image
										source={{ uri: seller.avatar.url }}
										style={styles.sellerAvatar}
										contentFit="cover"
									/>
								) : (
									<View
										style={[
											styles.sellerAvatarPlaceholder,
											{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
										]}
									>
										<Text
											style={[styles.sellerLetter, { color: primaryColor }]}
										>
											{seller.name?.[0]?.toUpperCase()}
										</Text>
									</View>
								)}
								<View style={styles.sellerInfo}>
									<View style={styles.sellerNameRow}>
										<Text style={[styles.sellerName, { color: textColor }]}>
											{seller.name}
										</Text>
									</View>
									<ReviewStars
										rating={seller.rating ?? 0}
										showCount
										count={seller.totalReviews}
									/>
									{sellerMemberSince && (
										<Text style={[styles.memberSince, { color: mutedColor }]}>
											{t("listing.memberSinceLabel")} {sellerMemberSince}
										</Text>
									)}
								</View>
								<Ionicons name="chevron-forward" size={16} color={mutedColor} />
							</View>
						</Pressable>
					)}

					{/* Safety Tips — discreet */}
					<View
						style={[
							styles.safetyStrip,
							{ borderColor: isDark ? "#1e3a5f" : "#e2e8f0" },
						]}
					>
						<Ionicons
							name="shield-checkmark-outline"
							size={13}
							color={mutedColor}
						/>
						<Text style={[styles.safetyStripText, { color: mutedColor }]}>
							{t("listing.safetyTips.strip")}
						</Text>
					</View>

					{/* Similar Listings */}
					{(similarData?.hits?.length ?? 0) > 0 && (
						<View style={{ marginBottom: 100 }}>
							<Text
								style={[
									styles.sectionTitle,
									{ color: textColor, paddingHorizontal: 0 },
								]}
							>
								{t("listing.similarListings")}
							</Text>
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={{ gap: 12 }}
							>
								{(similarData?.hits ?? [])
									.filter((l) => l.id !== id)
									.slice(0, 5)
									.map((l) => (
										<ListingCard
											key={l.id}
											listing={{
												...l,
												isBoosted: Boolean(
													l.boostedUntil &&
														new Date(l.boostedUntil) > new Date(),
												),
											}}
											width={isTablet ? 220 : 180}
											isFavorite={favoriteIds.has(l.id)}
											onToggleFavorite={() => toggleFavorite(l)}
											onPress={(lid) => router.push(`/listing/${lid}`)}
										/>
									))}
							</ScrollView>
						</View>
					)}

					{/* Report link */}
					<Pressable
						onPress={() =>
							router.push({
								pathname: "/report",
								params: { targetType: "listing", targetId: id },
							})
						}
						style={styles.reportLink}
					>
						<Ionicons name="flag-outline" size={14} color={mutedColor} />
						<Text style={[styles.reportText, { color: mutedColor }]}>
							{t("listing.reportListing")}
						</Text>
					</Pressable>
				</View>
			</ScrollView>

			{/* Bottom Action Bar */}
			<View
				style={[
					styles.actionBar,
					{
						backgroundColor: cardBg,
						borderTopColor: borderColor,
						paddingBottom: safeBottom + 16,
					},
				]}
			>
				<View style={[styles.actionButtons, centeredContent]}>
					{!isOwner && id ? (
						<CallSellerButton
							listingId={id}
							style={[
								styles.callBtn,
								{ backgroundColor: cardBg, borderColor, borderWidth: 1.5 },
							]}
							textStyle={styles.editBtnText}
							color={textColor}
						/>
					) : null}
					{!isOwner && (
						<Pressable
							onPress={handleMessage}
							disabled={startConversation.isPending}
							style={[
								styles.msgBtn,
								{
									backgroundColor: primaryColor,
									opacity: startConversation.isPending ? 0.7 : 1,
								},
							]}
						>
							{startConversation.isPending ? (
								<ActivityIndicator size="small" color="#fff" />
							) : (
								<Ionicons name="chatbubble-outline" size={18} color="#fff" />
							)}
							<Text style={styles.msgBtnText}>
								{listingShop
									? t("listing.messageShop")
									: t("listing.contactSeller")}
							</Text>
						</Pressable>
					)}
					{isOwner && (
						<Pressable
							onPress={() =>
								productId
									? router.push(`/seller/product/${productId}` as never)
									: router.push(`/listing/${id}/edit`)
							}
							style={[
								styles.editBtn,
								{ backgroundColor: cardBg, borderColor, borderWidth: 1.5 },
							]}
						>
							<Ionicons name="pencil" size={16} color={primaryColor} />
							<Text style={[styles.editBtnText, { color: primaryColor }]}>
								{t("listing.edit")}
							</Text>
						</Pressable>
					)}
				</View>
			</View>
			<Modal
				visible={lightboxVisible}
				transparent
				animationType="fade"
				onRequestClose={() => setLightboxVisible(false)}
			>
				<View style={styles.lightboxOverlay}>
					<Pressable
						style={[styles.lightboxClose, { top: safeTop + 12 }]}
						onPress={() => setLightboxVisible(false)}
					>
						<Ionicons name="close" size={24} color="#fff" />
					</Pressable>
					<ScrollView
						style={{ flex: 1 }}
						contentContainerStyle={styles.lightboxContent}
						maximumZoomScale={4}
						minimumZoomScale={1}
						showsVerticalScrollIndicator={false}
						showsHorizontalScrollIndicator={false}
						centerContent
					>
						<Image
							source={{
								uri: resolveListingImageUrl(images[lightboxIdx]) ?? undefined,
							}}
							style={[styles.lightboxImg, { width, height: height * 0.8 }]}
							contentFit="contain"
						/>
					</ScrollView>
					{images.length > 1 && (
						<View
							style={[styles.lightboxNav, { paddingBottom: safeBottom + 16 }]}
						>
							<Pressable
								onPress={() =>
									setLightboxIdx((i) => (i === 0 ? images.length - 1 : i - 1))
								}
								style={styles.lightboxNavBtn}
							>
								<Ionicons name="chevron-back" size={28} color="#fff" />
							</Pressable>
							<Text style={styles.lightboxCounter}>
								{lightboxIdx + 1} / {images.length}
							</Text>
							<Pressable
								onPress={() =>
									setLightboxIdx((i) => (i === images.length - 1 ? 0 : i + 1))
								}
								style={styles.lightboxNavBtn}
							>
								<Ionicons name="chevron-forward" size={28} color="#fff" />
							</Pressable>
						</View>
					)}
				</View>
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	loader: { flex: 1, alignItems: "center", justifyContent: "center" },

	// ── Fixed back button ──
	backBtn: {
		position: "absolute",
		left: 16,
		zIndex: 20,
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},

	gallery: { position: "relative" },
	imagePlaceholder: {
		alignItems: "center",
		justifyContent: "center",
	},
	indicators: {
		position: "absolute",
		bottom: 12,
		left: 0,
		right: 0,
		flexDirection: "row",
		justifyContent: "center",
		gap: 4,
	},
	dot: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.8)" },
	photoCount: {
		position: "absolute",
		bottom: 12,
		right: 12,
		borderRadius: 12,
		paddingHorizontal: 8,
		paddingVertical: 4,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	photoCountText: { color: "#fff", fontSize: 12 },
	boostedBadge: {
		position: "absolute",
		top: 12,
		left: 12,
		backgroundColor: "#f59e0b",
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 4,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	boostedText: { color: "#fff", fontSize: 12, fontFamily: Fonts.displayBold },

	// ── Content ──
	// Rises over the gallery's bottom edge like a sheet.
	content: {
		marginTop: -20,
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		paddingHorizontal: 16,
		paddingTop: 20,
		paddingBottom: 16,
		gap: 12,
	},
	card: { borderRadius: 14, borderWidth: 1, padding: 16 },

	topBar: {
		position: "absolute",
		left: 16,
		right: 16,
		zIndex: 20,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	topBarEnd: { flexDirection: "row", gap: 10 },
	floatBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "#ffffff",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#0f172a",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 6,
		elevation: 3,
	},
	hero: { gap: 8, marginBottom: 4 },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	chipFeatured: { backgroundColor: "#fef3c7" },
	chipText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	price: { fontSize: 28, fontFamily: Fonts.displayExtrabold },
	priceSuffix: { fontSize: 16, fontFamily: Fonts.body },
	title: { fontSize: 19, fontFamily: Fonts.displayBold, lineHeight: 25 },
	metaRow2: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
	metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
	metaText: { fontSize: 13, fontFamily: Fonts.body },
	sectionTitle: {
		fontSize: 16,
		fontFamily: Fonts.displayBold,
		marginBottom: 12,
	},
	description: { fontSize: 14, lineHeight: 22, fontFamily: Fonts.body },
	readMore: { marginTop: 8, fontSize: 14, fontFamily: Fonts.bodySemibold },
	attrGroup: { marginBottom: 12 },
	attrGroupTitle: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.6,
		marginBottom: 6,
	},
	attrsGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
	attrItem: { width: "50%", paddingRight: 12 },
	attrKey: { fontSize: 12, fontFamily: Fonts.body, marginBottom: 2 },
	attrVal: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	sellerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginBottom: 12,
	},
	sellerAvatar: { width: 56, height: 56, borderRadius: 28 },
	sellerAvatarPlaceholder: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	sellerLetter: { fontSize: 22, fontFamily: Fonts.displayBold },
	sellerInfo: { flex: 1, gap: 3 },
	sellerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	sellerName: { fontSize: 16, fontFamily: Fonts.displayBold },
	memberSince: { fontSize: 12, fontFamily: Fonts.body },
	safetyStrip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	safetyStripText: { fontSize: 12, fontFamily: Fonts.body, flex: 1 },
	reportLink: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		padding: 8,
		marginBottom: 16,
	},
	reportText: { fontSize: 13 },
	actionBar: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		borderTopWidth: 1,
		padding: 16,
		paddingBottom: 24,
	},
	actionButtons: { flexDirection: "row", gap: 10 },
	msgBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 14,
	},
	msgBtnText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
	boostBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 14,
		paddingVertical: 14,
		backgroundColor: "#f59e0b",
	},
	boostIconBtn: {
		width: 52,
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#f59e0b",
	},
	editBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 14,
		paddingVertical: 14,
	},
	editBtnText: { fontSize: 15, fontFamily: Fonts.displayBold },
	callBtn: {
		width: 118,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 14,
		paddingVertical: 14,
	},
	lightboxOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.95)",
		justifyContent: "center",
	},
	lightboxClose: {
		position: "absolute",
		// `top` is applied inline from the safe-area insets.
		right: 16,
		zIndex: 10,
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(255,255,255,0.15)",
		alignItems: "center",
		justifyContent: "center",
	},
	lightboxContent: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	lightboxImg: {},
	lightboxNav: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		// paddingBottom is applied inline from the safe-area insets.
		paddingTop: 12,
	},
	lightboxNavBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "rgba(255,255,255,0.15)",
		alignItems: "center",
		justifyContent: "center",
	},
	lightboxCounter: {
		color: "#fff",
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},
});
