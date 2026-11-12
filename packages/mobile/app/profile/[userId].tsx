import { Ionicons } from "@expo/vector-icons";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
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
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { ListingCard } from "@/src/components/ListingCard";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import {
	ListingGridSkeleton,
	ProfileSkeleton,
	SkeletonBox,
} from "@/src/components/listing/Skeletons";
import { ReviewStars } from "@/src/components/ReviewStars";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { useAlert } from "@/src/contexts/AlertContext";
import { useIsBlocked, useToggleBlock } from "@/src/hooks/useBlockedUsers";
import { useFavoriteActions } from "@/src/hooks/useFavorites";
import { chunkIntoRows, useResponsive } from "@/src/hooks/useResponsive";
import { useContactShop } from "@/src/hooks/useShopReviews";
import { useUserShop } from "@/src/hooks/useShops";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { withContentLocale } from "@/src/lib/contentLocale";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";

export default function PublicProfileScreen() {
	const { userId } = useLocalSearchParams<{ userId: string }>();
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const { user } = useAuth();
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const { showSuccess, showError, showAlert } = useAlert();
	const { favoriteIds, toggleFavorite } = useFavoriteActions();
	const { isBlocked, blockId } = useIsBlocked(userId);
	const { block, unblock } = useToggleBlock();
	// Most profiles own no shop — this stays null and the card renders exactly
	// as it did before shop badges existed.
	const { data: userShop } = useUserShop(userId);
	const contactShop = useContactShop();

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

	const c = isDark ? Colors.dark : Colors.light;
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const bodyColor = c.body;
	const mutedColor = c.mutedForeground;
	const primaryColor = c.primary;
	// Brand-coloured words and initials: 7:1 on a night card, not 4.3.
	const linkColor = c.link;
	const borderColor = c.border;
	// White on the dark-mode primary fails contrast: filled buttons take the
	// deeper indigo in dark mode.
	const filledColor = c.primaryFill;
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

	// Every listing, twenty at a time: the tab shows the real total.
	const {
		data: listingsData,
		isLoading: listingsLoading,
		fetchNextPage: fetchMoreListings,
		hasNextPage: hasMoreListings,
		isFetchingNextPage: loadingMoreListings,
	} = useInfiniteQuery({
		queryKey: ["profile-listings", userId],
		queryFn: ({ pageParam }: { pageParam: number }) =>
			api.get<{ docs: any[]; totalDocs?: number; hasNextPage?: boolean }>(
				withContentLocale(
					`/api/listings?where[seller][equals]=${userId}&where[status][equals]=published&limit=20&page=${pageParam}`,
				),
			),
		initialPageParam: 1,
		getNextPageParam: (last, pages) =>
			last?.hasNextPage ? pages.length + 1 : undefined,
		enabled: !!userId,
	});

	// Reviews need a past exchange (a conversation or a revealed number);
	// the server checks. A conversation is the part this app can see, so
	// without one the button comes with a word on when a review is possible.
	const { data: sharedConversation } = useQuery({
		queryKey: ["profile-conversation", user?.id, userId],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				`/api/conversations?where[participants][equals]=${userId}&limit=1&depth=0`,
			),
		enabled: !!user && !!userId && user.id !== userId,
		staleTime: 5 * 60 * 1000,
	});
	const hasExchanged = (sharedConversation?.docs?.length ?? 0) > 0;

	const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
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
		onError: (err: any) =>
			showError(t("common.error"), resolveErrorMessage(err, t)),
	});

	const profile = profileData?.doc ?? profileData;
	const listings = (listingsData?.pages ?? []).flatMap(
		(page) => page?.docs ?? [],
	);
	const listingsTotal = listingsData?.pages[0]?.totalDocs ?? listings.length;
	const reviews = reviewsData?.docs ?? [];
	const memberSince = formatDate(profile?.createdAt, {
		year: "numeric",
		month: "long",
	});

	// Responsive grid rows (2 on phone, 3–4 on tablet)
	const pairs = chunkIntoRows(listings, columns);

	const goLogin = () =>
		router.push({
			pathname: "/auth/login",
			params: getAuthModalParams(pathname),
		});

	// A seller with a shop is reached through it, like on the shop page. A
	// private seller has no direct thread: they are messaged from a listing.
	const messageSeller = () => {
		if (!userShop) return;
		if (!user) return goLogin();
		contactShop.mutate(userShop.id, {
			onSuccess: ({ conversationId }) =>
				router.push(`/messages/${conversationId}`),
			onError: (error) =>
				showError(t("common.error"), resolveErrorMessage(error, t)),
		});
	};

	const openReport = () => {
		if (!user) return goLogin();
		router.push({
			pathname: "/report",
			params: { targetType: "user", targetId: userId },
		});
	};

	// Closing a review with words or stars in it asks first.
	// Closing a review with words or stars in it asks first, inside the
	// sheet: a second Modal over this one fails to present on iOS.
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	const discardReview = () => {
		setConfirmDiscard(false);
		setReviewModal(false);
		setReviewRating(0);
		setReviewComment("");
	};
	const closeReview = () => {
		if (submittingReview) return;
		if (reviewRating === 0 && !reviewComment.trim()) {
			setReviewModal(false);
			return;
		}
		setConfirmDiscard(true);
	};

	const header = (
		<View style={[styles.header, { borderBottomColor: borderColor }]}>
			<HeaderBackButton
				color={textColor}
				fallback="/(tabs)/home"
				style={styles.backBtn}
			/>
			<Text
				style={[styles.headerTitle, { color: textColor }]}
				accessibilityRole="header"
				numberOfLines={1}
			>
				{t("profile.title")}
			</Text>
			<View style={styles.headerSpacer} />
		</View>
	);

	if (isLoading) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: bg }]}
			>
				{header}
				<ProfileSkeleton />
			</SafeAreaView>
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
				{header}
				<EmptyState
					illustration="notFound"
					title={t("home.errorTitle")}
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
			{header}

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
								{ backgroundColor: c.primaryTint },
							]}
						>
							<Text style={[styles.avatarLetter, { color: linkColor }]}>
								{profile?.name?.[0]?.toUpperCase() ?? "?"}
							</Text>
						</View>
					)}

					<View style={styles.nameRow}>
						<Text
							style={[styles.name, { color: textColor }]}
							accessibilityRole="header"
						>
							{profile?.name}
						</Text>
						{userShop ? <LevelBadge badge={userShop.badge} size="sm" /> : null}
					</View>

					<ReviewStars
						rating={profile?.rating ?? 0}
						showCount
						count={profile?.totalReviews}
						size={16}
					/>

					<View style={styles.metaRow}>
						{profile?.location ? (
							<View style={styles.metaItem}>
								<Ionicons
									name="location-outline"
									size={14}
									color={mutedColor}
								/>
								<Text style={[styles.metaText, { color: bodyColor }]}>
									{profile.location}
								</Text>
							</View>
						) : null}
						{memberSince ? (
							<View style={styles.metaItem}>
								<Ionicons
									name="calendar-outline"
									size={14}
									color={mutedColor}
								/>
								<Text style={[styles.metaText, { color: mutedColor }]}>
									{t("profile.memberSinceDate")} {memberSince}
								</Text>
							</View>
						) : null}
					</View>

					{userShop?.handle ? (
						<Pressable
							onPress={() =>
								router.push({
									pathname: "/s/[handle]",
									params: { handle: userShop.handle },
								})
							}
							accessibilityRole="link"
							style={({ pressed }) => [
								styles.shopRow,
								{
									borderColor,
									backgroundColor: pressed ? c.well : c.background,
								},
							]}
						>
							<Ionicons name="storefront-outline" size={18} color={linkColor} />
							<Text
								style={[styles.shopRowText, { color: textColor }]}
								numberOfLines={1}
							>
								{userShop.name}
							</Text>
							<Ionicons name="chevron-forward" size={18} color={mutedColor} />
						</Pressable>
					) : null}

					{profile?.bio ? (
						<Text style={[styles.bio, { color: bodyColor }]}>
							{profile.bio}
						</Text>
					) : null}

					{!isOwnProfile ? (
						<View style={styles.actionRow}>
							{userShop ? (
								<Pressable
									onPress={messageSeller}
									disabled={contactShop.isPending}
									accessibilityRole="button"
									accessibilityState={{ busy: contactShop.isPending }}
									style={({ pressed }) => [
										styles.msgBtn,
										{
											backgroundColor: filledColor,
											opacity: pressed || contactShop.isPending ? 0.85 : 1,
										},
									]}
								>
									{contactShop.isPending ? (
										<ActivityIndicator size="small" color="#ffffff" />
									) : (
										<Ionicons
											name="chatbubble-outline"
											size={18}
											color="#ffffff"
										/>
									)}
									<Text style={styles.msgBtnText}>{t("profile.message")}</Text>
								</Pressable>
							) : null}
							<Pressable
								onPress={openReport}
								accessibilityRole="button"
								accessibilityLabel={t("profile.reportProfile")}
								style={({ pressed }) => [
									styles.iconBtn,
									{
										borderColor: c.borderStrong,
										backgroundColor: pressed ? c.well : cardBg,
									},
								]}
							>
								<Ionicons name="flag-outline" size={19} color={bodyColor} />
							</Pressable>
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={
									isBlocked ? t("profile.unblock") : t("profile.block")
								}
								onPress={confirmToggleBlock}
								style={({ pressed }) => [
									styles.iconBtn,
									{
										borderColor: c.borderStrong,
										backgroundColor: pressed ? c.well : cardBg,
									},
								]}
							>
								<Ionicons
									name={isBlocked ? "lock-open-outline" : "ban-outline"}
									size={19}
									color={isBlocked ? bodyColor : c.destructive}
								/>
							</Pressable>
						</View>
					) : null}
				</View>

				{/* Tabs */}
				<View
					style={[
						styles.tabs,
						{ borderBottomColor: borderColor },
						centeredContent,
					]}
					accessibilityRole="tablist"
				>
					{(["listings", "reviews"] as const).map((tab) => (
						<Pressable
							key={tab}
							onPress={() => setActiveTab(tab)}
							accessibilityRole="tab"
							accessibilityState={{ selected: activeTab === tab }}
							style={[
								styles.tab,
								activeTab === tab && {
									borderBottomColor: primaryColor,
									borderBottomWidth: 3,
								},
							]}
						>
							<Text
								style={[
									styles.tabText,
									{ color: activeTab === tab ? textColor : mutedColor },
								]}
							>
								{tab === "listings"
									? t("profile.listingsTab", { count: listingsTotal })
									: t("profile.reviewsTab", { count: reviews.length })}
							</Text>
						</Pressable>
					))}
				</View>

				{/* Listings tab */}
				{activeTab === "listings" ? (
					<View style={styles.grid}>
						{listingsLoading ? (
							<ListingGridSkeleton
								cardWidth={CARD_W}
								columns={columns}
								rows={2}
							/>
						) : pairs.length > 0 ? (
							<>
								{pairs.map((pair, i) => (
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
								))}
								{hasMoreListings ? (
									<Pressable
										onPress={() => void fetchMoreListings()}
										disabled={loadingMoreListings}
										accessibilityRole="button"
										accessibilityState={{ busy: loadingMoreListings }}
										style={({ pressed }) => [
											styles.moreBtn,
											{
												borderColor: c.borderStrong,
												backgroundColor: pressed ? c.well : cardBg,
											},
										]}
									>
										{loadingMoreListings ? (
											<ActivityIndicator color={primaryColor} />
										) : (
											<Text style={[styles.moreText, { color: linkColor }]}>
												{t("home.showMore")}
											</Text>
										)}
									</Pressable>
								) : null}
							</>
						) : (
							<EmptyState
								illustration="listings"
								title={t("profile.noListingsYet")}
								subtitle={t("profile.noListingsYetSub")}
								size={140}
							/>
						)}
					</View>
				) : null}

				{/* Reviews tab */}
				{activeTab === "reviews" ? (
					<View style={[styles.reviewsList, centeredContent]}>
						{/* Add review button (non-own profile, logged in) */}
						{!isOwnProfile && user && !hasExchanged ? (
							<Text style={[styles.reviewHint, { color: bodyColor }]}>
								{t("profile.reviewAfterExchange")}
							</Text>
						) : null}
						{!isOwnProfile && user ? (
							<Pressable
								onPress={() => {
									setConfirmDiscard(false);
									setReviewModal(true);
								}}
								accessibilityRole="button"
								style={({ pressed }) => [
									styles.addReviewBtn,
									{
										borderColor: c.borderStrong,
										backgroundColor: pressed ? c.well : cardBg,
									},
								]}
							>
								<Ionicons name="star-outline" size={18} color={linkColor} />
								<Text style={[styles.addReviewText, { color: linkColor }]}>
									{t("profile.leaveReview")}
								</Text>
							</Pressable>
						) : null}

						{reviewsLoading ? (
							[0, 1].map((k) => (
								<View
									key={k}
									style={[
										styles.reviewCard,
										{ backgroundColor: cardBg, borderColor },
									]}
								>
									<View style={styles.reviewHeader}>
										<SkeletonBox width={36} height={36} radius={18} />
										<View style={{ flex: 1, gap: 6 }}>
											<SkeletonBox width="40%" height={14} />
											<SkeletonBox width={80} height={12} />
										</View>
									</View>
									<SkeletonBox width="90%" height={13} />
								</View>
							))
						) : reviews.length > 0 ? (
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
												{ backgroundColor: c.primaryTint },
											]}
										>
											<Text
												style={[styles.reviewerLetter, { color: linkColor }]}
											>
												{review.reviewer?.name?.[0]?.toUpperCase() ?? "?"}
											</Text>
										</View>
										<View style={{ flex: 1, gap: 3 }}>
											<Text
												style={[styles.reviewerName, { color: textColor }]}
												numberOfLines={1}
											>
												{review.reviewer?.name}
											</Text>
											<ReviewStars rating={review.rating} size={13} />
										</View>
										{formatDate(review.createdAt) ? (
											<Text style={[styles.reviewDate, { color: mutedColor }]}>
												{formatDate(review.createdAt)}
											</Text>
										) : null}
									</View>
									{review.comment ? (
										<Text style={[styles.reviewComment, { color: bodyColor }]}>
											{review.comment}
										</Text>
									) : null}
								</View>
							))
						) : (
							<EmptyState
								illustration="empty"
								title={t("profile.noReviewsYet")}
								subtitle={
									!isOwnProfile && user
										? t("profile.noReviewsYetSub")
										: undefined
								}
								size={140}
							/>
						)}
					</View>
				) : null}
			</ScrollView>

			{/* Add review modal */}
			<Modal
				visible={reviewModal}
				transparent
				animationType="slide"
				onRequestClose={closeReview}
			>
				<Pressable
					style={styles.modalOverlay}
					onPress={closeReview}
					accessibilityRole="button"
					accessibilityLabel={t("common.close")}
				/>
				<View
					style={[
						styles.modalSheet,
						{ backgroundColor: cardBg },
						// Static padding is wrong on both gesture nav (~16dp) and 3-button
						// nav (~48dp), and ignores the iOS home indicator.
						{ paddingBottom: insets.bottom + 24 },
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
						<Text
							style={[styles.modalTitle, { color: textColor }]}
							accessibilityRole="header"
						>
							{t("profile.leaveReview")}
						</Text>
						<Pressable
							onPress={closeReview}
							accessibilityRole="button"
							accessibilityLabel={t("common.close")}
							style={styles.modalClose}
						>
							<Ionicons name="close" size={24} color={textColor} />
						</Pressable>
					</View>

					<KeyboardAwareScrollView
						keyboardShouldPersistTaps="handled"
						bottomOffset={24}
						contentContainerStyle={styles.modalBody}
					>
						{confirmDiscard ? (
							<View
								style={[styles.discardBox, { backgroundColor: c.well }]}
								accessibilityLiveRegion="polite"
							>
								<Text style={[styles.discardTitle, { color: textColor }]}>
									{t("profile.discardReviewTitle")}
								</Text>
								<View style={styles.discardActions}>
									<Pressable
										onPress={() => setConfirmDiscard(false)}
										accessibilityRole="button"
										style={[styles.discardBtn, { borderColor: c.borderStrong }]}
									>
										<Text style={[styles.discardKeep, { color: textColor }]}>
											{t("profile.keepWriting")}
										</Text>
									</Pressable>
									<Pressable
										onPress={discardReview}
										accessibilityRole="button"
										style={[styles.discardBtn, { borderColor: c.dangerText }]}
									>
										<Text style={[styles.discardKeep, { color: c.dangerText }]}>
											{t("profile.discardReview")}
										</Text>
									</Pressable>
								</View>
							</View>
						) : null}
						{/* Star rating picker */}
						<Text style={[styles.fieldLabel, { color: mutedColor }]}>
							{t("profile.ratingLabel")}
						</Text>
						<View style={styles.starPicker}>
							<ReviewStars
								rating={reviewRating}
								onRate={setReviewRating}
								size={34}
							/>
						</View>

						{/* Comment */}
						<Text style={[styles.fieldLabel, { color: mutedColor }]}>
							{t("profile.commentLabel")}
						</Text>
						<TextInput
							value={reviewComment}
							onChangeText={setReviewComment}
							placeholder={t("profile.commentPlaceholder")}
							placeholderTextColor={c.mutedForeground}
							accessibilityLabel={t("profile.commentLabel")}
							multiline
							numberOfLines={4}
							style={[
								styles.textarea,
								{ backgroundColor: c.well, borderColor, color: textColor },
							]}
						/>

						<Pressable
							onPress={() => reviewRating > 0 && submitReview()}
							disabled={reviewRating === 0 || submittingReview}
							accessibilityRole="button"
							accessibilityState={{
								disabled: reviewRating === 0 || submittingReview,
								busy: submittingReview,
							}}
							style={[
								styles.submitBtn,
								{
									backgroundColor: reviewRating === 0 ? c.well : filledColor,
								},
							]}
						>
							{submittingReview ? (
								<ActivityIndicator color="#ffffff" />
							) : (
								<Text
									style={[
										styles.submitText,
										{ color: reviewRating === 0 ? mutedColor : "#ffffff" },
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

	/* Header */
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 8,
		minHeight: 56,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	backBtn: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	headerSpacer: { width: 48 },
	headerTitle: {
		flex: 1,
		textAlign: "center",
		fontSize: 18,
		fontFamily: Fonts.displayBold,
	},

	/* Profile card */
	profileCard: {
		margin: 16,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 20,
		alignItems: "center",
		gap: 8,
	},
	avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 4 },
	avatarPlaceholder: {
		width: 88,
		height: 88,
		borderRadius: 44,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
	},
	avatarLetter: { fontSize: 34, fontFamily: Fonts.displayExtrabold },
	nameRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 8,
	},
	name: {
		fontSize: 24,
		lineHeight: 29,
		letterSpacing: -0.5,
		fontFamily: Fonts.displayExtrabold,
		textAlign: "center",
	},
	metaRow: { gap: 4, alignItems: "center", marginTop: 2 },
	metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
	metaText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	bio: {
		fontSize: 15,
		fontFamily: Fonts.body,
		lineHeight: 22,
		textAlign: "center",
		marginTop: 4,
	},
	actionRow: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 10,
		marginTop: 10,
		width: "100%",
	},
	shopRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		alignSelf: "stretch",
		minHeight: 48,
		paddingHorizontal: 14,
		borderRadius: 12,
		borderWidth: 1,
		marginTop: 6,
	},
	shopRowText: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
	},
	moreBtn: {
		alignSelf: "stretch",
		minHeight: 52,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 4,
	},
	moreText: { fontSize: 16, fontFamily: Fonts.bodyBold },
	reviewHint: {
		fontSize: 14,
		lineHeight: 20,
		fontFamily: Fonts.body,
		textAlign: "center",
	},
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
	msgBtnText: { color: "#ffffff", fontFamily: Fonts.bodyBold, fontSize: 16 },
	iconBtn: {
		width: 52,
		height: 52,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},

	/* Tabs */
	tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
	tab: {
		flex: 1,
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
		borderBottomWidth: 3,
		borderBottomColor: "transparent",
	},
	tabText: { fontSize: 15, fontFamily: Fonts.bodyBold },

	/* Listings grid */
	grid: { padding: 16, gap: 16 },
	gridRow: { flexDirection: "row", gap: 12 },

	/* Reviews */
	reviewsList: { padding: 16, gap: 10 },
	addReviewBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1,
		minHeight: 52,
		marginBottom: 6,
	},
	addReviewText: { fontFamily: Fonts.bodyBold, fontSize: 16 },
	reviewCard: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 10,
	},
	reviewHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	reviewerAvatar: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	reviewerLetter: { fontFamily: Fonts.displayBold, fontSize: 15 },
	reviewerName: { fontSize: 15, fontFamily: Fonts.bodyBold },
	reviewDate: { fontSize: 12, fontFamily: Fonts.body },
	reviewComment: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22 },

	/* Review modal */
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(18, 22, 58, 0.5)",
	},
	modalSheet: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		// paddingBottom is applied inline from the safe-area insets.
	},
	modalHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingLeft: 20,
		paddingRight: 8,
		minHeight: 60,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	modalClose: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	modalTitle: { fontSize: 20, fontFamily: Fonts.displayBold },
	modalBody: { padding: 20, gap: 12 },
	discardBox: { borderRadius: 12, padding: 14, gap: 10 },
	discardTitle: {
		fontSize: 15,
		lineHeight: 20,
		fontFamily: Fonts.bodySemibold,
	},
	discardActions: { flexDirection: "row", gap: 10 },
	discardBtn: {
		flex: 1,
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 8,
	},
	discardKeep: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	fieldLabel: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	starPicker: {
		alignItems: "center",
		paddingVertical: 4,
	},
	textarea: {
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingTop: 12,
		paddingBottom: 12,
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.body,
		minHeight: 112,
		textAlignVertical: "top",
	},
	submitBtn: {
		borderRadius: 12,
		minHeight: 52,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 4,
	},
	submitText: { fontSize: 16, fontFamily: Fonts.bodyBold },
});
