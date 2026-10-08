import { Ionicons } from "@expo/vector-icons";
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
import {
	type DecisionChoice,
	type DecisionDuration,
	DecisionSheet,
} from "@/src/components/moderation/DecisionSheet";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { useRiskFlag, useRiskFlagDecision } from "@/src/hooks/useModeration";
import { useTranslation } from "@/src/lib/i18n";
import {
	riskDismissalDecision,
	riskSanctionDecision,
} from "@/src/lib/moderationRisk";

function textField(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export default function RiskFlagScreen() {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const params = useLocalSearchParams<{ id: string }>();
	const flagId = Array.isArray(params.id) ? params.id[0] : params.id;
	const detail = useRiskFlag(flagId);
	const decision = useRiskFlagDecision();
	const [dismissVisible, setDismissVisible] = useState(false);
	const [sanctionType, setSanctionType] = useState<
		"suspend_user" | "suspend_shop" | "hold_payouts" | null
	>(null);

	if (detail.isLoading || !detail.data) {
		return (
			<ModerationScreen title={t("moderation.riskDetailTitle")}>
				{detail.isError ? (
					<View style={styles.errorState}>
						<Text style={[styles.message, { color: c.muted }]}>
							{t("moderation.riskDetailFailed")}
						</Text>
						<Pressable
							accessibilityRole="button"
							onPress={() => void detail.refetch()}
							style={[styles.retryButton, { backgroundColor: c.primary }]}
						>
							<Text style={styles.actionLabel}>{t("common.retry")}</Text>
						</Pressable>
					</View>
				) : (
					<ActivityIndicator color={c.primary} style={styles.loading} />
				)}
			</ModerationScreen>
		);
	}

	const { flag, subject, evidenceRows, relatedFlags, moderationHistory } =
		detail.data;
	const subjectName = textField(subject.name) ?? textField(subject.label);
	const dismissChoices: DecisionChoice[] = [
		{ value: "false_positive", label: t("moderation.riskFalsePositive") },
	];
	const durations: DecisionDuration[] = [
		{ value: 7, label: t("moderation.riskSevenDays") },
		{ value: 30, label: t("moderation.riskThirtyDays") },
	];
	const targetId = textField(subject.id);
	const resolveDismissal = (note: string) => {
		const payload = riskDismissalDecision(note);
		if (!payload || !flagId) return;
		decision.mutate(
			{ id: flagId, ...payload },
			{ onSuccess: () => setDismissVisible(false) },
		);
	};
	const resolveSanction = (durationDays: number | null, note: string) => {
		if (!sanctionType || !targetId || !flagId) return;
		const payload = riskSanctionDecision(
			sanctionType,
			targetId,
			durationDays,
			note,
		);
		if (!payload) return;
		decision.mutate(
			{ id: flagId, ...payload },
			{ onSuccess: () => setSanctionType(null) },
		);
	};

	return (
		<ModerationScreen
			title={t("moderation.riskDetailTitle")}
			subtitle={`${t(
				flag.severity === "high"
					? "moderation.riskHigh"
					: flag.severity === "medium"
						? "moderation.riskMedium"
						: "moderation.riskLow",
			)} · ${flag.score}`}
		>
			<ScrollView contentContainerStyle={styles.content}>
				{decision.isError ? (
					<Text style={[styles.error, { color: c.danger }]}>
						{t("moderation.actionFailed")}
					</Text>
				) : null}
				<View
					style={[
						styles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Text style={[styles.sectionTitle, { color: c.text }]}>
						{t("moderation.riskSubject")}
					</Text>
					<Text style={[styles.primaryText, { color: c.text }]}>
						{subjectName ?? flag.subjectLabel ?? flag.subjectType}
					</Text>
					<Text style={[styles.secondaryText, { color: c.muted }]}>
						{flag.subjectType}
					</Text>
				</View>

				<View
					style={[
						styles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Text style={[styles.sectionTitle, { color: c.text }]}>
						{t("moderation.riskSignal")}
					</Text>
					<Text style={[styles.primaryText, { color: c.text }]}>
						{flag.signal.replaceAll(".", " · ").replaceAll("_", " ")}
					</Text>
					<Text style={[styles.secondaryText, { color: c.muted }]}>
						{t("moderation.riskOccurrences", { count: flag.occurrences ?? 1 })}
						{" · "}
						{t("moderation.riskLastSeen", {
							date: new Date(flag.lastSeenAt).toLocaleString(),
						})}
					</Text>
				</View>

				<View
					style={[
						styles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Text style={[styles.sectionTitle, { color: c.text }]}>
						{t("moderation.riskEvidence")}
					</Text>
					{evidenceRows.length === 0 ? (
						<Text style={[styles.secondaryText, { color: c.muted }]}>
							{t("moderation.riskNoEvidence")}
						</Text>
					) : (
						evidenceRows.map((row) => (
							<View key={row.label} style={styles.evidenceRow}>
								<Text style={[styles.secondaryText, { color: c.muted }]}>
									{row.label}
								</Text>
								<Text style={[styles.primaryText, { color: c.text }]}>
									{row.value === null ? "-" : String(row.value)}
								</Text>
							</View>
						))
					)}
				</View>

				{relatedFlags.length > 0 ? (
					<View
						style={[
							styles.card,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Text style={[styles.sectionTitle, { color: c.text }]}>
							{t("moderation.riskRelated")}
						</Text>
						{relatedFlags.map((related) => (
							<Pressable
								key={related.id}
								accessibilityRole="button"
								onPress={() => router.push(`/moderation/risk/${related.id}`)}
								style={styles.relatedRow}
							>
								<Text style={[styles.primaryText, { color: c.text }]}>
									{related.subjectLabel ?? related.subjectType}
									{" · "}
									{related.signal.replaceAll(".", " · ").replaceAll("_", " ")}
								</Text>
								<Ionicons name="chevron-forward" size={18} color={c.muted} />
							</Pressable>
						))}
					</View>
				) : null}

				{moderationHistory.length > 0 ? (
					<View
						style={[
							styles.card,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Text style={[styles.sectionTitle, { color: c.text }]}>
							{t("moderation.riskHistory")}
						</Text>
						{moderationHistory.map((entry) => (
							<Text
								key={entry.id}
								style={[styles.secondaryText, { color: c.muted }]}
							>
								{entry.action} ·{" "}
								{new Date(entry.createdAt).toLocaleDateString()}
							</Text>
						))}
					</View>
				) : null}

				{flag.status === "open" || flag.status === "reviewed" ? (
					<View style={styles.actions}>
						{flag.status === "open" ? (
							<Pressable
								accessibilityRole="button"
								disabled={decision.isPending}
								onPress={() =>
									flag.status === "open" && flagId
										? decision.mutate({
												id: flagId,
												outcome: "reviewed",
												resolution: "none",
											})
										: undefined
								}
								style={[styles.actionButton, { backgroundColor: c.primary }]}
							>
								<Text style={styles.actionLabel}>
									{t("moderation.riskMarkReviewed")}
								</Text>
							</Pressable>
						) : null}
						<Pressable
							accessibilityRole="button"
							disabled={decision.isPending}
							onPress={() => setDismissVisible(true)}
							style={[styles.actionButton, { backgroundColor: c.danger }]}
						>
							<Text style={styles.actionLabel}>
								{t("moderation.riskDismiss")}
							</Text>
						</Pressable>
						{targetId && subject.type === "user" ? (
							<Pressable
								accessibilityRole="button"
								disabled={decision.isPending}
								onPress={() => setSanctionType("suspend_user")}
								style={[styles.actionButton, { backgroundColor: c.danger }]}
							>
								<Text style={styles.actionLabel}>
									{t("moderation.riskSuspendUser")}
								</Text>
							</Pressable>
						) : null}
						{targetId && subject.type === "shop" ? (
							<>
								<Pressable
									accessibilityRole="button"
									disabled={decision.isPending}
									onPress={() => setSanctionType("suspend_shop")}
									style={[styles.actionButton, { backgroundColor: c.danger }]}
								>
									<Text style={styles.actionLabel}>
										{t("moderation.riskSuspendShop")}
									</Text>
								</Pressable>
								<Pressable
									accessibilityRole="button"
									disabled={decision.isPending}
									onPress={() => setSanctionType("hold_payouts")}
									style={[styles.actionButton, { backgroundColor: c.primary }]}
								>
									<Text style={styles.actionLabel}>
										{t("moderation.riskHoldPayouts")}
									</Text>
								</Pressable>
							</>
						) : null}
					</View>
				) : null}
			</ScrollView>
			<DecisionSheet
				visible={dismissVisible}
				title={t("moderation.riskDismissTitle")}
				choices={dismissChoices}
				choicesLabel={t("moderation.riskResolution")}
				textLabel={t("moderation.riskDecisionNote")}
				textRequired
				confirmLabel={t("moderation.riskDismiss")}
				destructive
				pending={decision.isPending}
				onConfirm={({ text }) => resolveDismissal(text)}
				onClose={() => setDismissVisible(false)}
			/>
			<DecisionSheet
				visible={sanctionType !== null}
				title={t(
					sanctionType === "hold_payouts"
						? "moderation.riskHoldPayouts"
						: sanctionType === "suspend_shop"
							? "moderation.riskSuspendShop"
							: "moderation.riskSuspendUser",
				)}
				durations={durations}
				durationsLabel={t("moderation.riskDuration")}
				textLabel={t("moderation.riskDecisionNote")}
				textRequired
				confirmLabel={t("moderation.riskActionConfirm")}
				destructive
				pending={decision.isPending}
				onConfirm={({ durationDays, text }) =>
					resolveSanction(durationDays, text)
				}
				onClose={() => setSanctionType(null)}
			/>
		</ModerationScreen>
	);
}

const styles = StyleSheet.create({
	content: { gap: 12, padding: 16, paddingBottom: 32 },
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 8,
	},
	sectionTitle: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
	},
	primaryText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	secondaryText: { fontSize: 12, fontFamily: Fonts.body },
	evidenceRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 12,
	},
	relatedRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 44,
	},
	actions: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
		marginTop: 4,
	},
	actionButton: {
		flex: 1,
		minWidth: "45%",
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 12,
	},
	actionLabel: { color: "#fff", fontFamily: Fonts.bodySemibold },
	loading: { marginTop: 40 },
	message: { margin: 24, textAlign: "center" },
	error: { padding: 12, borderRadius: 8 },
	errorState: { alignItems: "center", padding: 24, gap: 8 },
	retryButton: {
		minHeight: 44,
		minWidth: 120,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 12,
		paddingHorizontal: 16,
	},
});
