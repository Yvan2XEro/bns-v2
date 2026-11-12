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
	LoadError,
	ModerationCard,
	TonePill,
} from "@/src/components/moderation/ModerationKit";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import {
	riskEvidenceLabel,
	riskSignalLabel,
} from "@/src/components/moderation/riskLabels";
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

type Sanction = "suspend_user" | "suspend_shop" | "hold_payouts";

const SANCTION_LABEL: Record<Sanction, string> = {
	suspend_user: "moderation.riskSuspendUser",
	suspend_shop: "moderation.riskSuspendShop",
	hold_payouts: "moderation.riskHoldPayouts",
};

const SANCTION_EFFECT: Record<Sanction, string> = {
	suspend_user: "moderation.riskEffectSuspendUser",
	suspend_shop: "moderation.riskEffectSuspendShop",
	hold_payouts: "moderation.riskEffectHoldPayouts",
};

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
	const [closeVisible, setCloseVisible] = useState(false);
	const [sanctionVisible, setSanctionVisible] = useState(false);

	if (detail.isLoading || !detail.data) {
		return (
			<ModerationScreen title={t("moderation.riskDetailTitle")}>
				{detail.isError ? (
					<LoadError
						title={t("moderation.riskDetailFailed")}
						message={resolveErrorMessage(detail.error, t)}
						error={detail.error}
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
	// Closing an open flag is one of two things; a flag already reviewed can
	// only be closed as a false positive, which needs no choice at all.
	const closeChoices: DecisionChoice[] | undefined =
		flag.status === "open"
			? [
					{ value: "reviewed", label: t("moderation.riskCloseReviewed") },
					{
						value: "false_positive",
						label: t("moderation.riskFalsePositive"),
					},
				]
			: undefined;
	const durations: DecisionDuration[] = [
		{ value: 7, label: t("moderation.riskSevenDays") },
		{ value: 30, label: t("moderation.riskThirtyDays") },
	];
	const targetId = textField(subject.id);
	const baseRoute = subjectRoute(subject.type, targetId);
	// A payout signal opens the shop sheet on its payments section.
	const targetRoute =
		baseRoute && subject.type === "shop" && flag.signal.includes("payout")
			? `${baseRoute}?section=payments`
			: baseRoute;
	const subjectTitle = subjectName ?? flag.subjectLabel ?? flag.subjectType;
	const decidable = flag.status === "open" || flag.status === "reviewed";
	const sanctions: Sanction[] =
		targetId && subject.type === "user"
			? ["suspend_user"]
			: targetId && subject.type === "shop"
				? ["suspend_shop", "hold_payouts"]
				: [];
	const sanctionChoices: DecisionChoice[] | undefined =
		sanctions.length > 1
			? sanctions.map((value) => ({
					value,
					label: `${t(SANCTION_LABEL[value])} — ${t(SANCTION_EFFECT[value])}`,
				}))
			: undefined;
	const decisionErrorText = decision.isError
		? resolveErrorMessage(decision.error, t)
		: null;
	// Every outcome is confirmed with a toast, then the moderator goes back
	// to the Risques queue, as after a listing or a report.
	const done = () => {
		setCloseVisible(false);
		setSanctionVisible(false);
		showSuccess(t("moderation.riskDecisionSaved"));
		if (router.canGoBack()) router.back();
	};
	const resolveClose = (choice: string | null, note: string) => {
		if (!flagId) return;
		if (choice === "reviewed") {
			decision.mutate(
				{
					id: flagId,
					outcome: "reviewed",
					resolution: "none",
					...(note ? { note } : {}),
				},
				{ onSuccess: done },
			);
			return;
		}
		const payload = riskDismissalDecision(note);
		if (!payload) return;
		decision.mutate({ id: flagId, ...payload }, { onSuccess: done });
	};
	const resolveSanction = (
		choice: string | null,
		durationDays: number | null,
		note: string,
	) => {
		const type =
			sanctions.length === 1
				? sanctions[0]
				: sanctions.find((value) => value === choice);
		if (!type || !targetId || !flagId) return;
		const payload = riskSanctionDecision(type, targetId, durationDays, note);
		if (!payload) return;
		decision.mutate({ id: flagId, ...payload }, { onSuccess: done });
	};
	const openSheet = (which: "close" | "sanction") => {
		decision.reset();
		if (which === "close") setCloseVisible(true);
		else setSanctionVisible(true);
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
			subtitle={`${severity} · ${t("moderation.riskScore", { score: flag.score })}`}
		>
			<ScreenColumn width="reading">
				<ScrollView contentContainerStyle={styles.content}>
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
								accessible
								accessibilityLabel={t("moderation.riskScore", {
									score: flag.score,
								})}
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
								<Text style={[styles.scoreScale, { color: c.muted }]}>
									/100
								</Text>
							</View>
							<Text
								style={[styles.primaryText, styles.flex, { color: c.text }]}
							>
								{riskSignalLabel(flag.signal, t)}
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
									label={riskEvidenceLabel(row.label, t)}
									value={evidenceValue(row.value)}
								/>
							))
						)}
					</ModerationCard>

					{relatedFlags.length > 0 ? (
						<ModerationCard title={t("moderation.riskRelated")}>
							{relatedFlags.map((related, index) => {
								const label = `${related.subjectLabel ?? related.subjectType} · ${riskSignalLabel(related.signal, t)}`;
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

			{/* Two kinds of decision, two buttons: close the flag (calm
			    outline), or sanction the subject (red outline). Each opens its
			    sheet, which lists the outcomes and what each one does. */}
			{decidable ? (
				<DecisionBar>
					<DecisionButton
						variant="secondary"
						icon="archive-outline"
						label={t("moderation.riskClose")}
						onPress={() => openSheet("close")}
						disabled={decision.isPending}
					/>
					{sanctions.length > 0 ? (
						<DecisionButton
							variant="dangerOutline"
							icon="ban-outline"
							label={t("moderation.riskSanction")}
							onPress={() => openSheet("sanction")}
							disabled={decision.isPending}
						/>
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
				visible={closeVisible}
				title={t("moderation.riskDismissTitle")}
				subtitle={subjectTitle}
				choices={closeChoices}
				choicesLabel={t("moderation.riskResolution")}
				textLabel={
					closeChoices
						? t("moderation.riskDecisionNote")
						: t("moderation.riskFalsePositiveNote")
				}
				// A false positive needs its reason; "reviewed" does not.
				textRequired={!closeChoices}
				textRequiredFor={(choice) => choice === "false_positive"}
				confirmLabel={t("moderation.riskDismiss")}
				pending={decision.isPending}
				error={closeVisible ? decisionErrorText : null}
				onConfirm={({ choice, text }) => resolveClose(choice, text)}
				onClose={() => setCloseVisible(false)}
			/>
			<DecisionSheet
				visible={sanctionVisible}
				title={
					sanctions.length === 1
						? t(SANCTION_LABEL[sanctions[0]])
						: t("moderation.riskSanction")
				}
				// Names who the sanction falls on, right above the red confirm.
				subtitle={
					sanctions.length === 1
						? `${subjectTitle} · ${t(SANCTION_EFFECT[sanctions[0]])}`
						: subjectTitle
				}
				choices={sanctionChoices}
				choicesLabel={t("moderation.riskSanctionLabel")}
				durations={durations}
				durationsLabel={t("moderation.riskDuration")}
				textLabel={t("moderation.riskDecisionNote")}
				textRequired
				confirmLabel={t("moderation.riskActionConfirm")}
				destructive
				pending={decision.isPending}
				error={sanctionVisible ? decisionErrorText : null}
				onConfirm={({ choice, durationDays, text }) =>
					resolveSanction(choice, durationDays, text)
				}
				onClose={() => setSanctionVisible(false)}
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
	scoreText: {
		fontSize: 18,
		lineHeight: 21,
		fontFamily: Fonts.displayExtrabold,
	},
	scoreScale: { fontSize: 12, lineHeight: 14, fontFamily: Fonts.bodyMedium },
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
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
});
