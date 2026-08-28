import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
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
	return null;
}

export default function ModerateReportScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const { t } = useTranslation();
	const { centeredContent } = useResponsive();
	const { showError, showSuccess } = useAlert();
	const [deciding, setDeciding] = useState<"resolved" | "dismissed" | null>(
		null,
	);

	const { data, isLoading } = useQuery({
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
						<View
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<View style={styles.reasonRow}>
								<View
									style={[styles.reasonIcon, { backgroundColor: c.dangerSoft }]}
								>
									<Ionicons name="flag" size={16} color={c.danger} />
								</View>
								<Text style={[styles.reason, { color: c.text }]}>
									{t(`report.${data.reason}`)}
								</Text>
							</View>
							{data.description ? (
								<Text style={[styles.description, { color: c.text }]}>
									{data.description}
								</Text>
							) : (
								<Text style={[styles.description, { color: c.muted }]}>
									{t("moderation.noDescription")}
								</Text>
							)}
							<Text style={[styles.meta, { color: c.muted }]}>
								{t("moderation.reportedBy", {
									name: reporter?.name || reporter?.email || "—",
								})}
							</Text>
						</View>

						<Pressable
							onPress={() => route && router.push(route as never)}
							disabled={!route}
							style={[
								styles.card,
								styles.targetCard,
								{
									backgroundColor: c.card,
									borderColor: c.border,
									opacity: route ? 1 : 0.6,
								},
							]}
						>
							<View style={[styles.targetIcon, { backgroundColor: c.bg }]}>
								<Ionicons
									name={
										data.targetType === "user"
											? "person"
											: data.targetType === "listing"
												? "pricetag"
												: "chatbubble"
									}
									size={18}
									color={c.muted}
								/>
							</View>
							<View style={{ flex: 1 }}>
								<Text style={[styles.targetTitle, { color: c.text }]}>
									{t(`moderation.target_${data.targetType}`)}
								</Text>
								<Text style={[styles.meta, { color: c.muted }]}>
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

					<View
						style={[
							styles.actions,
							{ backgroundColor: c.card, borderTopColor: c.border },
						]}
					>
						<Pressable
							onPress={() => setDeciding("dismissed")}
							disabled={isPending}
							style={[styles.dismissBtn, { borderColor: c.border }]}
						>
							<Text style={[styles.dismissText, { color: c.text }]}>
								{t("moderation.dismiss")}
							</Text>
						</Pressable>
						<Pressable
							onPress={() => setDeciding("resolved")}
							disabled={isPending}
							style={[styles.resolveBtn, { backgroundColor: c.primary }]}
						>
							<Text style={styles.resolveText}>{t("moderation.resolve")}</Text>
						</Pressable>
					</View>

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
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 10,
	},
	reasonRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	reasonIcon: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
	},
	reason: { fontSize: 15, fontFamily: Fonts.displayBold, flex: 1 },
	description: { fontSize: 14, fontFamily: Fonts.body, lineHeight: 21 },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	targetCard: { flexDirection: "row", alignItems: "center", gap: 12 },
	targetIcon: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
	},
	targetTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	actions: {
		flexDirection: "row",
		gap: 10,
		padding: 16,
		paddingBottom: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	dismissBtn: {
		flex: 1,
		alignItems: "center",
		borderRadius: 14,
		borderWidth: 1.5,
		paddingVertical: 14,
	},
	dismissText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	resolveBtn: {
		flex: 1.4,
		alignItems: "center",
		borderRadius: 14,
		paddingVertical: 14,
	},
	resolveText: { fontSize: 15, fontFamily: Fonts.displayBold, color: "#fff" },
});
