import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
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
import { useReportDecision } from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { ReportDoc, UserDoc } from "@/src/types/api";

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
	const { showError, showSuccess } = useAlert();
	const [deciding, setDeciding] = useState<"resolved" | "dismissed" | null>(
		null,
	);

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: ["moderation", "report", id],
		queryFn: () => api.get<ReportDoc>(`/api/reports/${id}?depth=1`),
		enabled: Boolean(id),
	});

	const { mutate: decide, isPending } = useReportDecision();

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
				onError: (error) =>
					showError(
						t("moderation.actionFailed"),
						resolveErrorMessage(error, t),
					),
			},
		);
	};

	const reporter =
		data?.reporter && typeof data.reporter === "object"
			? (data.reporter as UserDoc)
			: null;
	const route = data ? targetRoute(data) : null;

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
							<Text
								style={[
									styles.description,
									{ color: data.description ? c.text : c.muted },
								]}
							>
								{data.description || t("moderation.noDescription")}
							</Text>
							<Text style={[styles.meta, { color: c.muted }]}>
								{t("moderation.reportedBy", {
									name: reporter?.name || reporter?.email || "—",
								})}
							</Text>
						</ModerationCard>

						{/* The target is where a sanction is taken: it reads as a link,
						    and as plain text when the app has no screen for it. */}
						<Pressable
							accessibilityRole={route ? "button" : "text"}
							accessibilityLabel={`${t(`moderation.target_${data.targetType}`)}, ${
								route
									? t("moderation.openTarget")
									: t("moderation.targetNotOpenable")
							}`}
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
							<View style={[styles.targetIcon, { backgroundColor: c.bg }]}>
								<Ionicons
									name={targetIcon(data.targetType)}
									size={18}
									color={c.muted}
								/>
							</View>
							<View style={styles.flex}>
								<Text style={[styles.targetTitle, { color: c.text }]}>
									{t(`moderation.target_${data.targetType}`)}
								</Text>
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
					<DecisionBar>
						<DecisionButton
							variant="secondary"
							label={t("moderation.dismiss")}
							onPress={() => setDeciding("dismissed")}
							disabled={isPending}
						/>
						<DecisionButton
							variant="primary"
							icon="checkmark-done"
							label={t("moderation.resolve")}
							onPress={() => setDeciding("resolved")}
							disabled={isPending}
							grow={1.4}
						/>
					</DecisionBar>

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
						confirmLabel={
							deciding === "dismissed"
								? t("moderation.confirmDismiss")
								: t("moderation.confirmResolve")
						}
						destructive={false}
						pending={isPending}
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
	targetTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	targetMeta: { fontSize: 13, fontFamily: Fonts.bodySemibold, marginTop: 1 },
});
