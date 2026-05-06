import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
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
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { PhoneReveal } from "@/src/components/PhoneReveal";
import { ReviewStars } from "@/src/components/ReviewStars";
import { StatusPill } from "@/src/components/StatusPill";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { useTranslation } from "@/src/lib/i18n";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

const { width } = Dimensions.get("window");

export default function ListingDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const { t } = useTranslation();
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
	const { favoriteIds, toggleFavorite } = useFavoriteActions();
	const [imageIndex, setImageIndex] = useState(0);
	const [lightboxVisible, setLightboxVisible] = useState(false);
	const [lightboxIdx, setLightboxIdx] = useState(0);
	const [descExpanded, setDescExpanded] = useState(false);
	const [contactLoading, setContactLoading] = useState(false);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const priceColor = isDark ? "#e2e8f0" : "#0f172a";

	const { data: listingData, isLoading } = useQuery({
		queryKey: ["listing", id],
		queryFn: () => api.get<any>(`/api/listings/${id}?depth=2`),
		enabled: !!id,
	});

	const { data: favData } = useQuery({
		queryKey: ["favorite", id],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				`/api/favorites?where[listing][equals]=${id}&limit=1`,
			),
		enabled: !!user && !!id,
	});

	const { data: similarData } = useQuery({
		queryKey: ["similar", id],
		queryFn: () =>
			api.get<{ hits: any[]; total: number }>(
				`/api/public/similar?id=${id}&limit=6`,
			),
		enabled: !!id,
	});

	const listing = listingData?.doc ?? listingData;
	const images = listing?.images ?? [];
	const seller = listing?.seller;
	const isOwner = user?.id === seller?.id;
	const favDoc = favData?.docs?.[0];
	const isFavorite = !!favDoc;

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
		const baseUrl =
			process.env.EXPO_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ?? "";
		const url = `${baseUrl}/listing/${id}`;
		Share.share({
			title: listing?.title,
			url,
			message: `${listing?.title} — ${listing?.price?.toLocaleString()} XAF\n${url}`,
		});
	};

	const handleMessage = async () => {
		if (!user) {
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
			return;
		}
		if (!seller) return;
		setContactLoading(true);
		try {
			// Find any existing conversation with this seller (any listing)
			const existing = await api.get<{ docs: any[] }>(
				`/api/conversations?where[participants][equals]=${seller.id}&limit=1&depth=0`,
			);
			if (existing.docs?.length > 0) {
				router.push(`/messages/${existing.docs[0].id}?listing=${id}` as never);
				return;
			}
			// Create a new conversation
			const created = await api.post<{ doc: any }>("/api/conversations", {
				participants: [user.id, seller.id],
				listing: id,
			});
			const convId = created.doc?.id ?? created.doc;
			router.push(`/messages/${convId}?listing=${id}` as never);
		} catch (e) {
			console.error("handleMessage error", e);
		} finally {
			setContactLoading(false);
		}
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

	const timeAgo = (() => {
		const diff = Date.now() - new Date(listing.createdAt).getTime();
		const days = Math.floor(diff / 86400000);
		if (days === 0) return t("listing.today");
		if (days === 1) return t("listing.yesterday");
		return t("listing.daysAgo", { count: days });
	})();

	const actionBarInset = safeBottom + 120;

	const listingTags = Array.isArray(listing.tags)
		? listing.tags.filter((tag: any) => typeof tag === "object" && tag !== null)
		: [];

	return (
		<View style={[styles.root, { backgroundColor: bg }]}>
			{/* Fixed back button — always visible over image */}
			<Pressable
				onPress={() => router.back()}
				style={[
					styles.backBtn,
					{ top: safeTop + 12, backgroundColor: "rgba(0,0,0,0.45)" },
				]}
			>
				<Ionicons name="arrow-back" size={20} color="#fff" />
			</Pressable>

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
							images.map((img: any, i: number) => (
								<Pressable
									key={i}
									onPress={() => {
										setLightboxIdx(i);
										setLightboxVisible(true);
									}}
								>
									<Image
										source={{ uri: resolveListingImageUrl(img) ?? undefined }}
										style={{ width, height: 300 }}
										contentFit="cover"
										placeholder={{ blurhash: "LGF5?xYk^6#M@-5c,1J5@[or[Q6." }}
									/>
								</Pressable>
							))
						) : (
							<View
								style={[
									styles.imagePlaceholder,
									{ backgroundColor: isDark ? "#1e293b" : "#e2e8f0" },
								]}
							>
								<Ionicons name="image-outline" size={60} color={mutedColor} />
							</View>
						)}
					</ScrollView>

					{/* Image indicators */}
					{images.length > 1 && (
						<View style={styles.indicators}>
							{images.map((_: any, i: number) => (
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

				{/* Content */}
				<View style={styles.content}>
					{/* Price & Title */}
					<View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
						{/* ── Actions row: share + favorite ── */}
						<View style={styles.actionsRow}>
							<Pressable
								onPress={handleShare}
								style={[
									styles.actionBtn,
									{
										backgroundColor: isDark ? "#0b1120" : "#f1f5f9",
										borderColor,
									},
								]}
							>
								<Ionicons name="share-outline" size={16} color={primaryColor} />
								<Text style={[styles.actionBtnText, { color: primaryColor }]}>
									{t("listing.share")}
								</Text>
							</Pressable>
							{!isOwner && (
								<Pressable
									onPress={() => toggleFav()}
									style={[
										styles.actionBtn,
										{
											backgroundColor: isFavorite
												? isDark
													? "#3f1212"
													: "#fef2f2"
												: isDark
													? "#0b1120"
													: "#f1f5f9",
											borderColor: isFavorite ? "#fca5a5" : borderColor,
										},
									]}
								>
									<Ionicons
										name={isFavorite ? "heart" : "heart-outline"}
										size={16}
										color={isFavorite ? "#ef4444" : primaryColor}
									/>
									<Text
										style={[
											styles.actionBtnText,
											{ color: isFavorite ? "#ef4444" : primaryColor },
										]}
									>
										{isFavorite ? t("listing.saved") : t("listing.save")}
									</Text>
								</Pressable>
							)}
						</View>

						<Text style={[styles.price, { color: priceColor }]}>
							{listing.price?.toLocaleString() ?? "—"}{" "}
							<Text style={[styles.priceSuffix, { color: mutedColor }]}>
								XAF
							</Text>
						</Text>
						<Text style={[styles.title, { color: textColor }]}>
							{listing.title}
						</Text>
						<View style={styles.metaRow}>
							{listing.condition && <StatusPill status={listing.condition} />}
							{listing.isBoosted && <StatusPill status="boosted" />}
						</View>
						<View style={styles.metaRow2}>
							<View style={styles.metaItem}>
								<Ionicons
									name="location-outline"
									size={13}
									color={mutedColor}
								/>
								<Text style={[styles.metaText, { color: mutedColor }]}>
									{listing.location ?? "—"}
								</Text>
							</View>
							<View style={styles.metaItem}>
								<Ionicons name="time-outline" size={13} color={mutedColor} />
								<Text style={[styles.metaText, { color: mutedColor }]}>
									{timeAgo}
								</Text>
							</View>
							{listing.viewCount > 0 && (
								<View style={styles.metaItem}>
									<Ionicons name="eye-outline" size={13} color={mutedColor} />
									<Text style={[styles.metaText, { color: mutedColor }]}>
										{listing.viewCount}
									</Text>
								</View>
							)}
						</View>
					</View>

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
					{listing.attributes && Object.keys(listing.attributes).length > 0 && (
						<View
							style={[styles.card, { backgroundColor: cardBg, borderColor }]}
						>
							<Text style={[styles.sectionTitle, { color: textColor }]}>
								{t("listing.characteristics")}
							</Text>
							<View style={styles.attrsGrid}>
								{Object.entries(listing.attributes).map(([k, v]) => (
									<View
										key={k}
										style={[
											styles.attrItem,
											{
												backgroundColor: isDark ? "#0b1120" : "#f8fafc",
												borderColor,
											},
										]}
									>
										<Text style={[styles.attrKey, { color: mutedColor }]}>
											{k}
										</Text>
										<Text style={[styles.attrVal, { color: textColor }]}>
											{v === true || v === "true"
												? t("listing.yes")
												: v === false || v === "false"
													? t("listing.no")
													: String(v)}
										</Text>
									</View>
								))}
							</View>
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
								{listingTags.map((tag: any) => (
									<Pressable
										key={String(tag.id)}
										onPress={() =>
											router.push(
												`/(tabs)/search?tags=${encodeURIComponent(tag.slug)}` as any,
											)
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

					{/* Seller Card */}
					{seller && (
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
										{seller.verified && (
											<Ionicons
												name="checkmark-circle"
												size={16}
												color={primaryColor}
											/>
										)}
									</View>
									<ReviewStars
										rating={seller.rating ?? 0}
										showCount
										count={seller.totalReviews}
									/>
									<Text style={[styles.memberSince, { color: mutedColor }]}>
										{t("listing.memberSinceLabel")}{" "}
										{new Date(seller.createdAt).toLocaleDateString("fr-FR", {
											year: "numeric",
											month: "long",
										})}
									</Text>
								</View>
								<Ionicons name="chevron-forward" size={16} color={mutedColor} />
							</View>
							{seller.phone && <PhoneReveal phone={seller.phone} />}
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
									.filter((l: any) => l.id !== id)
									.slice(0, 5)
									.map((l: any) => (
										<ListingCard
											key={l.id}
											listing={l}
											width={180}
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
				<View style={styles.actionButtons}>
					{listing.status === "published" &&
						!(
							listing.boostedUntil &&
							new Date(listing.boostedUntil) > new Date()
						) && (
							<Pressable
								onPress={() => router.push(`/boost/${id}`)}
								style={styles.boostIconBtn}
							>
								<Ionicons name="rocket-outline" size={20} color="#fff" />
							</Pressable>
						)}
					{!isOwner && (
						<Pressable
							onPress={handleMessage}
							disabled={contactLoading}
							style={[
								styles.msgBtn,
								{
									backgroundColor: primaryColor,
									opacity: contactLoading ? 0.7 : 1,
								},
							]}
						>
							{contactLoading ? (
								<ActivityIndicator size="small" color="#fff" />
							) : (
								<Ionicons name="chatbubble-outline" size={18} color="#fff" />
							)}
							<Text style={styles.msgBtnText}>
								{t("listing.contactSeller")}
							</Text>
						</Pressable>
					)}
					{isOwner && (
						<Pressable
							onPress={() => router.push(`/listing/${id}/edit`)}
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
						style={styles.lightboxClose}
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
							style={styles.lightboxImg}
							contentFit="contain"
						/>
					</ScrollView>
					{images.length > 1 && (
						<View style={styles.lightboxNav}>
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
		width,
		height: 300,
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
	content: { padding: 16, gap: 12 },
	card: { borderRadius: 14, borderWidth: 1, padding: 16 },

	// ── Share / Favorite actions ──
	actionsRow: {
		flexDirection: "row",
		gap: 8,
		marginBottom: 14,
	},
	actionBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 10,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 8,
	},
	actionBtnText: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},

	price: { fontSize: 26, fontFamily: Fonts.displayExtrabold, marginBottom: 6 },
	priceSuffix: { fontSize: 16, fontFamily: Fonts.body },
	title: {
		fontSize: 18,
		fontFamily: Fonts.displayBold,
		marginBottom: 10,
		lineHeight: 24,
	},
	metaRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
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
	attrsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	attrItem: {
		borderRadius: 8,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 8,
		minWidth: "45%",
	},
	attrKey: { fontSize: 11, fontFamily: Fonts.bodySemibold, marginBottom: 2 },
	attrVal: { fontSize: 14, fontFamily: Fonts.bodyMedium },
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
	lightboxOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.95)",
		justifyContent: "center",
	},
	lightboxClose: {
		position: "absolute",
		top: 48,
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
	lightboxImg: {
		width,
		height: Dimensions.get("window").height * 0.8,
	},
	lightboxNav: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingBottom: 48,
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
