import { Ionicons } from "@expo/vector-icons";
import {
	type InfiniteData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { ImageViewer } from "@/src/components/ImageViewer";
import { DecisionSheet } from "@/src/components/moderation/DecisionSheet";
import {
	DecisionBar,
	DecisionButton,
	DetailSkeleton,
	FactRow,
	InlineNotice,
	LoadError,
	ModerationCard,
	TonePill,
} from "@/src/components/moderation/ModerationKit";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { type Tone, tonesOf } from "@/src/components/moderation/tones";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	moderationKeys,
	useListingDecision,
	useModerationUser,
} from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import {
	conditionLabelKey,
	listingConditionValue,
} from "@/src/lib/listingCondition";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import type {
	Category,
	ListingDoc,
	ListingStatus,
	PayloadPage,
	UserDoc,
} from "@/src/types/api";
import {
	LISTING_REJECTION_REASONS,
	type ListingRejectionReason,
	rejectionNeedsMessage,
} from "../../../../api/src/contracts/listingRejection";

/** The listing's state as the seller reads it, so the decision is taken knowing it. */
const STATUS_LOOK: Record<ListingStatus, { key: string; tone: Tone }> = {
	draft: { key: "listings.statusDraft", tone: "neutral" },
	pending: { key: "listings.statusPending", tone: "warning" },
	published: { key: "listings.statusPublished", tone: "positive" },
	rejected: { key: "listings.statusRejected", tone: "negative" },
	sold: { key: "listings.statusSold", tone: "neutral" },
	expired: { key: "listings.statusExpired", tone: "neutral" },
	deleted: { key: "moderation.listingStatusDeleted", tone: "neutral" },
};

/**
 * The next listing still waiting after this one, read from the queue the hub
 * already loaded: a review session moves on without a trip back to the list.
 */
function nextPendingId(
	pages: InfiniteData<PayloadPage<ListingDoc>> | undefined,
	currentId: string,
): string | null {
	const docs = (pages?.pages ?? []).flatMap((page) => page.docs);
	const index = docs.findIndex((doc) => doc.id === currentId);
	const rest = index >= 0 ? docs.slice(index + 1) : docs;
	return rest.find((doc) => doc.id !== currentId)?.id ?? null;
}

