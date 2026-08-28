import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
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
import {
	type Translate,
	useModerationTheme,
} from "@/src/components/moderation/theme";
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
	const { t } = useTranslation();
	const { user: me } = useAuth();
	const { centeredContent } = useResponsive();
	const { showError, showSuccess, showConfirm } = useAlert();
	const [suspending, setSuspending] = useState(false);

	const { data, isLoading } = useModerationUser(id);
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
							<View style={styles.identity}>
								<View style={[styles.avatar, { backgroundColor: c.bg }]}>
									<Ionicons name="person" size={22} color={c.muted} />
								</View>
								<View style={{ flex: 1 }}>
									<Text style={[styles.name, { color: c.text }]}>
										{target?.name || target?.email}
									</Text>
									<Text style={[styles.meta, { color: c.muted }]}>
										{t("moderation.memberSince", {
											date: formatDate(String(target?.createdAt)),
										})}
									</Text>
								</View>
								{target?.role && target.role !== "user" ? (
									<View
										style={[
											styles.rolePill,
											{ backgroundColor: c.warningSoft },
										]}
									>
										<Text style={[styles.rolePillText, { color: c.warning }]}>
											{t(`moderation.role_${target.role}`)}
										</Text>
									</View>
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
								/>
							</View>
						</View>

						{suspension?.active ? (
							<View
								style={[
									styles.card,
									{ backgroundColor: c.dangerSoft, borderColor: c.danger },
								]}
							>
								<View style={styles.reasonRow}>
									<Ionicons name="ban" size={18} color={c.danger} />
									<Text style={[styles.sanctionTitle, { color: c.danger }]}>
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
									<Text style={[styles.meta, { color: c.muted }]}>
										{suspension.note}
									</Text>
								) : null}
							</View>
						) : null}

						<View style={{ gap: 8 }}>
							<Text style={[styles.sectionLabel, { color: c.muted }]}>
								{t("moderation.historyLabel")}
							</Text>
							{data.history.length === 0 ? (
								<Text style={[styles.meta, { color: c.muted }]}>
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
						<View
							style={[
								styles.actions,
								{ backgroundColor: c.card, borderTopColor: c.border },
							]}
						>
							{suspension?.active ? (
								<Pressable
									onPress={onLift}
									disabled={liftPending}
									style={[styles.liftBtn, { backgroundColor: c.success }]}
								>
									{liftPending ? (
										<ActivityIndicator color="#fff" />
									) : (
										<Text style={styles.liftText}>{t("moderation.lift")}</Text>
									)}
								</Pressable>
							) : (
								<Pressable
									onPress={() => setSuspending(true)}
									disabled={suspendPending}
									style={[styles.suspendBtn, { backgroundColor: c.danger }]}
								>
									<Ionicons name="ban-outline" size={18} color="#fff" />
									<Text style={styles.suspendText}>
										{t("moderation.suspend")}
									</Text>
								</Pressable>
							)}
						</View>
					) : (
						<View
							style={[
								styles.actions,
								{ backgroundColor: c.card, borderTopColor: c.border },
							]}
						>
							<Text
								style={[
									styles.meta,
									{ color: c.muted, textAlign: "center", flex: 1 },
								]}
							>
								{t("moderation.cannotActOnAccount")}
							</Text>
						</View>
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
}: {
	label: string;
	value: number;
	c: ReturnType<typeof useModerationTheme>;
}) {
	return (
		<View style={styles.stat}>
			<Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
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
	c: ReturnType<typeof useModerationTheme>;
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
			<View style={{ flex: 1 }}>
				<Text style={[styles.historyAction, { color: c.text }]}>
					{t(`moderation.action_${entry.action.replace(".", "_")}`)}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]}>
					{actor} · {formatDate(entry.createdAt)}
				</Text>
				{entry.reason ? (
					<Text style={[styles.meta, { color: c.muted }]}>{entry.reason}</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 10,
	},
	identity: { flexDirection: "row", alignItems: "center", gap: 12 },
	avatar: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	name: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
	rolePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
	rolePillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	stats: {
		flexDirection: "row",
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 12,
	},
	stat: { flex: 1, alignItems: "center", gap: 2 },
	statValue: { fontSize: 18, fontFamily: Fonts.displayBold },
	statLabel: { fontSize: 11, fontFamily: Fonts.body, textAlign: "center" },
	reasonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	sanctionTitle: { fontSize: 14, fontFamily: Fonts.displayBold, flex: 1 },
	sanctionBody: { fontSize: 14, fontFamily: Fonts.body },
	sectionLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	historyRow: {
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
	},
	historyAction: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	actions: {
		flexDirection: "row",
		padding: 16,
		paddingBottom: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	suspendBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 14,
		paddingVertical: 14,
	},
	suspendText: { fontSize: 15, fontFamily: Fonts.displayBold, color: "#fff" },
	liftBtn: {
		flex: 1,
		alignItems: "center",
		borderRadius: 14,
		paddingVertical: 14,
	},
	liftText: { fontSize: 15, fontFamily: Fonts.displayBold, color: "#fff" },
});
