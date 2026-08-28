import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { DecisionSheet } from "@/src/components/moderation/DecisionSheet";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useListingDecision } from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import type { Category, ListingDoc, UserDoc } from "@/src/types/api";

export default function ModerateListingScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const { t } = useTranslation();
	const { centeredContent } = useResponsive();
	const { showError, showSuccess } = useAlert();
	const [rejecting, setRejecting] = useState(false);

	const { data, isLoading } = useQuery({
		queryKey: ["moderation", "listing", id],
		queryFn: () => api.get<ListingDoc>(`/api/listings/${id}?depth=2`),
		enabled: Boolean(id),
	});

	const { mutate: decide, isPending } = useListingDecision();

	const run = (
		action: "approve" | "reject",
		reason?: string,
		note?: string,
	) => {
		decide(
			{ listingId: String(id), action, reason, note },
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
			{isLoading || !data ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : (
				<>
					<ScrollView
						contentContainerStyle={[
							{ padding: 16, gap: 14, paddingBottom: 24 },
							centeredContent,
						]}
					>
						{data.images?.length ? (
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={{ gap: 8 }}
							>
								{data.images.map((entry) => {
									const uri = resolveListingImageUrl(entry);
									if (!uri) return null;
									return (
										<Image
											key={uri}
											source={{ uri }}
											style={styles.photo}
											contentFit="cover"
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

						<View
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<Text style={[styles.listingTitle, { color: c.text }]}>
								{data.title}
							</Text>
							{typeof data.price === "number" ? (
								<Text style={[styles.price, { color: c.primary }]}>
									{data.price.toLocaleString()} {t("currency.xaf")}
								</Text>
							) : null}
							{category ? (
								<View style={[styles.pill, { backgroundColor: c.bg }]}>
									<Text style={[styles.pillText, { color: c.muted }]}>
										{category.name}
									</Text>
								</View>
							) : null}
							{data.description ? (
								<Text style={[styles.description, { color: c.text }]}>
									{data.description}
								</Text>
							) : null}
						</View>

						{seller ? (
							<Pressable
								onPress={() => router.push(`/moderation/user/${seller.id}`)}
								style={[
									styles.card,
									styles.sellerCard,
									{ backgroundColor: c.card, borderColor: c.border },
								]}
							>
								<View style={[styles.avatar, { backgroundColor: c.bg }]}>
									<Ionicons name="person" size={18} color={c.muted} />
								</View>
								<View style={{ flex: 1 }}>
									<Text style={[styles.sellerName, { color: c.text }]}>
										{seller.name || seller.email}
									</Text>
									<Text style={[styles.sellerMeta, { color: c.muted }]}>
										{t("moderation.openAccount")}
									</Text>
								</View>
								<Ionicons name="chevron-forward" size={18} color={c.muted} />
							</Pressable>
						) : null}
					</ScrollView>

					<View
						style={[
							styles.actions,
							{ backgroundColor: c.card, borderTopColor: c.border },
						]}
					>
						<Pressable
							onPress={() => setRejecting(true)}
							disabled={isPending}
							style={[styles.rejectBtn, { borderColor: c.danger }]}
						>
							<Ionicons name="close" size={18} color={c.danger} />
							<Text style={[styles.rejectText, { color: c.danger }]}>
								{t("moderation.reject")}
							</Text>
						</Pressable>
						<Pressable
							onPress={() => run("approve")}
							disabled={isPending}
							style={[styles.approveBtn, { backgroundColor: c.success }]}
						>
							{isPending ? (
								<ActivityIndicator color="#fff" />
							) : (
								<>
									<Ionicons name="checkmark" size={18} color="#fff" />
									<Text style={styles.approveText}>
										{t("moderation.approve")}
									</Text>
								</>
							)}
						</Pressable>
					</View>

					<DecisionSheet
						visible={rejecting}
						title={t("moderation.rejectSheetTitle")}
						subtitle={t("moderation.rejectSheetSubtitle")}
						textLabel={t("moderation.rejectReasonLabel")}
						textPlaceholder={t("moderation.rejectReasonPlaceholder")}
						textRequired
						confirmLabel={t("moderation.confirmReject")}
						destructive
						pending={isPending}
						onConfirm={({ text }) => run("reject", text)}
						onClose={() => setRejecting(false)}
					/>
				</>
			)}
		</ModerationScreen>
	);
}

const styles = StyleSheet.create({
	photo: { width: 220, height: 160, borderRadius: 12 },
	noPhoto: {
		height: 100,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	noPhotoText: { fontSize: 12, fontFamily: Fonts.body },
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 8,
	},
	listingTitle: { fontSize: 17, fontFamily: Fonts.displayBold },
	price: { fontSize: 16, fontFamily: Fonts.displayBold },
	pill: {
		alignSelf: "flex-start",
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	pillText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	description: { fontSize: 14, fontFamily: Fonts.body, lineHeight: 21 },
	sellerCard: { flexDirection: "row", alignItems: "center", gap: 12 },
	avatar: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
	},
	sellerName: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	sellerMeta: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
	actions: {
		flexDirection: "row",
		gap: 10,
		padding: 16,
		paddingBottom: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	rejectBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 14,
		borderWidth: 1.5,
		paddingVertical: 14,
	},
	rejectText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	approveBtn: {
		flex: 1.4,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 14,
		paddingVertical: 14,
	},
	approveText: { fontSize: 15, fontFamily: Fonts.displayBold, color: "#fff" },
});