export default function ModerateListingScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t, i18n } = useTranslation();
	const { centeredContent } = useResponsive();
	const { showError, showSuccess } = useAlert();
	const queryClient = useQueryClient();
	const [rejecting, setRejecting] = useState(false);
	const [viewerIndex, setViewerIndex] = useState<number | null>(null);
	const [photoIndex, setPhotoIndex] = useState(0);

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: ["moderation", "listing", id],
		queryFn: () => api.get<ListingDoc>(`/api/listings/${id}?depth=2`),
		enabled: Boolean(id),
	});

	const {
		mutate: decide,
		isPending,
		error: decisionError,
		reset: resetDecision,
	} = useListingDecision();

	const sellerId =
		data?.seller && typeof data.seller === "object"
			? (data.seller as UserDoc).id
			: typeof data?.seller === "string"
				? data.seller
				: undefined;
	// The seller's record, so a borderline listing is judged with it.
	const sellerSheet = useModerationUser(sellerId);

	const run = (
		action: "approve" | "reject",
		reasonCode?: ListingRejectionReason,
		message?: string,
	) => {
		decide(
			{ listingId: String(id), action, reasonCode, message },
			{
				onSuccess: () => {
					setRejecting(false);
					// Read before the invalidation refetches the queue without it.
					const next = nextPendingId(
						queryClient.getQueryData<InfiniteData<PayloadPage<ListingDoc>>>(
							moderationKeys.listings,
						),
						String(id),
					);
					showSuccess(
						action === "approve"
							? t("moderation.approvedTitle")
							: t("moderation.rejectedTitle"),
						next
							? t("moderation.nextListing")
							: action === "approve"
								? t("moderation.approvedMessage")
								: t("moderation.rejectedMessage"),
					);
					// The next pending listing, straight away; the queue when
					// none is left.
					if (next) {
						router.replace(`/moderation/listing/${next}` as never);
					} else if (router.canGoBack()) {
						router.back();
					}
				},
				// A refusal fails inside its sheet (an alert cannot open over
				// it); an approval has no sheet, so the alert is safe.
				onError: (error) => {
					if (action === "approve") {
						showError(
							t("moderation.actionFailed"),
							resolveErrorMessage(error, t),
						);
					}
				},
			},
		);
	};

	const seller =
		data?.seller && typeof data.seller === "object"
			? (data.seller as UserDoc)
			: null;
	const category =
		data?.category && typeof data.category === "object"
			? (data.category as Category)
			: null;
	const ink = c.isDark ? Colors.dark : Colors.light;
	// Thumbnails and the full-size originals, kept index for index.
	const photos = (data?.images ?? []).flatMap((entry) => {
		const thumb = resolveListingImageUrl(entry, "medium");
		const full = resolveListingImageUrl(entry) ?? thumb;
		return thumb && full ? [{ thumb, full }] : [];
	});
	const status = data ? STATUS_LOOK[data.status] : null;
	// The server refuses both no-ops (409): approving what is already live,
	// rejecting what is already rejected. The bar never offers them.
	const canApprove = data?.status !== "published";
	const canReject = data?.status !== "rejected";
	const conditionKey = conditionLabelKey(
		listingConditionValue(data?.attributes),
	);
	const sellerCounts = sellerSheet.data?.counts;
	const sellerSince = formatDate(
		sellerSheet.data?.user.createdAt ?? seller?.createdAt,
		{ month: "long", year: "numeric" },
	);

	return (
		<ModerationScreen
			title={t("moderation.reviewListing")}
			subtitle={data?.title}
		>
			{isLoading ? (
				<DetailSkeleton />
			) : isError || !data ? (
				<LoadError
					title={t("common.error")}
					message={error ? resolveErrorMessage(error, t) : undefined}
					error={error}
					onRetry={() => void refetch()}
				/>
			) : (
				<>
					<ScrollView contentContainerStyle={[styles.content, centeredContent]}>
						{photos.length ? (
							// The photos are the evidence: each opens full screen, where a
							// moderator can zoom on a logo, a label or a serial number.
							<View>
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									contentContainerStyle={styles.photos}
									scrollEventThrottle={64}
									onScroll={(event) => {
										const x = event.nativeEvent.contentOffset.x;
										const index = Math.round(x / (PHOTO_WIDTH + PHOTO_GAP));
										setPhotoIndex(
											Math.min(Math.max(index, 0), photos.length - 1),
										);
									}}
								>
									{photos.map((photo, index) => (
										<Pressable
											key={photo.thumb}
											accessibilityRole="imagebutton"
											accessibilityLabel={t("shop.openPhoto", {
												index: index + 1,
												count: photos.length,
											})}
											onPress={() => setViewerIndex(index)}
											style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
										>
											<Image
												source={{ uri: photo.thumb }}
												style={[styles.photo, { backgroundColor: ink.well }]}
												contentFit="cover"
												transition={150}
											/>
										</Pressable>
									))}
								</ScrollView>
								{/* How many photos there are, before any scrolling. */}
								{photos.length > 1 ? (
									<View
										style={[styles.counter, { backgroundColor: c.overlay }]}
										accessible={false}
										importantForAccessibility="no-hide-descendants"
									>
										<Text style={styles.counterText}>
											{`${photoIndex + 1}/${photos.length}`}
										</Text>
									</View>
								) : null}
							</View>
						) : (
							<View
								style={[
									styles.noPhoto,
									{ backgroundColor: ink.well, borderColor: c.border },
								]}
							>
								<Ionicons name="image-outline" size={26} color={c.muted} />
								<Text style={[styles.noPhotoText, { color: c.muted }]}>
									{t("moderation.noPhotos")}
								</Text>
							</View>
						)}

						<ModerationCard>
							<Text
								accessibilityRole="header"
								style={[styles.listingTitle, { color: c.text }]}
							>
								{data.title}
							</Text>
							{typeof data.price === "number" || category ? (
								<View style={styles.tagRow}>
									{typeof data.price === "number" ? (
										// The price tag: ink on signage yellow, as everywhere else.
										<View
											style={[
												styles.priceTag,
												{
													backgroundColor: c.isDark
														? Colors.dark.sun
														: Colors.light.sun,
												},
											]}
										>
											<Text style={styles.priceText}>
												{formatPrice(data.price, i18n.language)}
											</Text>
										</View>
									) : null}
									{category ? (
										<View
											style={[styles.pill, { backgroundColor: k.selectedSoft }]}
										>
											<Text style={[styles.pillText, { color: c.text }]}>
												{category.name}
											</Text>
										</View>
									) : null}
								</View>
							) : null}
							{status ? (
								<TonePill
									tone={status.tone}
									label={t(status.key, { defaultValue: data.status })}
								/>
							) : null}
							{/* What a fake or misleading listing is judged on, besides
							    the photos: its stated condition, where, and since when. */}
							<View style={styles.facts}>
								{conditionKey ? (
									<FactRow
										label={t("moderation.factCondition")}
										value={t(conditionKey)}
									/>
								) : null}
								<FactRow label={t("listing.location")} value={data.location} />
								<FactRow
									label={t("moderation.factSubmitted")}
									value={formatDate(data.createdAt, {
										day: "numeric",
										month: "short",
										hour: "2-digit",
										minute: "2-digit",
									})}
								/>
							</View>
							{data.description ? (
								<Text style={[styles.description, { color: ink.body }]}>
									{data.description}
								</Text>
							) : (
								<Text style={[styles.description, { color: c.muted }]}>
									{t("moderation.noDescription")}
								</Text>
							)}
						</ModerationCard>

						{/* Refused before: the reason the seller was given, so a second
						    look does not overturn the first without seeing it. */}
						{data.status === "rejected" && data.rejectionCode ? (
							<InlineNotice
								tone="neutral"
								text={[
									t(`listingRejection.${data.rejectionCode}`, {
										defaultValue: data.rejectionCode,
									}),
									data.rejectionReason,
								]
									.filter(Boolean)
									.join(" — ")}
							/>
						) : null}

						{seller ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={`${seller.name || seller.email}, ${t("moderation.openAccount")}`}
								onPress={() => router.push(`/moderation/user/${seller.id}`)}
								style={({ pressed }) => [
									styles.sellerCard,
									{
										backgroundColor: c.card,
										borderColor: c.border,
										opacity: pressed ? 0.85 : 1,
									},
								]}
							>
								<View style={[styles.avatar, { backgroundColor: c.bg }]}>
									<Ionicons name="person" size={18} color={c.muted} />
								</View>
								<View style={styles.flex}>
									<Text style={[styles.sellerName, { color: c.text }]}>
										{seller.name || seller.email}
									</Text>
									{sellerSince || sellerCounts ? (
										<Text style={[styles.sellerFacts, { color: c.muted }]}>
											{[
												sellerSince
													? t("moderation.memberSince", { date: sellerSince })
													: null,
												sellerCounts
													? t("moderation.sellerOnline", {
															count: sellerCounts.publishedListings,
														})
													: null,
											]
												.filter(Boolean)
												.join(" · ")}
											{sellerCounts ? (
												<Text
													style={
														sellerCounts.reportsAgainst > 0
															? {
																	color: k.dangerText,
																	fontFamily: Fonts.bodySemibold,
																}
															: null
													}
												>
													{` · ${t("moderation.sellerReports", {
														count: sellerCounts.reportsAgainst,
													})}`}
												</Text>
											) : null}
										</Text>
									) : null}
									<Text style={[styles.sellerMeta, { color: k.linkText }]}>
										{t("moderation.openAccount")}
									</Text>
								</View>
								<Ionicons name="chevron-forward" size={18} color={c.muted} />
							</Pressable>
						) : null}
					</ScrollView>

					{/* Reject only opens the reason sheet, so it sits left and quiet;
					    approve is the one-tap outcome and takes the wider slot. */}
					<DecisionBar
						note={
							!canApprove
								? {
										text: t("moderation.listingAlreadyPublished"),
									}
								: !canReject
									? {
											text: t("moderation.listingAlreadyRejected"),
										}
									: null
						}
					>
						{canReject ? (
							<DecisionButton
								variant="dangerOutline"
								icon="close"
								label={t("moderation.reject")}
								onPress={() => {
									resetDecision();
									setRejecting(true);
								}}
								disabled={isPending}
							/>
						) : null}
						{canApprove ? (
							<DecisionButton
								variant="approve"
								icon="checkmark"
								label={t("moderation.approve")}
								onPress={() => run("approve")}
								pending={isPending && !rejecting}
								disabled={isPending}
								grow={1.4}
							/>
						) : null}
					</DecisionBar>

					<DecisionSheet
						visible={rejecting}
						title={t("moderation.rejectSheetTitle")}
						subtitle={t("moderation.rejectSheetSubtitle")}
						choices={LISTING_REJECTION_REASONS.map((code) => ({
							value: code,
							label: t(`listingRejection.${code}`),
						}))}
						choicesLabel={t("moderation.rejectReasonLabel")}
						textLabel={t("moderation.rejectMessageLabel")}
						textPlaceholder={t("moderation.rejectReasonPlaceholder")}
						// "Other reason" says nothing by itself: the message becomes
						// required the moment it is picked, and the sheet says so.
						textRequiredFor={(choice) => {
							const code = LISTING_REJECTION_REASONS.find(
								(reason) => reason === choice,
							);
							return code ? rejectionNeedsMessage(code) : false;
						}}
						confirmLabel={t("moderation.confirmReject")}
						destructive
						pending={isPending}
						error={decisionError ? resolveErrorMessage(decisionError, t) : null}
						onConfirm={({ choice, text }) => {
							const code = LISTING_REJECTION_REASONS.find(
								(reason) => reason === choice,
							);
							if (!code) return;
							if (rejectionNeedsMessage(code) && !text) return;
							run("reject", code, text || undefined);
						}}
						onClose={() => setRejecting(false)}
					/>

					<ImageViewer
						uris={photos.map((photo) => photo.full)}
						index={viewerIndex ?? 0}
						visible={viewerIndex !== null}
						onClose={() => setViewerIndex(null)}
					/>
				</>
			)}
		</ModerationScreen>
	);
}

