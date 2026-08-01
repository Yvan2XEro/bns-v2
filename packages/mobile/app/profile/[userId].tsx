import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { ReviewStars } from "@/src/components/ReviewStars";
import { useAlert } from "@/src/contexts/AlertContext";
import { useIsBlocked, useToggleBlock } from "@/src/hooks/useBlockedUsers";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";

export default function PublicProfileScreen() {
	const { userId } = useLocalSearchParams<{ userId: string }>();
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const { user } = useAuth();
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const { showSuccess, showError, showAlert } = useAlert();
	const { favoriteIds, toggleFavorite } = useFavoriteActions();
	const { isBlocked, blockId } = useIsBlocked(userId);
	const { block, unblock } = useToggleBlock();

	function confirmToggleBlock() {
		if (!user) {
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
			return;
		}
		if (!userId) return;

		if (isBlocked) {
			if (blockId) unblock.mutate(blockId);
			return;
		}

		showAlert(
			t("profile.blockConfirmTitle"),
			t("profile.blockConfirmBody"),
			[
				{ text: t("common.cancel"), style: "cancel" },
				{
					text: t("profile.block"),
					style: "destructive",
					onPress: () => block.mutate(userId),
				},
			],
			"warning",
		);
	}
	const {
		isTablet,
		columns,
		cardWidth: CARD_W,
		centeredContent,
		dialogMaxWidth,
	} = useResponsive();
	const [activeTab, setActiveTab] = useState<"listings" | "reviews">(
		"listings",
	);

	// Review modal state
	const [reviewModal, setReviewModal] = useState(false);
	const [reviewRating, setReviewRating] = useState(0);
	const [reviewComment, setReviewComment] = useState("");

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const isOwnProfile = user?.id === userId;

	const {
		data: profileData,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["profile", userId],
		queryFn: () => api.get<any>(`/api/users/${userId}`),
		enabled: !!userId,
	});

	const { data: listingsData } = useQuery({
		queryKey: ["profile-listings", userId],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				`/api/listings?where[seller][equals]=${userId}&where[status][equals]=published&limit=20`,
			),
		enabled: !!userId,
	});

	const { data: reviewsData } = useQuery({
		queryKey: ["profile-reviews", userId],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				`/api/reviews?where[reviewedUser][equals]=${userId}&limit=20`,
			),
		enabled: !!userId,
	});

	const { mutate: submitReview, isPending: submittingReview } = useMutation({
		mutationFn: () =>
			api.post("/api/reviews", {
				reviewer: user?.id,
				reviewedUser: userId,
				rating: reviewRating,
				comment: reviewComment.trim() || undefined,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["profile-reviews", userId] });
			queryClient.invalidateQueries({ queryKey: ["profile", userId] });
			setReviewModal(false);
			setReviewRating(0);
			setReviewComment("");
			showSuccess(t("profile.reviewPublished"), t("profile.reviewSaved"));
		},
		onError: (err: any) => showError(t("common.error"), err.message),
	});

	const profile = profileData?.doc ?? profileData;
	const listings = listingsData?.docs ?? [];
	const reviews = reviewsData?.docs ?? [];
	const memberSince = formatDate(profile?.createdAt, {
		year: "numeric",
		month: "long",
	});

	// Responsive grid rows (2 on phone, 3–4 on tablet)
	const pairs = chunkIntoRows(listings, columns);

	if (isLoading) {
		return (
			<View style={[styles.loader, { backgroundColor: bg }]}>
				<ActivityIndicator color={primaryColor} />
			</View>
		);
	}

	// Without this the screen rendered an empty profile card on a network
	// failure / 401 / 500, with no way to recover.
	if (isError) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: bg }]}
			>
				<View style={[styles.header, { borderBottomColor: borderColor }]}>
					<Pressable onPress={() => router.back()} style={styles.backBtn}>
						<Ionicons name="arrow-back" size={22} color={textColor} />
					</Pressable>
					<Text style={[styles.headerTitle, { color: textColor }]}>
						{t("profile.title")}
					</Text>
					<View style={{ width: 40 }} />
				</View>
				<EmptyState
					icon="alert-circle-outline"
					title={t("common.error")}
					subtitle={t("home.errorSub")}
					ctaLabel={t("common.retry")}
					onCta={() => refetch()}
				/>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			{/* Header */}
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					{t("profile.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView showsVerticalScrollIndicator={false}>
				{/* Profile card */}
				<View
					style={[
						styles.profileCard,
						{ backgroundColor: cardBg, borderColor },
						centeredContent,
					]}
				>
					{profile?.avatar?.url ? (
						<Image
							source={{ uri: profile.avatar.url }}
							style={styles.avatar}
							contentFit="cover"
						/>
					) : (
						<View
							style={[
								styles.avatarPlaceholder,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Text style={[styles.avatarLetter, { color: primaryColor }]}>
								{profile?.name?.[0]?.toUpperCase()}
							</Text>
						</View>
					)}

					<View style={styles.nameRow}>
						<Text style={[styles.name, { color: textColor }]}>
							{profile?.name}
						</Text>
						{profile?.verified && (
							<View
								style={[
									styles.verifiedBadge,
									{ backgroundColor: primaryColor },
								]}
							>
								<Ionicons name="checkmark" size={11} color="#fff" />
								<Text style={styles.verifiedText}>
									{t("profile.verifiedBadge")}
								</Text>
							</View>
						)}
					</View>

					<ReviewStars
						rating={profile?.rating ?? 0}
						showCount
						count={profile?.totalReviews}
						size={16}
					/>

					<View style={styles.metaRow}>
						{profile?.location && (
							<View style={styles.metaItem}>
								<Ionicons
									name="location-outline"
									size={13}
									color={mutedColor}
								/>
								<Text style={[styles.metaText, { color: mutedColor }]}>
									{profile.location}
								</Text>
							</View>
						)}
						{memberSince && (
							<Text style={[styles.metaText, { color: mutedColor }]}>
								{t("profile.memberSinceDate")} {memberSince}
							</Text>
						)}
					</View>

					{profile?.bio && (
						<Text style={[styles.bio, { color: mutedColor }]}>
							{profile.bio}
						</Text>
					)}

					{!isOwnProfile && (
						<View style={styles.actionRow}>
							<Pressable
								onPress={() =>
									user
										? router.push("/(tabs)/messages")
										: router.push({
												pathname: "/auth/login",
												params: getAuthModalParams(pathname),
											})
								}
								style={[styles.msgBtn, { backgroundColor: primaryColor }]}
							>
								<Ionicons name="chatbubble" size={16} color="#fff" />
								<Text style={styles.msgBtnText}>{t("profile.message")}</Text>
							</Pressable>
							<Pressable
								onPress={() =>
									router.push({
										pathname: "/report",
										params: { targetType: "user", targetId: userId },
									})
								}
								style={[
									styles.iconBtn,
									{ borderColor, backgroundColor: cardBg },
								]}
							>
								<Ionicons name="flag-outline" size={16} color={mutedColor} />
							</Pressable>
							<Pressable
								accessibilityLabel={
									isBlocked ? t("profile.unblock") : t("profile.block")
								}
								onPress={confirmToggleBlock}
								style={[
									styles.iconBtn,
									{ borderColor, backgroundColor: cardBg },
								]}
							>
								<Ionicons
									name={isBlocked ? "lock-open-outline" : "ban-outline"}
									size={16}
									color={mutedColor}
								/>
							</Pressable>
						</View>
					)}
				</View>

				{/* Tabs */}
				<View
					style={[
						styles.tabs,
						{ borderBottomColor: borderColor },
						centeredContent,
					]}
				>
					{(["listings", "reviews"] as const).map((tab) => (
						<Pressable
							key={tab}
							onPress={() => setActiveTab(tab)}
							style={[
								styles.tab,
								activeTab === tab && {
									borderBottomColor: primaryColor,
									borderBottomWidth: 2,
								},
							]}
						>
							<Text
								style={[
									styles.tabText,
									{ color: activeTab === tab ? primaryColor : mutedColor },
								]}
							>
								{tab === "listings"
									? t("profile.listingsTab").replace(
											"{{count}}",
											String(listings.length),
										)
									: t("profile.reviewsTab").replace(
											"{{count}}",
											String(reviews.length),
										)}
							</Text>
						</Pressable>
					))}
				</View>

				{/* Listings tab */}
				{activeTab === "listings" && (
					<View style={styles.grid}>
						{pairs.length > 0 ? (
							pairs.map((pair, i) => (
								<View key={i} style={styles.gridRow}>
									{pair.map((listing: any) => (
										<ListingCard
											key={listing.id}
											listing={listing}
											width={CARD_W}
											isFavorite={favoriteIds.has(listing.id)}
											onToggleFavorite={() => toggleFavorite(listing)}
											onPress={(id) => router.push(`/listing/${id}`)}
										/>
									))}
								</View>
							))
						) : (
							<View style={styles.emptyBox}>
								<Ionicons
									name="pricetag-outline"
									size={36}
									color={mutedColor}
								/>
								<Text style={[styles.emptyTitle, { color: textColor }]}>
									{t("profile.noListingsYet")}
								</Text>
								<Text style={[styles.emptySub, { color: mutedColor }]}>
									{t("profile.noListingsYetSub")}
								</Text>
							</View>
						)}
					</View>
				)}

				{/* Reviews tab */}
				{activeTab === "reviews" && (
					<View style={[styles.reviewsList, centeredContent]}>
						{/* Add review button (non-own profile, logged in) */}
						{!isOwnProfile && user && (
							<Pressable
								onPress={() => setReviewModal(true)}
								style={[styles.addReviewBtn, { backgroundColor: primaryColor }]}
							>
								<Ionicons name="star" size={16} color="#fff" />
								<Text style={styles.addReviewText}>
									{t("profile.leaveReview")}
								</Text>
							</Pressable>
						)}

						{reviews.length > 0 ? (
							reviews.map((review: any) => (
								<View
									key={review.id}
									style={[
										styles.reviewCard,
										{ backgroundColor: cardBg, borderColor },
									]}
								>
									<View style={styles.reviewHeader}>
										<View
											style={[
												styles.reviewerAvatar,
												{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
											]}
										>
											<Text
												style={[styles.reviewerLetter, { color: primaryColor }]}
											>
												{review.reviewer?.name?.[0]?.toUpperCase()}
											</Text>
										</View>
										<View style={{ flex: 1 }}>
											<Text style={[styles.reviewerName, { color: textColor }]}>
												{review.reviewer?.name}
											</Text>
											<ReviewStars rating={review.rating} size={12} />
										</View>
										{formatDate(review.createdAt) && (
											<Text style={[styles.reviewDate, { color: mutedColor }]}>
												{formatDate(review.createdAt)}
											</Text>
										)}
									</View>
									{review.comment && (
										<Text
											style={[
												styles.reviewComment,
												{ color: isDark ? "#cbd5e1" : "#334155" },
											]}
										>
											{review.comment}
										</Text>
									)}
								</View>
							))
						) : (
							<View style={styles.emptyBox}>
								<Ionicons name="star-outline" size={36} color={mutedColor} />
								<Text style={[styles.emptyTitle, { color: textColor }]}>
									{t("profile.noReviewsYet")}
								</Text>
								<Text style={[styles.emptySub, { color: mutedColor }]}>
									{t("profile.noReviewsYetSub")}
								</Text>
							</View>
						)}
					</View>
				)}
			</ScrollView>

			{/* Add review modal */}
			<Modal
				visible={reviewModal}
				transparent
				animationType="slide"
				onRequestClose={() => setReviewModal(false)}
			>
				<Pressable
					style={styles.modalOverlay}
					onPress={() => setReviewModal(false)}
				/>
				<View
					style={[
						styles.modalSheet,
						{ backgroundColor: cardBg },
						// Centred, width-capped dialog on iPad instead of a full-bleed sheet.
						isTablet && {
							alignSelf: "center",
							width: "100%",
							maxWidth: dialogMaxWidth,
							borderRadius: 20,
							marginBottom: 24,
						},
					]}
				>
					<View
						style={[styles.modalHeader, { borderBottomColor: borderColor }]}
					>
						<Text style={[styles.modalTitle, { color: textColor }]}>
							{t("profile.leaveReview")}
						</Text>
						<Pressable onPress={() => setReviewModal(false)}>
							<Ionicons name="close" size={22} color={textColor} />
						</Pressable>
					</View>

					<KeyboardAwareScrollView
						keyboardShouldPersistTaps="handled"
						bottomOffset={24}
						contentContainerStyle={styles.modalBody}
					>
						{/* Star rating picker */}
						<Text style={[styles.fieldLabel, { color: mutedColor }]}>
							{t("profile.ratingLabel")}
						</Text>
						<View style={styles.starPicker}>
							{[1, 2, 3, 4, 5].map((s) => (
								<Pressable
									key={s}
									onPress={() => setReviewRating(s)}
									hitSlop={8}
								>
									<Ionicons
										name={s <= reviewRating ? "star" : "star-outline"}
										size={36}
										color={s <= reviewRating ? "#f59e0b" : mutedColor}
									/>
								</Pressable>
							))}
						</View>

						{/* Comment */}
						<Text style={[styles.fieldLabel, { color: mutedColor }]}>
							{t("profile.commentLabel")}
						</Text>
						<TextInput
							value={reviewComment}
							onChangeText={setReviewComment}
							placeholder={t("profile.commentPlaceholder")}
							placeholderTextColor={mutedColor}
							multiline
							numberOfLines={4}
							style={[
								styles.textarea,
								{ backgroundColor: bg, borderColor, color: textColor },
							]}
						/>

						<Pressable
							onPress={() => reviewRating > 0 && submitReview()}
							disabled={reviewRating === 0 || submittingReview}
							style={[
								styles.submitBtn,
								{
									backgroundColor:
										reviewRating === 0
											? isDark
												? "#1e293b"
												: "#e2e8f0"
											: primaryColor,
								},
							]}
						>
							{submittingReview ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text
									style={[
										styles.submitText,
										{ color: reviewRating === 0 ? mutedColor : "#fff" },
									]}
								>
									{t("profile.publishReview")}
								</Text>
							)}
						</Pressable>
					</KeyboardAwareScrollView>
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	loader: { flex: 1, alignItems: "center", justifyContent: "center" },

	/* Header */
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: { fontSize: 17, fontFamily: Fonts.displayBold },

	/* Profile card */
	profileCard: {
		margin: 16,
		borderRadius: 16,
		borderWidth: 1,
		padding: 20,
		alignItems: "center",
		gap: 8,
	},
	avatar: { width: 88, height: 88, borderRadius: 44 },
	avatarPlaceholder: {
		width: 88,
		height: 88,
		borderRadius: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: { fontSize: 34, fontFamily: Fonts.displayExtrabold },
	nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	name: { fontSize: 20, fontFamily: Fonts.displayExtrabold },
	verifiedBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		borderRadius: 12,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	verifiedText: { color: "#fff", fontSize: 11, fontFamily: Fonts.displayBold },
	metaRow: { gap: 4, alignItems: "center" },
	metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
	metaText: { fontSize: 13, fontFamily: Fonts.body },
	bio: {
		fontSize: 14,
		fontFamily: Fonts.body,
		lineHeight: 20,
		textAlign: "center",
	},
	actionRow: { flexDirection: "row", gap: 8, marginTop: 4, width: "100%" },
	msgBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 12,
		paddingVertical: 12,
	},
	msgBtnText: { color: "#fff", fontFamily: Fonts.displayBold, fontSize: 14 },
	iconBtn: {
		width: 46,
		height: 46,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},

	/* Tabs */
	tabs: { flexDirection: "row", borderBottomWidth: 1 },
	tab: {
		flex: 1,
		paddingVertical: 12,
		alignItems: "center",
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	tabText: { fontSize: 14, fontFamily: Fonts.displayBold },

	/* Listings grid */
	grid: { padding: 16, gap: 12 },
	gridRow: { flexDirection: "row", gap: 12 },

	/* Reviews */
	reviewsList: { padding: 16, gap: 10 },
	addReviewBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		paddingVertical: 13,
		marginBottom: 4,
	},
	addReviewText: { color: "#fff", fontFamily: Fonts.displayBold, fontSize: 14 },
	reviewCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
	reviewHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 8,
	},
	reviewerAvatar: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	reviewerLetter: { fontFamily: Fonts.displayBold, fontSize: 15 },
	reviewerName: { fontSize: 14, fontFamily: Fonts.displayBold },
	reviewDate: { fontSize: 12, fontFamily: Fonts.body },
	reviewComment: { fontSize: 14, fontFamily: Fonts.body, lineHeight: 20 },

	/* Empty state */
	emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
	emptyTitle: { fontSize: 16, fontFamily: Fonts.displayBold },
	emptySub: { fontSize: 13, fontFamily: Fonts.body, textAlign: "center" },

	/* Review modal */
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.4)",
	},
	modalSheet: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingBottom: 32,
	},
	modalHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 16,
		borderBottomWidth: 1,
	},
	modalTitle: { fontSize: 17, fontFamily: Fonts.displayBold },
	modalBody: { padding: 20, gap: 12 },
	fieldLabel: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	starPicker: {
		flexDirection: "row",
		gap: 8,
		justifyContent: "center",
		paddingVertical: 8,
	},
	textarea: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 14,
		fontFamily: Fonts.body,
		minHeight: 100,
		textAlignVertical: "top",
	},
	submitBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
	submitText: { fontSize: 15, fontFamily: Fonts.displayBold },
});
