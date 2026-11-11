import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { DecisionSheet } from "@/src/components/moderation/DecisionSheet";
import {
	DecisionBar,
	DecisionButton,
	DetailSkeleton,
	LoadError,
	ModerationCard,
	SectionTitle,
	TonePill,
} from "@/src/components/moderation/ModerationKit";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import {
	type ModerationPalette,
	type Translate,
	useModerationTheme,
} from "@/src/components/moderation/theme";
import { tonesOf } from "@/src/components/moderation/tones";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useModerationUser,
	useSuspendUser,
	useUnsuspendUser,
} from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import {
	availableDurations,
	canActOn,
	SUSPENSION_REASONS,
} from "@/src/lib/moderation";
import type { ModerationLogEntry, SuspensionReason } from "@/src/types/api";

export default function ModerateUserScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const { user: me } = useAuth();
	const { centeredContent } = useResponsive();
	const { showError, showSuccess, showConfirm } = useAlert();
	const [suspending, setSuspending] = useState(false);

	const { data, isLoading, isError, error, refetch } = useModerationUser(id);
	const { mutate: suspend, isPending: suspendPending } = useSuspendUser();
	const { mutate: unsuspend, isPending: liftPending } = useUnsuspendUser();

	const target = data?.user;
	const suspension = data?.suspension;
	// The server enforces this; hiding the button keeps a moderator from
	// discovering the rule through a 403.
	const actionable = canActOn(me, target);

	const durations = availableDurations(me).map((value) => ({
		value,
		label:
			value === null
				? t("moderation.durationIndefinite")
				: t("moderation.durationDays", { count: value }),
	}));

	const reasons = SUSPENSION_REASONS.map((value) => ({
		value,
		label: t(`report.${value}`),
	}));

	const onSuspend = ({
		choice,
		durationDays,
		text,
	}: {
		choice: string | null;
		durationDays: number | null;
		text: string;
	}) => {
		if (!choice) return;
		suspend(
			{
				userId: String(id),
				reason: choice as SuspensionReason,
				durationDays,
				note: text || undefined,
			},
			{
				onSuccess: (result) => {
					setSuspending(false);
					showSuccess(
						t("moderation.suspendedTitle"),
						t("moderation.suspendedMessage", {
							count: result.unpublishedListingIds.length,
						}),
					);
				},
				onError: (error) =>
					showError(
						t("moderation.actionFailed"),
						resolveErrorMessage(error, t),
					),
			},
		);
	};

	const onLift = () => {
		showConfirm(t("moderation.liftTitle"), t("moderation.liftMessage"), () =>
			unsuspend(
				{ userId: String(id) },
				{
					onSuccess: (result) =>
						showSuccess(
							t("moderation.liftedTitle"),
							t("moderation.liftedMessage", {
								count: result.restoredListingIds.length,
							}),
						),
					onError: (error) =>
						showError(
							t("moderation.actionFailed"),
							resolveErrorMessage(error, t),
						),
				},
			),
		);
	};

	return (
		<ModerationScreen
			title={t("moderation.accountTitle")}
			subtitle={target?.name || target?.email}
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
							<View style={styles.identity}>
								<View style={[styles.avatar, { backgroundColor: c.bg }]}>
									<Ionicons name="person" size={22} color={c.muted} />
								</View>
								<View style={styles.flex}>
									<Text
										accessibilityRole="header"
										style={[styles.name, { color: c.text }]}
									>
										{target?.name || target?.email}
									</Text>
									<Text style={[styles.meta, { color: c.muted }]}>
										{t("moderation.memberSince", {
											date: formatDate(String(target?.createdAt)),
										})}
									</Text>
								</View>
								{target?.role && target.role !== "user" ? (
									<TonePill
										tone="warning"
										label={t(`moderation.role_${target.role}`)}
									/>
								) : null}
							</View>

							<View style={[styles.stats, { borderTopColor: c.border }]}>
								<Stat
									label={t("moderation.statPublished")}
									value={data.counts.publishedListings}
									c={c}
								/>
								<Stat
									label={t("moderation.statPending")}
									value={data.counts.pendingListings}
									c={c}
								/>
								<Stat
									label={t("moderation.statReports")}
									value={data.counts.reportsAgainst}
									c={c}
									alert={data.counts.reportsAgainst > 0}
								/>
							</View>
						</ModerationCard>

						{suspension?.active ? (
							<View
								style={[
									styles.sanction,
									{ backgroundColor: c.dangerSoft, borderColor: k.dangerText },
								]}
							>
								<View style={styles.reasonRow}>
									<Ionicons name="ban" size={20} color={k.dangerText} />
									<Text style={[styles.sanctionTitle, { color: k.dangerText }]}>
										{suspension.indefinite
											? t("moderation.suspendedIndefinitely")
											: t("moderation.suspendedUntil", {
													date: formatDate(String(suspension.until)),
												})}
									</Text>
								</View>
								{suspension.reason ? (
									<Text style={[styles.sanctionBody, { color: c.text }]}>
										{t(`report.${suspension.reason}`)}
									</Text>
								) : null}
								{suspension.note ? (
									<Text style={[styles.meta, { color: c.text }]}>
										{suspension.note}
									</Text>
								) : null}
							</View>
						) : null}

						<View style={styles.section}>
							<SectionTitle>{t("moderation.historyLabel")}</SectionTitle>
							{data.history.length === 0 ? (
								<Text style={[styles.empty, { color: c.muted }]}>
									{t("moderation.historyEmpty")}
								</Text>
							) : (
								data.history.map((entry) => (
									<HistoryRow key={entry.id} entry={entry} c={c} t={t} />
								))
							)}
						</View>
					</ScrollView>

					{actionable ? (
						<DecisionBar>
							{suspension?.active ? (
								<DecisionButton
									variant="approve"
									icon="lock-open-outline"
									label={t("moderation.lift")}
									onPress={onLift}
									pending={liftPending}
								/>
							) : (
								// Opens the reason / duration sheet; the red fill is kept
								// for that sheet's confirm button.
								<DecisionButton
									variant="dangerOutline"
									icon="ban-outline"
									label={t("moderation.suspend")}
									onPress={() => setSuspending(true)}
									disabled={suspendPending}
								/>
							)}
						</DecisionBar>
					) : (
						<DecisionBar note={{ text: t("moderation.cannotActOnAccount") }} />
					)}

					<DecisionSheet
						visible={suspending}
						title={t("moderation.suspendSheetTitle")}
						subtitle={t("moderation.suspendSheetSubtitle")}
						choices={reasons}
						choicesLabel={t("moderation.suspendReasonLabel")}
						durations={durations}
						durationsLabel={t("moderation.suspendDurationLabel")}
						textLabel={t("moderation.internalNoteLabel")}
						textPlaceholder={t("moderation.internalNotePlaceholder")}
						confirmLabel={t("moderation.confirmSuspend")}
						destructive
						pending={suspendPending}
						onConfirm={onSuspend}
						onClose={() => setSuspending(false)}
					/>
				</>
			)}
		</ModerationScreen>
	);
}