const PHOTO_WIDTH = 240;
const PHOTO_GAP = 8;

const styles = StyleSheet.create({
	flex: { flex: 1 },
	content: { padding: 16, gap: 14, paddingBottom: 24 },
	photos: { gap: PHOTO_GAP },
	photo: { width: PHOTO_WIDTH, height: 180, borderRadius: 14 },
	counter: {
		position: "absolute",
		top: 8,
		left: 8,
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	counterText: {
		color: "#ffffff",
		fontSize: 13,
		lineHeight: 17,
		fontFamily: Fonts.bodySemibold,
		fontVariant: ["tabular-nums"],
	},
	facts: { gap: 6 },
	noPhoto: {
		height: 112,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	noPhotoText: { fontSize: 13, fontFamily: Fonts.body },
	listingTitle: {
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
	},
	tagRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
	},
	priceTag: {
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	priceText: {
		color: Colors.light.sunForeground,
		fontSize: 18,
		lineHeight: 23,
		letterSpacing: -0.3,
		fontFamily: Fonts.displayExtrabold,
	},
	pill: {
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	pillText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	description: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22 },
	sellerCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 64,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
	},
	avatar: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	sellerName: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	sellerFacts: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	sellerMeta: { fontSize: 13, fontFamily: Fonts.bodySemibold, marginTop: 1 },
});
