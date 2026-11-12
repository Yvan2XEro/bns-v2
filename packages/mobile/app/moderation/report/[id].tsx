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
	TonePill,
} from "@/src/components/moderation/ModerationKit";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { tonesOf } from "@/src/components/moderation/tones";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useModerationShop,
	useModerationUser,
	useReportDecision,
} from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import type { ListingDoc, ReportDoc, UserDoc } from "@/src/types/api";

/**
 * A report is only actionable if the moderator can reach what was reported,
 * so the sheet always offers a route to the target — the listing review
 * screen, or the account sheet where a sanction can be applied.
 */
function targetRoute(report: ReportDoc): string | null {
	if (report.targetType === "listing") {
		return `/moderation/listing/${report.targetId}`;
	}
	if (report.targetType === "user") {
		return `/moderation/user/${report.targetId}`;
	}
	if (report.targetType === "shop") {
		return `/moderation/shop/${report.targetId}`;
	}
	return null;
}

function targetIcon(type: ReportDoc["targetType"]) {
	return type === "user"
		? "person"
		: type === "listing"
			? "pricetag"
			: type === "shop"
				? "storefront"
				: "chatbubble";
}

export default function ModerateReportScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const { centeredContent } = useResponsive();
	const { showSuccess } = useAlert();
	const [deciding, setDeciding] = useState<"resolved" | "dismissed" | null>(
		null,
	);

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: ["moderation", "report", id],
		queryFn: () => api.get<ReportDoc>(`/api/reports/${id}?depth=1`),
		enabled: Boolean(id),
	});

	const {
		mutate: decide,
		isPending,
		error: decisionError,
		reset: resetDecision,
	} = useReportDecision();

	// What was reported, by name: the same reads the target screens make, so
	// opening the target afterwards comes from the cache.
	const targetType = data?.targetType;
	const targetId = data?.targetId;
	const listingTarget = useQuery({
		queryKey: ["moderation", "listing", targetId],
		queryFn: () => api.get<ListingDoc>(`/api/listings/${targetId}?depth=2`),
		enabled: targetType === "listing" && Boolean(targetId),
	});
	const userTarget = useModerationUser(
		targetType === "user" ? targetId : undefined,
	);
	const shopTarget = useModerationShop(
		targetType === "shop" ? targetId : undefined,
	);
	const targetName =
		targetType === "listing"
			? listingTarget.data?.title
			: targetType === "user"
				? userTarget.data?.user.name || userTarget.data?.user.email
				: targetType === "shop"
					? shopTarget.data?.shop.name
					: undefined;
	const targetThumb =
		targetType === "listing"
			? resolveListingImageUrl(listingTarget.data?.images?.[0], "thumbnail")
			: null;

	// Sanctioned since the report came in: the resolution starts from what
	// was done, instead of being retyped.
	const resolutionDraft = (() => {
		const listing = listingTarget.data;
		if (targetType === "listing" && listing?.status === "rejected") {
			return listing.rejectionCode
				? t("moderation.draftListingRejected", {
						reason: t(`listingRejection.${listing.rejectionCode}`, {
							defaultValue: listing.rejectionCode,
						}),
					})
				: t("moderation.action_listing_reject");
		}
		if (targetType === "user" && userTarget.data?.suspension.active) {
			return t("moderation.draftUserSuspended");
		}
		if (targetType === "shop" && shopTarget.data?.suspension.active) {
			return t("moderation.draftShopSuspended");
		}
		return undefined;
	})();

	const run = (outcome: "resolved" | "dismissed", resolution?: string) => {
		decide(
			{ reportId: String(id), outcome, resolution },
			{
				onSuccess: () => {
					setDeciding(null);
					showSuccess(
						t("moderation.reportClosedTitle"),
						t("moderation.reportClosedMessage"),
					);
					if (router.canGoBack()) router.back();
				},
			},
		);
	};

	const openSheet = (outcome: "resolved" | "dismissed") => {
		resetDecision();
		setDeciding(outcome);
	};

	const reporter =
		data?.reporter && typeof data.reporter === "object"
			? (data.reporter as UserDoc)
			: null;
	const route = data ? targetRoute(data) : null;
	const closed = Boolean(data && data.status !== "pending");
	const ink = c.isDark ? Colors.dark : Colors.light;

	return (
		<ModerationScreen
			title={t("moderation.reviewReport")}
			subtitle={data ? t(`report.${data.reason}`) : undefined}
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
						<ModerationCard>
							<View style={styles.reasonRow}>
								<View
									style={[styles.reasonIcon, { backgroundColor: c.dangerSoft }]}
								>
									<Ionicons name="flag" size={18} color={k.dangerText} />
								</View>
								<Text
									accessibilityRole="header"
									style={[styles.reason, { color: c.text }]}
								>
									{t(`report.${data.reason}`)}
								</Text>
							</View>
							{/* The reporter's own words are the evidence: running-text ink,
							    full length, never clipped. */}
							<Text
								style={[
									styles.description,
									{ color: data.description ? ink.body : c.muted },
								]}
							>
								{data.description || t("moderation.noDescription")}
							</Text>
							{/* The reporter opens to their own sheet: a moderator can
							    check whether this account files reports in bad faith. */}
							<View style={styles.metaRow}>
								{reporter?.id ? (
									<Pressable
										accessibilityRole="link"
										accessibilityLabel={`${t("moderation.reportedBy", {
											name: reporter.name || reporter.email || "—",
										})}, ${t("moderation.openAccount")}`}
										hitSlop={12}
										onPress={() =>
											router.push(`/moderation/user/${reporter.id}` as never)
										}
									>
										<Text style={[styles.metaLink, { color: k.linkText }]}>
											{t("moderation.reportedBy", {
												name: reporter.name || reporter.email || "—",
											})}
										</Text>
									</Pressable>
								) : (
									<Text style={[styles.meta, { color: c.muted }]}>
										{t("moderation.reportedBy", { name: "—" })}
									</Text>
								)}
								{formatDate(data.createdAt) ? (
									<Text style={[styles.meta, { color: c.muted }]}>
										{` · ${formatDate(data.createdAt)}`}
									</Text>
								) : null}
							</View>
							{closed ? (
								<TonePill
									tone="neutral"
									label={t(`moderation.reportStatus_${data.status}`)}
								/>
							) : null}
							{closed && data.resolution ? (
								<Text style={[styles.description, { color: ink.body }]}>
									{data.resolution}
								</Text>
							) : null}
						</ModerationCard>

						{/* The target is where a sanction is taken: it reads as a link,
						    and as plain text when the app has no screen for it. */}
						<Pressable
							accessibilityRole={route ? "button" : "text"}
							accessibilityLabel={[
								t(`moderation.target_${data.targetType}`),
								targetName,
								route
									? t("moderation.openTarget")
									: t("moderation.targetNotOpenable"),
							]
								.filter(Boolean)
								.join(", ")}
							onPress={() => route && router.push(route as never)}
							disabled={!route}
							style={({ pressed }) => [
								styles.targetCard,
								{
									backgroundColor: c.card,
									borderColor: c.border,
									opacity: pressed ? 0.85 : 1,
								},
							]}
						>
							{targetThumb ? (
								<Image
									source={{ uri: targetThumb }}
									style={[styles.targetThumb, { backgroundColor: c.bg }]}
									contentFit="cover"
									transition={150}
								/>
							) : (
								<View style={[styles.targetIcon, { backgroundColor: c.bg }]}>
									<Ionicons
										name={targetIcon(data.targetType)}
										size={18}
										color={c.muted}
									/>
								</View>
							)}
							<View style={styles.flex}>
								<Text style={[styles.targetKind, { color: c.muted }]}>
									{t(`moderation.target_${data.targetType}`)}
								</Text>
								{targetName ? (
									<Text
										style={[styles.targetTitle, { color: c.text }]}
										numberOfLines={2}
									>
										{targetName}
									</Text>
								) : null}
								<Text
									style={[
										styles.targetMeta,
										{ color: route ? k.linkText : c.muted },
									]}
								>
									{route
										? t("moderation.openTarget")
										: t("moderation.targetNotOpenable")}
								</Text>
							</View>
							{route ? (
								<Ionicons name="chevron-forward" size={18} color={c.muted} />
							) : null}
						</Pressable>
					</ScrollView>

					{/* Both outcomes close the report and both go through the note
					    sheet; "dismiss" is the quieter of the two. */}
					{/* A closed report cannot be decided again (the server answers
					    409), so the bar says it is closed instead of offering it. */}
					{closed ? (
						<DecisionBar
							note={{
								text: t("moderation.reportAlreadyClosed"),
							}}
						/>
					) : (
						<DecisionBar>
							<DecisionButton
								variant="secondary"
								label={t("moderation.dismiss")}
								onPress={() => openSheet("dismissed")}
								disabled={isPending}
							/>
							<DecisionButton
								variant="primary"
								icon="checkmark-done"
								label={t("moderation.resolve")}
								onPress={() => openSheet("resolved")}
								disabled={isPending}
								grow={1.4}
							/>
						</DecisionBar>
					)}

					<DecisionSheet
						visible={deciding !== null}
						title={
							deciding === "dismissed"
								? t("moderation.dismissSheetTitle")
								: t("moderation.resolveSheetTitle")
						}
						subtitle={
							deciding === "dismissed"
								? t("moderation.dismissSheetSubtitle")
								: t("moderation.resolveSheetSubtitle")
						}
						textLabel={t("moderation.resolutionLabel")}
						textPlaceholder={t("moderation.resolutionPlaceholder")}
						textRequired={deciding === "resolved"}
						initialText={deciding === "resolved" ? resolutionDraft : undefined}
						confirmLabel={
							deciding === "dismissed"
								? t("moderation.confirmDismiss")
								: t("moderation.confirmResolve")
						}
						destructive={false}
						pending={isPending}
						error={decisionError ? resolveErrorMessage(decisionError, t) : null}
						onConfirm={({ text }) =>
							deciding && run(deciding, text || undefined)
						}
						onClose={() => setDeciding(null)}
					/>
				</>
			)}
		</ModerationScreen>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	content: { padding: 16, gap: 14, paddingBottom: 24 },
	reasonRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	reasonIcon: {
		width: 40,
		height: 40,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	reason: {
		flex: 1,
		fontSize: 18,
		lineHeight: 23,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	description: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22 },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
	metaLink: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodySemibold,
		textDecorationLine: "underline",
	},
	targetCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 64,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
	},
	targetIcon: {
		width: 40,
		height: 40,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	targetThumb: { width: 48, height: 48, borderRadius: 10 },
	targetKind: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodyMedium },
	targetTitle: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	targetMeta: { fontSize: 13, fontFamily: Fonts.bodySemibold, marginTop: 1 },
});
