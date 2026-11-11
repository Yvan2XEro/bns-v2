import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { DecisionSheet } from "@/src/components/moderation/DecisionSheet";
import {
	DecisionBar,
	DecisionButton,
	DetailSkeleton,
	LoadError,
	ModerationCard,
} from "@/src/components/moderation/ModerationKit";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { tonesOf } from "@/src/components/moderation/tones";
import { useAlert } from "@/src/contexts/AlertContext";
import { useListingDecision } from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import type { Category, ListingDoc, UserDoc } from "@/src/types/api";
import {
	LISTING_REJECTION_REASONS,
	type ListingRejectionReason,
	rejectionNeedsMessage,
} from "../../../../api/src/contracts/listingRejection";

export default function ModerateListingScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t, i18n } = useTranslation();
	const { centeredContent } = useResponsive();
	const { showError, showSuccess } = useAlert();
	const [rejecting, setRejecting] = useState(false);

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: ["moderation", "listing", id],
		queryFn: () => api.get<ListingDoc>(`/api/listings/${id}?depth=2`),
		enabled: Boolean(id),
	});

	const { mutate: decide, isPending } = useListingDecision();

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
					showSuccess(
						action === "approve"
							? t("moderation.approvedTitle")
							: t("moderation.rejectedTitle"),
						action === "approve"
							? t("moderation.approvedMessage")
							: t("moderation.rejectedMessage"),
					);
					// The queue is the moderator's place of work; sending them back
					// there keeps a review session moving instead of stranding them on
					// a listing they have just decided.
					if (router.canGoBack()) router.back();
				},
				onError: (error) =>
					showError(
						t("moderation.actionFailed"),
						resolveErrorMessage(error, t),
					),
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
					onRetry={() => void refetch()}
				/>
			) : (
				<>
					<ScrollView contentContainerStyle={[styles.content, centeredContent]}>
						{data.images?.length ? (
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={styles.photos}
							>
								{data.images.map((entry, index) => {
									const uri = resolveListingImageUrl(entry, "medium");
									if (!uri) return null;
									return (
										<Image
											key={uri}
											source={{ uri }}
											style={[styles.photo, { backgroundColor: c.card }]}
											contentFit="cover"
											transition={150}
											accessibilityLabel={`${data.title} ${index + 1}/${data.images?.length ?? 0}`}
										/>
									);
								})}
							</ScrollView>
						) : (
							<View
								style={[
									styles.noPhoto,
									{ backgroundColor: c.card, borderColor: c.border },
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
							{data.description ? (
								<Text style={[styles.description, { color: c.text }]}>
									{data.description}
								</Text>
							) : null}
						</ModerationCard>

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
					<DecisionBar>
						<DecisionButton
							variant="dangerOutline"
							icon="close"
							label={t("moderation.reject")}
							onPress={() => setRejecting(true)}
							disabled={isPending}
						/>
						<DecisionButton
							variant="approve"
							icon="checkmark"
							label={t("moderation.approve")}
							onPress={() => run("approve")}
							pending={isPending && !rejecting}
							disabled={isPending}
							grow={1.4}
						/>
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
						confirmLabel={t("moderation.confirmReject")}
						destructive
						pending={isPending}
						onConfirm={({ choice, text }) => {
							const code = LISTING_REJECTION_REASONS.find(
								(reason) => reason === choice,
							);
							if (!code) return;
							// "Other reason" says nothing by itself.
							if (rejectionNeedsMessage(code) && !text) {
								showError(
									t("moderation.actionFailed"),
									t("moderation.rejectMessageRequired"),
								);
								return;
							}
							run("reject", code, text || undefined);
						}}
						onClose={() => setRejecting(false)}
					/>
				</>
			)}
		</ModerationScreen>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	content: { padding: 16, gap: 14, paddingBottom: 24 },
	photos: { gap: 8 },
	photo: { width: 240, height: 180, borderRadius: 14 },
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
	sellerMeta: { fontSize: 13, fontFamily: Fonts.bodySemibold, marginTop: 1 },
});
