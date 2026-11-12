import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { CallSellerButton } from "@/src/components/CallSellerButton";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { EmptyState } from "@/src/components/EmptyState";
import { ImageViewer } from "@/src/components/ImageViewer";
import { ListingCard } from "@/src/components/ListingCard";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { ListingDetailSkeleton } from "@/src/components/listing/Skeletons";
import { BuyBox } from "@/src/components/order/BuyBox";
import { DeliveryEstimates } from "@/src/components/order/DeliveryEstimates";
import { ReviewStars } from "@/src/components/ReviewStars";
import { ShareSheet } from "@/src/components/share/ShareSheet";
import { ShopSellerCard } from "@/src/components/shop/ShopSellerCard";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useIsDetailPane } from "@/src/contexts/DetailPaneContext";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { useMyShops } from "@/src/hooks/useMyShops";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useStartConversation } from "@/src/hooks/useShopInbox";
import { usePublicShop } from "@/src/hooks/useShops";
import { ApiError, api, getInstallationId } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { isOwnShop } from "@/src/lib/buyBox";
import { findCachedListing } from "@/src/lib/cachedListing";
import { withContentLocale } from "@/src/lib/contentLocale";
import { feedback } from "@/src/lib/feedback";
import { formatDate, parseDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { buildListingAttributeGroups } from "@/src/lib/listingAttributes";
import {
	type DraftAction,
	isDraftAction,
	kindPriceText,
	listingAction,
	listingKindRules,
	safetyKind,
} from "@/src/lib/listingKind";
import { formatPrice, formatPriceRange } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { publicShopBadge } from "@/src/lib/verification";
import type {
	ListingDoc,
	ListingImageItem,
	ListingShopRef,
	PayloadDoc,
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

	return value as T;
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

/** Signage yellow and the ink that always sits on it, in both themes. */
const SUN = Colors.light.sun;
const INK = Colors.light.sunForeground;

/** The gallery's share of the width when it sits beside the details. */
const GALLERY_SHARE = 0.5;

const DRAFT_ICONS: Record<DraftAction, keyof typeof Ionicons.glyphMap> = {
	visit: "calendar-outline",
	apply: "briefcase-outline",
	quote: "document-text-outline",
};

/**
 * A listing. On its own screen, or in the search tab's detail pane on a
 * tablet in landscape, where it has no way back. With the room for it
 * (expanded), the gallery fills the left column and the details scroll on
 * the right, above their own action bar.
 */
export function ListingDetail({ id }: { id: string }) {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const { t, i18n } = useTranslation();
	const { showError } = useAlert();
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
	const { width, height, isTablet, isExpanded, centeredContent } =
		useResponsive();
	const inPane = useIsDetailPane();
	const twoColumns = isExpanded;
	const galleryWidth = twoColumns ? Math.round(width * GALLERY_SHARE) : width;
	// Gallery keeps a sane aspect instead of a 1024×300 letterbox on iPad.
	const galleryHeight = twoColumns
		? height
		: isTablet
			? Math.min(560, Math.round(width * 0.55))
			: 300;
	const { favoriteIds, toggleFavorite } = useFavoriteActions();
	const [imageIndex, setImageIndex] = useState(0);
	const [lightboxVisible, setLightboxVisible] = useState(false);
	const [lightboxIdx, setLightboxIdx] = useState(0);
	const [descExpanded, setDescExpanded] = useState(false);
	const startConversation = useStartConversation();
	const { webUrl, shareCardsEnabled } = useAppConfig();

	const c = isDark ? Colors.dark : Colors.light;
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const bodyColor = c.body;
	const mutedColor = c.mutedForeground;
	const primaryColor = c.primary;
	// Brand words on the sheet: the dark primary sits near 4.3:1 on a card.
	const linkColor = c.link;
	const borderColor = c.border;
	// A filled button keeps white legible in both themes: the dark-mode
	// primary is a light periwinkle that fails 4.5:1 under a white label.
	const filledColor = c.primaryFill;

	const {
		data: listingData,
		isLoading,
		isError,
		error: listingError,
		refetch: refetchListing,
		isRefetching: refetchingListing,
	} = useQuery({
		queryKey: ["listing", id],
		queryFn: () =>
			api.get<ListingResponse>(
				withContentLocale(`/api/listings/${id}?depth=2`),
			),
		enabled: !!id,
		// Opens on what the list already showed instead of a blank spinner.
		placeholderData: () =>
			id ? findCachedListing<ListingDetailDoc>(queryClient, id) : undefined,
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

	const { data: similarData } = useQuery({
		queryKey: ["similar", id],
		queryFn: () =>
			api.get<SimilarResponse>(`/api/public/similar?id=${id}&limit=6`),
		enabled: !!id,
	});

	const listing = listingData ? unwrapDoc(listingData) : undefined;
	const images: ListingImageItem[] = listing?.images ?? [];
	const seller = listing?.seller;
	const isOwner =
		user?.id === (typeof seller === "string" ? seller : seller?.id);
	// The same heart as on the cards: sign-in gate, instant fill, rollback.
	const isFavorite = !!id && favoriteIds.has(id);

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
	const scrollRef = useRef<ScrollView>(null);
	const contentY = useRef(0);
	const buyBoxY = useRef(0);
	const similarY = useRef<number | null>(null);
	// Sold, rented, filled: nothing left to call or message about.
	const isClosed = listing?.status === "sold";
	const [descTruncated, setDescTruncated] = useState(false);
	// A shop product the viewer can buy: the bar's main action is ordering.
	const canOrder =
		!isClosed &&
		Boolean(productId) &&
		listing?.orderable !== false &&
		!ownShop &&
		Boolean(listingShop) &&
		!listingShop?.ordersRestrictedAt;
	// Order for a shop product, else what the kind calls for: a visit, an
	// application, a quote.
	const action = listingAction({
		kind: listing?.kind,
		isShopProduct: Boolean(productId),
	});
	const draftAction = isDraftAction(action) ? action : null;
	const tipsKind = productId ? null : safetyKind(listing?.kind);
	const priceLabel =
		summary?.priceMin != null &&
		summary.priceMax != null &&
		summary.priceMax !== summary.priceMin
			? formatPriceRange(summary.priceMin, summary.priceMax, i18n.language)
			: listing?.price
				? formatPrice(listing.price, i18n.language)
				: null;

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

	const toggleFav = () => {
		if (!listing || !id) return;
		// Saving is the moment worth a sound; removing only ticks.
		if (user) feedback(isFavorite ? "tap" : "pop");
		toggleFavorite({ ...listing, id });
	};

	// Shared links must open from WhatsApp: never a bare "/listing/…" path.
	const listingUrl = `${(webUrl || "https://buynsellem.com").replace(/\/+$/, "")}/listing/${id}`;

	const handleShare = async () => {
		// The share panel (WhatsApp Status, stories, …) once an admin turned
		// the cards on; the system sheet with the link otherwise.
		if (shareCardsEnabled && webUrl && listing && id) {
			await ShareSheet.call({ kind: "listing", id, title: listing.title });
			return;
		}
		const url = listingUrl;
		// No price, no "0 FCFA": the title alone carries a free or on-quote listing.
		const heading = priceLabel
			? `${listing?.title} — ${priceLabel}`
			: (listing?.title ?? "");
		Share.share({ title: listing?.title, url, message: `${heading}\n${url}` });
	};

	const messageLabel = draftAction
		? t(`listingKind.action.${draftAction}`)
		: listingShop
			? t("listing.messageShop")
			: t("listing.contactSeller");

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
				// A visit, an application or a quote opens on a drafted message,
				// only ever placed in the composer: the buyer edits and sends it.
				router.push({
					pathname: "/messages/[conversationId]",
					params: {
						conversationId,
						listing: id,
						...(draftAction && listing
							? {
									draft: t(`listingKind.draft.${draftAction}`, {
										title: listing.title,
									}),
								}
							: {}),
					},
				});
			},
			onError: (error) => {
				showError(t("common.error"), resolveErrorMessage(error, t));
			},
		});
	};

	if (isLoading) {
		return (
			<View style={[styles.root, { backgroundColor: bg }]}>
				<HeaderBackButton
					color={primaryColor}
					fallback="/(tabs)/home"
					style={[
						styles.backBtn,
						{
							top: safeTop + 12,
							backgroundColor: cardBg,
							borderWidth: StyleSheet.hairlineWidth,
							borderColor,
						},
					]}
				/>
				<ListingDetailSkeleton galleryHeight={galleryHeight} />
			</View>
		);
	}

	// A 404 is a gone listing; anything else (offline, 500) can be retried.
	const missing =
		!isError ||
		(listingError instanceof ApiError && listingError.status === 404);

	if (!listing) {
		return (
			<View style={[styles.root, { backgroundColor: bg }]}>
				<HeaderBackButton
					color={primaryColor}
					fallback="/(tabs)/home"
					style={[
						styles.backBtn,
						{
							top: safeTop + 12,
							backgroundColor: cardBg,
							borderWidth: StyleSheet.hairlineWidth,
							borderColor,
						},
					]}
				/>
				{missing ? (
					<EmptyState
						illustration="notFound"
						title={t("listing.notFound")}
						subtitle={t("listing.notFoundSubtitle")}
						ctaLabel={inPane ? undefined : t("listing.back")}
						onCta={() => router.back()}
						size={240}
					/>
				) : (
					<EmptyState
						illustration="notFound"
						title={t("home.errorTitle")}
						subtitle={resolveErrorMessage(listingError, t)}
						ctaLabel={refetchingListing ? undefined : t("common.retry")}
						onCta={() => refetchListing()}
						size={200}
					/>
				)}
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

	const sellerDoc = seller && typeof seller === "object" ? seller : null;
	const sellerMemberSince = formatDate(sellerDoc?.createdAt, {
		year: "numeric",
		month: "long",
	});

	const actionBarInset = safeBottom + 120;

	const categoryName =
		listing.category && typeof listing.category === "object"
			? listing.category.name
			: null;

	const categoryId =
		listing.category && typeof listing.category === "object"
			? listing.category.id
			: typeof listing.category === "string"
				? listing.category
				: null;

	const similarCount = (similarData?.hits ?? []).filter(
		(l) => l.id !== id,
	).length;
	const showSimilar = () => {
		if (similarCount > 0 && similarY.current !== null) {
			scrollRef.current?.scrollTo({
				y: Math.max(0, contentY.current + similarY.current - 12),
				animated: true,
			});
			return;
		}
		router.push({
			pathname: "/(tabs)/search",
			params: {
				...(categoryId ? { category: categoryId } : {}),
				entry: String(Date.now()),
			},
		});
	};

	const openReport = () => {
		// Reporting needs an account: ask before the form, not after it.
		if (!user) {
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
			return;
		}
		router.push({
			pathname: "/report",
			params: { targetType: "listing", targetId: id },
		});
	};

	const listingTags = Array.isArray(listing.tags)
		? listing.tags.filter(isListingTag)
		: [];

	const gallery = (
		// Sized, or a horizontal pager grows to all its photos side by side and
		// pushes the details off screen.
		<View
			style={[styles.gallery, { width: galleryWidth, height: galleryHeight }]}
		>
			<ScrollView
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onMomentumScrollEnd={(e) => {
					setImageIndex(
						Math.round(e.nativeEvent.contentOffset.x / galleryWidth),
					);
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
							accessibilityRole="imagebutton"
							accessibilityLabel={t("shop.openPhoto", {
								index: i + 1,
								count: images.length,
							})}
						>
							<Image
								source={{
									uri: resolveListingImageUrl(img, "medium") ?? undefined,
								}}
								style={{ width: galleryWidth, height: galleryHeight }}
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
								width: galleryWidth,
								height: galleryHeight,
								backgroundColor: c.well,
							},
						]}
					>
						<Ionicons name="image-outline" size={56} color={c.faint} />
					</View>
				)}
			</ScrollView>

			{/* Image indicators */}
			{images.length > 1 ? (
				<View
					style={styles.indicators}
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
				>
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
			) : null}

			{images.length > 1 ? (
				<View
					style={styles.photoCount}
					accessible
					accessibilityLabel={t("shop.photoViewer", {
						index: imageIndex + 1,
						count: images.length,
					})}
				>
					<Ionicons name="images-outline" size={13} color="#ffffff" />
					<Text style={styles.photoCountText}>
						{imageIndex + 1}/{images.length}
					</Text>
				</View>
			) : null}

			{/* Boosted: a signage-yellow plaque on the photo, ink on yellow. */}
			{listing.isBoosted ? (
				<View style={styles.boostedBadge}>
					<Ionicons name="flash" size={13} color={INK} />
					<Text style={styles.boostedText}>{t("listing.featured")}</Text>
				</View>
			) : null}
		</View>
	);

	return (
		<View style={[styles.root, { backgroundColor: bg }]}>
			{/* Floating actions — always visible over the gallery */}
			<View
				style={[styles.topBar, { top: safeTop + 12 }]}
				pointerEvents="box-none"
			>
				<HeaderBackButton
					color={INK}
					fallback="/(tabs)/home"
					icon="chevron-back"
					style={styles.floatBtn}
				/>
				<View style={styles.topBarEnd}>
					<CartHeaderButton style={styles.floatBtn} color={INK} />
					<Pressable
						onPress={handleShare}
						style={({ pressed }) => [
							styles.floatBtn,
							pressed && styles.floatBtnPressed,
						]}
						accessibilityRole="button"
						accessibilityLabel={t("listing.share")}
					>
						<Ionicons name="share-outline" size={20} color={INK} />
					</Pressable>
					{!isOwner ? (
						<Pressable
							onPress={() => toggleFav()}
							style={({ pressed }) => [
								styles.floatBtn,
								pressed && styles.floatBtnPressed,
							]}
							accessibilityRole="button"
							accessibilityLabel={
								isFavorite ? t("listing.saved") : t("listing.save")
							}
							accessibilityState={{ selected: isFavorite }}
						>
							<Ionicons
								name={isFavorite ? "heart" : "heart-outline"}
								size={20}
								color={isFavorite ? Colors.light.destructive : INK}
							/>
						</Pressable>
					) : null}
				</View>
			</View>

			<View style={[styles.body, twoColumns && styles.bodyColumns]}>
				{twoColumns && gallery}
				<ScrollView
					ref={scrollRef}
					style={styles.details}
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: actionBarInset }}
				>
					{!twoColumns && gallery}

					{/* Content — capped + centred on tablets so text stays readable */}
					<View
						style={[
							styles.content,
							{ backgroundColor: bg },
							twoColumns && [
								styles.contentBeside,
								{ paddingTop: safeTop + 68 },
							],
							centeredContent,
						]}
						onLayout={(e) => {
							contentY.current = e.nativeEvent.layout.y;
						}}
					>
						{/* Price, title, meta — straight on the sheet, no card. The
						    price tag is the largest thing on the screen. */}
						<View style={styles.hero}>
							<View style={styles.priceRow}>
								<View
									style={[
										styles.priceTag,
										listing.status === "sold" && {
											backgroundColor: c.well,
										},
									]}
								>
									<Text
										style={[
											styles.price,
											listing.status === "sold" && { color: mutedColor },
										]}
									>
										{kindPriceText(priceLabel, listing, (key) =>
											t(`listingKind.${key}`),
										)}
									</Text>
								</View>
								{listing.status === "sold" ? (
									<View
										style={[
											styles.closedPill,
											{ backgroundColor: c.dangerTint },
										]}
									>
										<Text style={[styles.closedText, { color: c.dangerText }]}>
											{t(
												`listingKind.closedAs.${listingKindRules(listing.kind).closedAs}`,
											)}
										</Text>
									</View>
								) : null}
							</View>
							<Text
								style={[styles.title, { color: textColor }]}
								accessibilityRole="header"
							>
								{listing.title}
							</Text>
							<View style={styles.metaRow2}>
								{listing.location ? (
									<View style={styles.metaItem}>
										<Ionicons
											name="location-outline"
											size={15}
											color={mutedColor}
										/>
										<Text style={[styles.metaText, { color: bodyColor }]}>
											{listing.location}
										</Text>
									</View>
								) : null}
								{timeAgo ? (
									<View style={styles.metaItem}>
										<Ionicons
											name="time-outline"
											size={15}
											color={mutedColor}
										/>
										<Text style={[styles.metaText, { color: mutedColor }]}>
											{timeAgo}
										</Text>
									</View>
								) : null}
								{(listing.viewCount ?? 0) > 0 ? (
									<View style={styles.metaItem}>
										<Ionicons name="eye-outline" size={15} color={mutedColor} />
										<Text style={[styles.metaText, { color: mutedColor }]}>
											{t("listing.views", { count: listing.viewCount ?? 0 })}
										</Text>
									</View>
								) : null}
							</View>
							{categoryName ? (
								<View style={styles.chips}>
									<View style={[styles.chip, { backgroundColor: c.well }]}>
										<Text style={[styles.chipText, { color: bodyColor }]}>
											{categoryName}
										</Text>
									</View>
								</View>
							) : null}
						</View>

						{/* Buying sits right under the price, as in the design. */}
						{!isClosed ? (
							<DeliveryEstimates
								listingId={id}
								eligible={Boolean(
									listingProduct &&
										listingShop &&
										!listingShop.ordersRestrictedAt,
								)}
							/>
						) : null}
						<View
							style={isClosed ? styles.hidden : undefined}
							onLayout={(e) => {
								buyBoxY.current = e.nativeEvent.layout.y;
							}}
						>
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
						</View>

						{/* Trust comes before the description: who sells, how they
						    are rated, and how the money is protected. */}
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

						{sellerDoc && !listingShop ? (
							<Pressable
								onPress={() => router.push(`/profile/${sellerDoc.id}`)}
								accessibilityRole="button"
								accessibilityLabel={`${t("listing.seller")} ${sellerDoc.name ?? ""}`}
								style={({ pressed }) => [
									styles.card,
									styles.sellerCard,
									{
										backgroundColor: pressed ? c.well : cardBg,
										borderColor,
									},
								]}
							>
								{sellerDoc.avatar?.url ? (
									<Image
										source={{ uri: sellerDoc.avatar.url }}
										style={styles.sellerAvatar}
										contentFit="cover"
									/>
								) : (
									<View
										style={[
											styles.sellerAvatarPlaceholder,
											{ backgroundColor: c.primaryTint },
										]}
									>
										<Text style={[styles.sellerLetter, { color: linkColor }]}>
											{sellerDoc.name?.[0]?.toUpperCase() ?? "?"}
										</Text>
									</View>
								)}
								<View style={styles.sellerInfo}>
									<Text style={[styles.sellerRole, { color: mutedColor }]}>
										{t("listing.seller")}
									</Text>
									<Text
										style={[styles.sellerName, { color: textColor }]}
										numberOfLines={1}
									>
										{sellerDoc.name}
									</Text>
									<ReviewStars
										rating={sellerDoc.rating ?? 0}
										showCount
										count={sellerDoc.totalReviews}
										size={14}
									/>
									{sellerMemberSince ? (
										<Text style={[styles.memberSince, { color: mutedColor }]}>
											{t("listing.memberSinceLabel")} {sellerMemberSince}
										</Text>
									) : null}
								</View>
								<Ionicons name="chevron-forward" size={18} color={mutedColor} />
							</Pressable>
						) : null}

						{/* Safety: a shop product is paid through the platform, so the
						    strip reads as a protection; a classified reads as advice.
						    "No advance" would contradict a shop product's pay button. */}
						<View
							style={[
								styles.safetyStrip,
								{
									backgroundColor: productId ? c.successTint : c.well,
								},
							]}
						>
							<Ionicons
								name={
									productId ? "shield-checkmark" : "shield-checkmark-outline"
								}
								size={18}
								color={productId ? c.success : primaryColor}
							/>
							<Text
								style={[
									styles.safetyStripText,
									{
										color: productId ? c.successText : bodyColor,
									},
								]}
							>
								{productId
									? t("listing.safetyTips.stripShop")
									: tipsKind
										? t(`listingKind.safety.${tipsKind}.tip1`)
										: t("listing.safetyTips.strip")}
							</Text>
						</View>

						{/* Description */}
						{listing.description ? (
							<View
								style={[styles.card, { backgroundColor: cardBg, borderColor }]}
							>
								<Text
									style={[styles.sectionTitle, { color: textColor }]}
									accessibilityRole="header"
								>
									{t("listing.description")}
								</Text>
								{/* Measured at full length, out of sight: the toggle shows
								    only when the text really runs past five lines. */}
								<Text
									style={[styles.description, styles.measure]}
									onTextLayout={(e) =>
										setDescTruncated(e.nativeEvent.lines.length > 5)
									}
									accessibilityElementsHidden
									importantForAccessibility="no-hide-descendants"
								>
									{listing.description}
								</Text>
								<Text
									style={[styles.description, { color: bodyColor }]}
									numberOfLines={descExpanded ? undefined : 5}
								>
									{listing.description}
								</Text>
								{descTruncated ? (
									<Pressable
										onPress={() => setDescExpanded(!descExpanded)}
										accessibilityRole="button"
										accessibilityState={{ expanded: descExpanded }}
										hitSlop={8}
										style={styles.readMoreBtn}
									>
										<Text style={[styles.readMore, { color: linkColor }]}>
											{descExpanded
												? t("listing.readLess")
												: t("listing.readMore")}
										</Text>
										<Ionicons
											name={descExpanded ? "chevron-up" : "chevron-down"}
											size={16}
											color={linkColor}
										/>
									</Pressable>
								) : null}
							</View>
						) : null}

						{/* Attributes */}
						{attributeGroups.length > 0 ? (
							<View
								style={[styles.card, { backgroundColor: cardBg, borderColor }]}
							>
								<Text
									style={[styles.sectionTitle, { color: textColor }]}
									accessibilityRole="header"
								>
									{t("listing.characteristics")}
								</Text>
								{attributeGroups.map((group, gi) => (
									<View
										key={group.key}
										style={[
											styles.attrGroup,
											gi > 0 && {
												borderTopWidth: StyleSheet.hairlineWidth,
												borderTopColor: borderColor,
												paddingTop: 14,
											},
										]}
									>
										{group.title ? (
											<Text
												style={[styles.attrGroupTitle, { color: textColor }]}
											>
												{group.title}
											</Text>
										) : null}
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
						) : null}

						{/* Tags */}
						{listingTags.length > 0 ? (
							<View
								style={[styles.card, { backgroundColor: cardBg, borderColor }]}
							>
								<Text
									style={[styles.sectionTitle, { color: textColor }]}
									accessibilityRole="header"
								>
									{t("create.tagsFieldLabel")}
								</Text>
								<View style={styles.tagWrap}>
									{listingTags.map((tag) => (
										<Pressable
											key={String(tag.id)}
											onPress={() =>
												// Tags only filter inside a category: send both.
												router.push({
													pathname: "/(tabs)/search",
													params: {
														tags: tag.slug,
														...(categoryId ? { category: categoryId } : {}),
														entry: String(Date.now()),
													},
												})
											}
											accessibilityRole="link"
											accessibilityLabel={tag.name}
											hitSlop={{ top: 6, bottom: 6 }}
											style={({ pressed }) => [
												styles.tag,
												{
													backgroundColor: c.primaryTint,
													opacity: pressed ? 0.7 : 1,
												},
											]}
										>
											<Text style={[styles.tagText, { color: linkColor }]}>
												{tag.name}
											</Text>
										</Pressable>
									))}
								</View>
							</View>
						) : null}

						{/* Similar Listings */}
						{similarCount > 0 ? (
							<View
								style={styles.similar}
								onLayout={(e) => {
									similarY.current = e.nativeEvent.layout.y;
								}}
							>
								<Text
									style={[styles.sectionTitle, { color: textColor }]}
									accessibilityRole="header"
								>
									{t("listing.similarListings")}
								</Text>
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									// Runs to the screen edge so the next card peeks in.
									style={styles.similarRail}
									contentContainerStyle={styles.similarRailContent}
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
												onToggleFavorite={() => toggleFavorite({ ...l })}
												onPress={(lid) => router.push(`/listing/${lid}`)}
											/>
										))}
								</ScrollView>
							</View>
						) : null}

						{/* Report link */}
						<Pressable
							onPress={openReport}
							accessibilityRole="button"
							style={({ pressed }) => [
								styles.reportLink,
								pressed && { opacity: 0.6 },
							]}
						>
							<Ionicons name="flag-outline" size={15} color={mutedColor} />
							<Text style={[styles.reportText, { color: mutedColor }]}>
								{t("listing.reportListing")}
							</Text>
						</Pressable>
					</View>
				</ScrollView>
			</View>

			{/* Bottom Action Bar — under the details only, beside the gallery */}
			<View
				style={[
					styles.actionBar,
					{
						backgroundColor: cardBg,
						borderTopColor: borderColor,
						paddingBottom: Math.max(safeBottom, 12) + 8,
					},
					twoColumns && { left: galleryWidth },
				]}
			>
				<View style={[styles.actionButtons, centeredContent]}>
					{!isOwner && isClosed ? (
						<Pressable
							onPress={showSimilar}
							accessibilityRole="button"
							style={({ pressed }) => [
								styles.msgBtn,
								{ backgroundColor: filledColor, opacity: pressed ? 0.85 : 1 },
							]}
						>
							<Ionicons name="albums-outline" size={19} color="#ffffff" />
							<Text style={styles.msgBtnText} numberOfLines={1}>
								{t("listing.seeSimilar")}
							</Text>
						</Pressable>
					) : null}
					{!isOwner && !isClosed && canOrder ? (
						<Pressable
							onPress={() =>
								scrollRef.current?.scrollTo({
									y: Math.max(0, contentY.current + buyBoxY.current - 12),
									animated: true,
								})
							}
							accessibilityRole="button"
							style={({ pressed }) => [
								styles.msgBtn,
								{ backgroundColor: filledColor, opacity: pressed ? 0.85 : 1 },
							]}
						>
							<Ionicons name="bag-handle-outline" size={19} color="#ffffff" />
							{/* It opens the buy box (variant, quantity, delivery), so
							    it says "choose", not "order" as if it ordered. */}
							<Text style={styles.msgBtnText} numberOfLines={1}>
								{t("listing.barChooseOrder")}
							</Text>
						</Pressable>
					) : null}
					{!isOwner && !isClosed && id && !canOrder ? (
						<CallSellerButton
							listingId={id}
							whatsappMessage={t("listing.whatsappAbout", {
								title: listing?.title ?? "",
								url: listingUrl,
							})}
							style={[
								styles.callBtn,
								{ backgroundColor: cardBg, borderColor: c.borderStrong },
							]}
							textStyle={styles.editBtnText}
							color={textColor}
						/>
					) : null}
					{!isOwner && !isClosed ? (
						<Pressable
							onPress={handleMessage}
							disabled={startConversation.isPending}
							accessibilityRole="button"
							accessibilityLabel={messageLabel}
							style={[
								// With an order button beside it, messaging steps back to
								// a square secondary action.
								canOrder ? styles.callBtnSquare : styles.msgBtn,
								canOrder
									? { backgroundColor: cardBg, borderColor: c.borderStrong }
									: { backgroundColor: filledColor },
								{ opacity: startConversation.isPending ? 0.7 : 1 },
							]}
						>
							{startConversation.isPending ? (
								<ActivityIndicator
									size="small"
									color={canOrder ? textColor : "#fff"}
								/>
							) : (
								<Ionicons
									name={
										draftAction
											? DRAFT_ICONS[draftAction]
											: "chatbubble-outline"
									}
									size={18}
									color={canOrder ? textColor : "#fff"}
								/>
							)}
							{!canOrder ? (
								<Text style={styles.msgBtnText} numberOfLines={1}>
									{messageLabel}
								</Text>
							) : null}
						</Pressable>
					) : null}
					{isOwner ? (
						<Pressable
							onPress={() =>
								productId
									? router.push(`/seller/product/${productId}` as never)
									: router.push(`/listing/${id}/edit`)
							}
							accessibilityRole="button"
							style={[
								styles.editBtn,
								{ backgroundColor: cardBg, borderColor: c.borderStrong },
							]}
						>
							<Ionicons name="pencil" size={17} color={linkColor} />
							<Text style={[styles.editBtnText, { color: linkColor }]}>
								{t("listing.edit")}
							</Text>
						</Pressable>
					) : null}
				</View>
			</View>
			<ImageViewer
				uris={images
					.map((image) => resolveListingImageUrl(image))
					.filter((uri): uri is string => Boolean(uri))}
				index={lightboxIdx}
				visible={lightboxVisible}
				onClose={() => setLightboxVisible(false)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	body: { flex: 1 },
	bodyColumns: { flexDirection: "row" },
	details: { flex: 1 },
	// Beside the gallery, not tucked under it.
	contentBeside: {
		marginTop: 0,
		borderTopLeftRadius: 0,
		borderTopRightRadius: 0,
	},

	// ── Fixed back button ──
	backBtn: {
		position: "absolute",
		left: 16,
		zIndex: 20,
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},

	gallery: { position: "relative" },
	imagePlaceholder: {
		alignItems: "center",
		justifyContent: "center",
	},
	// Sits above the sheet's rounded lip, which overlaps the photo by 20.
	indicators: {
		position: "absolute",
		bottom: 34,
		left: 0,
		right: 0,
		flexDirection: "row",
		justifyContent: "center",
		gap: 4,
	},
	dot: { height: 6, borderRadius: 3 },
	photoCount: {
		position: "absolute",
		bottom: 30,
		right: 16,
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 4,
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		backgroundColor: "rgba(18, 22, 58, 0.72)",
	},
	photoCountText: {
		color: "#ffffff",
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
		fontVariant: ["tabular-nums"],
	},
	boostedBadge: {
		position: "absolute",
		bottom: 30,
		left: 16,
		backgroundColor: SUN,
		borderRadius: 8,
		paddingHorizontal: 9,
		paddingVertical: 4,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	boostedText: {
		color: INK,
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodyBold,
	},

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
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
	},

	topBar: {
		position: "absolute",
		left: 16,
		right: 16,
		zIndex: 20,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	// Stays on the right when the back arrow is gone (detail pane).
	topBarEnd: { flexDirection: "row", gap: 10, marginLeft: "auto" },
	floatBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "#ffffff",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.14,
		shadowRadius: 6,
		elevation: 3,
	},
	floatBtnPressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
	hero: { gap: 10, marginBottom: 8 },
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 10,
	},
	// The price is painted on a sign, as at the market.
	priceTag: {
		alignSelf: "flex-start",
		backgroundColor: SUN,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingTop: 4,
		paddingBottom: 6,
	},
	price: {
		fontSize: 30,
		lineHeight: 38,
		color: INK,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.8,
		fontVariant: ["tabular-nums"],
	},
	closedPill: {
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	closedText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodyBold },
	title: {
		fontSize: 24,
		lineHeight: 32,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.5,
	},
	metaRow2: {
		flexDirection: "row",
		columnGap: 14,
		rowGap: 6,
		flexWrap: "wrap",
	},
	metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
	metaText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	chipText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
	sectionTitle: {
		fontSize: 18,
		lineHeight: 26,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.3,
		marginBottom: 10,
	},
	description: { fontSize: 15, lineHeight: 23, fontFamily: Fonts.body },
	// Same width as the visible text (inside the card's 16pt padding).
	measure: {
		position: "absolute",
		left: 16,
		right: 16,
		top: 0,
		opacity: 0,
	},
	hidden: { display: "none" },
	readMoreBtn: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		gap: 4,
		minHeight: 44,
	},
	readMore: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	attrGroup: { marginBottom: 14 },
	attrGroupTitle: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
		marginBottom: 10,
	},
	attrsGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
	attrItem: { width: "50%", paddingRight: 12 },
	attrKey: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
		marginBottom: 2,
	},
	attrVal: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	tag: {
		minHeight: 36,
		justifyContent: "center",
		borderRadius: 8,
		paddingHorizontal: 12,
	},
	tagText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },

	// ── Seller ──
	sellerCard: { flexDirection: "row", alignItems: "center", gap: 14 },
	sellerAvatar: { width: 56, height: 56, borderRadius: 28 },
	sellerAvatarPlaceholder: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	sellerLetter: { fontSize: 24, lineHeight: 32, fontFamily: Fonts.displayBold },
	sellerInfo: { flex: 1, gap: 3 },
	sellerRole: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
	sellerName: { fontSize: 18, lineHeight: 26, fontFamily: Fonts.displayBold },
	memberSince: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },

	safetyStrip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	safetyStripText: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodyMedium,
		flex: 1,
	},
	similar: { marginTop: 8 },
	similarRail: { marginHorizontal: -16 },
	similarRailContent: { gap: 12, paddingHorizontal: 16 },
	reportLink: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		alignSelf: "center",
		gap: 6,
		minHeight: 48,
		paddingHorizontal: 16,
		marginTop: 4,
	},
	reportText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodyMedium },

	// ── Action bar ──
	actionBar: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 16,
		paddingTop: 12,
	},
	actionButtons: { flexDirection: "row", gap: 10 },
	msgBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		minHeight: 52,
		paddingHorizontal: 12,
	},
	msgBtnText: {
		color: "#ffffff",
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
		flexShrink: 1,
	},
	editBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1,
		minHeight: 52,
	},
	editBtnText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodyBold },
	callBtnSquare: {
		width: 52,
		height: 52,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 12,
		borderWidth: 1,
	},
	callBtn: {
		minWidth: 118,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 12,
		borderWidth: 1,
		minHeight: 52,
		paddingHorizontal: 14,
	},
});
