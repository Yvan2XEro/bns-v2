import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import {
	type DecisionChoice,
	type DecisionDuration,
	DecisionSheet,
} from "@/src/components/moderation/DecisionSheet";
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
import { tonesOf } from "@/src/components/moderation/tones";
import { useAlert } from "@/src/contexts/AlertContext";
import { useRiskFlag, useRiskFlagDecision } from "@/src/hooks/useModeration";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import {
	riskDismissalDecision,
	riskSanctionDecision,
} from "@/src/lib/moderationRisk";

function textField(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function readableSignal(signal: string): string {
	return signal.replaceAll(".", " · ").replaceAll("_", " ");
}

/** The moderation sheet a sanction would be taken from, when the app has one. */
function subjectRoute(type: unknown, id: string | null): string | null {
	if (!id) return null;
	if (type === "user") return `/moderation/user/${id}`;
	if (type === "shop") return `/moderation/shop/${id}`;
	return null;
}

export default function RiskFlagScreen() {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const { showSuccess } = useAlert();
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
					<LoadError
						title={t("moderation.riskDetailFailed")}
						onRetry={() => void detail.refetch()}
					/>
				) : (
					<DetailSkeleton />
				)}
			</ModerationScreen>
		);
	}

	const { flag, subject, evidenceRows, relatedFlags, moderationHistory } =
		detail.data;
	const subjectName = textField(subject.name) ?? textField(subject.label);
	const severity = t(
		flag.severity === "high"
			? "moderation.riskHigh"
			: flag.severity === "medium"
				? "moderation.riskMedium"
				: "moderation.riskLow",
	);
	const severityTone =
		flag.severity === "high"
			? "negative"
			: flag.severity === "medium"
				? "warning"
				: "neutral";
	const dismissChoices: DecisionChoice[] = [
		{ value: "false_positive", label: t("moderation.riskFalsePositive") },
	];
	const durations: DecisionDuration[] = [
		{ value: 7, label: t("moderation.riskSevenDays") },
		{ value: 30, label: t("moderation.riskThirtyDays") },
	];
	const targetId = textField(subject.id);
	const targetRoute = subjectRoute(subject.type, targetId);
	const subjectTitle = subjectName ?? flag.subjectLabel ?? flag.subjectType;
	const decidable = flag.status === "open" || flag.status === "reviewed";
	// Every outcome is confirmed with a toast; the query refresh alone
	// would leave the moderator guessing whether the tap landed.
	const done = () => showSuccess(t("moderation.riskDecisionSaved"));
	const resolveDismissal = (note: string) => {
		const payload = riskDismissalDecision(note);
		if (!payload || !flagId) return;
		decision.mutate(
			{ id: flagId, ...payload },
			{
				onSuccess: () => {
					setDismissVisible(false);
					done();
				},
			},
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
			{
				onSuccess: () => {
					setSanctionType(null);
					done();
				},
			},
		);
	};
	const markReviewed = () => {
		if (flag.status !== "open" || !flagId) return;
		decision.mutate(
			{ id: flagId, outcome: "reviewed", resolution: "none" },
			{ onSuccess: done },
		);
	};
	const evidenceValue = (value: string | number | boolean | null) =>
		value === null
			? null
			: typeof value === "boolean"
				? t(value ? "moderation.verifCommonYes" : "moderation.verifCommonNo")
				: String(value);

	return (
		<ModerationScreen
			title={t("moderation.riskDetailTitle")}
			subtitle={`${severity} · ${flag.score}`}
		>
			<ScreenColumn width="reading">
				<ScrollView contentContainerStyle={styles.content}>
					{decision.isError ? (
						<InlineNotice
							text={`${t("moderation.actionFailed")} ${resolveErrorMessage(decision.error, t)}`}
						/>
					) : null}

					<ModerationCard
						title={t("moderation.riskSubject")}
						right={<TonePill tone={severityTone} label={severity} />}
					>
						<Text style={[styles.primaryText, { color: c.text }]}>
							{subjectTitle}
						</Text>
						<Text style={[styles.secondaryText, { color: c.muted }]}>
							{t(`moderation.target_${flag.subjectType}`, {
								defaultValue: flag.subjectType,
							})}
						</Text>
						{/* A sanction is weighed against the whole account or shop,
						    not the one signal: its sheet is one tap away. */}
						{targetRoute ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={`${subjectTitle}, ${t("moderation.openTarget")}`}
								onPress={() => router.push(targetRoute as never)}
								style={({ pressed }) => [
									styles.relatedRow,
									styles.divided,
									{ borderTopColor: c.border, opacity: pressed ? 0.7 : 1 },
								]}
							>
								<Text style={[styles.relatedText, { color: k.linkText }]}>
									{t("moderation.openTarget")}
								</Text>
								<Ionicons name="chevron-forward" size={18} color={c.muted} />
							</Pressable>
						) : null}
					</ModerationCard>

					<ModerationCard title={t("moderation.riskSignal")}>
						<View style={styles.signalRow}>
							<View
								style={[
									styles.score,
									{
										backgroundColor:
											flag.severity === "high"
												? c.dangerSoft
												: flag.severity === "medium"
													? c.warningSoft
													: k.selectedSoft,
									},
								]}
							>
								<Text
									style={[
										styles.scoreText,
										{
											color:
												flag.severity === "high"
													? k.dangerText
													: flag.severity === "medium"
														? k.warningText
														: k.linkText,
										},
									]}
								>
									{flag.score}
								</Text>
							</View>
							<Text
								style={[styles.primaryText, styles.flex, { color: c.text }]}
							>
								{readableSignal(flag.signal)}
							</Text>
						</View>
						<Text style={[styles.secondaryText, { color: c.muted }]}>
							{t("moderation.riskOccurrences", {
								count: flag.occurrences ?? 1,
							})}
							{" · "}
							{t("moderation.riskLastSeen", {
								date: formatDate(flag.lastSeenAt, {
									day: "numeric",
									month: "short",
									year: "numeric",
									hour: "2-digit",
									minute: "2-digit",
								}),
							})}
						</Text>
					</ModerationCard>

					<ModerationCard title={t("moderation.riskEvidence")}>
						{evidenceRows.length === 0 ? (
							<Text style={[styles.secondaryText, { color: c.muted }]}>
								{t("moderation.riskNoEvidence")}
							</Text>
						) : (
							evidenceRows.map((row) => (
								<FactRow
									key={row.label}
									label={row.label}
									value={evidenceValue(row.value)}
								/>
							))
						)}
					</ModerationCard>

					{relatedFlags.length > 0 ? (
						<ModerationCard title={t("moderation.riskRelated")}>
							{relatedFlags.map((related, index) => {
								const label = `${related.subjectLabel ?? related.subjectType} · ${readableSignal(related.signal)}`;
								return (
									<Pressable
										key={related.id}
										accessibilityRole="button"
										accessibilityLabel={label}
										onPress={() =>
											router.push(`/moderation/risk/${related.id}`)
										}
										style={({ pressed }) => [
											styles.relatedRow,
											index > 0 && styles.divided,
											{ borderTopColor: c.border, opacity: pressed ? 0.7 : 1 },
										]}
									>
										<Text style={[styles.relatedText, { color: k.linkText }]}>
											{label}
										</Text>
										<Ionicons
											name="chevron-forward"
											size={18}
											color={c.muted}
										/>
									</Pressable>
								);
							})}
						</ModerationCard>
					) : null}

					{moderationHistory.length > 0 ? (
						<ModerationCard title={t("moderation.riskHistory")}>
							{moderationHistory.map((entry) => (
								<Text
									key={entry.id}
									style={[styles.secondaryText, { color: c.text }]}
								>
									{t(`moderation.action_${entry.action.replace(".", "_")}`, {
										defaultValue: entry.action,
									})}{" "}
									· {formatDate(entry.createdAt)}
								</Text>
							))}
						</ModerationCard>
					) : null}
				</ScrollView>
			</ScreenColumn>

			{/* Closing the flag (dismiss, mark reviewed) and sanctioning the
			    subject are different kinds of decision: the first two are calm
			    indigo / outline, every sanction is a red outline that opens its
			    own sheet. Nothing here acts on one tap except "mark reviewed",
			    which changes no one's standing. */}
			{decidable ? (
				<DecisionBar wrap>
					<DecisionButton
						variant="secondary"
						label={t("moderation.riskDismiss")}
						onPress={() => setDismissVisible(true)}
						disabled={decision.isPending}
					/>
					{flag.status === "open" ? (
						<DecisionButton
							variant="primary"
							icon="checkmark"
							label={t("moderation.riskMarkReviewed")}
							pending={
								decision.isPending && !dismissVisible && sanctionType === null
							}
							disabled={decision.isPending}
							onPress={markReviewed}
						/>
					) : null}
					{targetId && subject.type === "user" ? (
						<DecisionButton
							variant="dangerOutline"
							icon="ban-outline"
							label={t("moderation.riskSuspendUser")}
							onPress={() => setSanctionType("suspend_user")}
							disabled={decision.isPending}
							style={styles.fullRow}
						/>
					) : null}
					{targetId && subject.type === "shop" ? (
						<>
							<DecisionButton
								variant="dangerOutline"
								icon="ban-outline"
								label={t("moderation.riskSuspendShop")}
								onPress={() => setSanctionType("suspend_shop")}
								disabled={decision.isPending}
							/>
							<DecisionButton
								variant="dangerOutline"
								icon="pause-circle-outline"
								label={t("moderation.riskHoldPayouts")}
								onPress={() => setSanctionType("hold_payouts")}
								disabled={decision.isPending}
							/>
						</>
					) : null}
				</DecisionBar>
			) : (
				// Dismissed or actioned: say so, so an empty bar is not read as
				// a screen that failed to load its actions.
				<DecisionBar
					note={{
						text: t("moderation.riskAlreadyClosed"),
					}}
				/>
			)}

			<DecisionSheet
				visible={dismissVisible}
				title={t("moderation.riskDismissTitle")}
				subtitle={subjectTitle}
				choices={dismissChoices}
				choicesLabel={t("moderation.riskResolution")}
				textLabel={t("moderation.riskDecisionNote")}
				textRequired
				confirmLabel={t("moderation.riskDismiss")}
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
				// Names who the sanction falls on, right above the red confirm.
				subtitle={subjectTitle}
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
	flex: { flex: 1 },
	content: { gap: 14, padding: 16, paddingBottom: 32 },
	primaryText: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.bodySemibold },
	secondaryText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	signalRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	score: {
		width: 48,
		height: 48,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	scoreText: { fontSize: 18, fontFamily: Fonts.displayExtrabold },
	relatedRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		minHeight: 48,
		paddingVertical: 6,
	},
	divided: { borderTopWidth: StyleSheet.hairlineWidth },
	relatedText: {
		flex: 1,
		fontSize: 14,
		lineHeight: 20,
		fontFamily: Fonts.bodySemibold,
	},
	fullRow: { flexBasis: "100%" },
});