function Stat({
	label,
	value,
	c,
	alert,
}: {
	label: string;
	value: number;
	c: ModerationPalette;
	alert?: boolean;
}) {
	const k = tonesOf(c);
	return (
		<View
			style={styles.stat}
			accessible
			accessibilityLabel={`${label}: ${value}`}
		>
			<Text
				style={[styles.statValue, { color: alert ? k.dangerText : c.text }]}
			>
				{value}
			</Text>
			<Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
		</View>
	);
}

function HistoryRow({
	entry,
	c,
	t,
}: {
	entry: ModerationLogEntry;
	c: ModerationPalette;
	t: Translate;
}) {
	const actor =
		typeof entry.actor === "object"
			? entry.actor.name || entry.actor.email
			: "—";

	return (
		<View
			style={[
				styles.historyRow,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<Text style={[styles.historyAction, { color: c.text }]}>
				{t(`moderation.action_${entry.action.replace(".", "_")}`)}
			</Text>
			<Text style={[styles.meta, { color: c.muted }]}>
				{actor} · {formatDate(entry.createdAt)}
			</Text>
			{entry.reason ? (
				<Text style={[styles.meta, { color: c.text }]}>{entry.reason}</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	content: { padding: 16, gap: 14, paddingBottom: 24 },
	identity: { flexDirection: "row", alignItems: "center", gap: 12 },
	avatar: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	name: {
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
	},
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body, marginTop: 1 },
	stats: {
		flexDirection: "row",
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 12,
		marginTop: 2,
	},
	stat: { flex: 1, alignItems: "center", gap: 2 },
	statValue: { fontSize: 22, lineHeight: 26, fontFamily: Fonts.displayBold },
	statLabel: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.body,
		textAlign: "center",
	},
	sanction: {
		borderRadius: 14,
		borderWidth: 1,
		padding: 16,
		gap: 8,
	},
	reasonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	sanctionTitle: { fontSize: 16, fontFamily: Fonts.displayBold, flex: 1 },
	sanctionBody: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	section: { gap: 8 },
	empty: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	historyRow: {
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
		gap: 2,
	},
	historyAction: { fontSize: 15, fontFamily: Fonts.bodySemibold },
});
