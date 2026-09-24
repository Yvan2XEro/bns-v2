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
import { DecisionSheet } from "@/src/components/moderation/DecisionSheet";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import {
	type Translate,
	useModerationTheme,
} from "@/src/components/moderation/theme";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useModerationShop,
	useSuspendShop,
	useUnsuspendShop,
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
import type {
	ModerationLogEntry,
	ReportDoc,
	SuspensionReason,
} from "@/src/types/api";

export default function ModerateShopScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const { t } = useTranslation();
	const { user: me } = useAuth();
	const { centeredContent } = useResponsive();
	const { showError, showSuccess, showConfirm } = useAlert();
	const [suspending, setSuspending] = useState(false);

	const { data, isLoading } = useModerationShop(id);
	const { mutate: suspend, isPending: suspendPending } = useSuspendShop();
	const { mutate: unsuspend, isPending: liftPending } = useUnsuspendShop();

	const shop = data?.shop;
	const owner = data?.owner;
	const suspension = data?.suspension;
	// The rank compared is the owner's, as on the API side: a moderator cannot
	// act on a shop owned by another moderator or admin.
	const actionable = canActOn(me, owner);

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
				shopId: String(id),
				reason: choice as SuspensionReason,
				durationDays,
				note: text || undefined,
			},
			{
				onSuccess: (result) => {
					setSuspending(false);
					showSuccess(
						t("moderation.shopSuspendedTitle"),
						t("moderation.shopSuspendedMessage", {
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

	const onLift = () =>
		showConfirm(
			t("moderation.shopLiftTitle"),
			t("moderation.shopLiftMessage"),
			() =>
				unsuspend(
					{ shopId: String(id) },
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

	const statusColor = shop?.status === "active" ? c.success : c.danger;

	return (
		<ModerationScreen title={t("moderation.shopTitle")} subtitle={shop?.name}>
			{isLoading || !data || !shop || !owner || !suspension ? (
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
								<ShopAvatar
									name={shop.name}
									logo={shop.logo?.url ?? null}
									size={48}
									radius={12}
								/>
								<View style={{ flex: 1, gap: 4 }}>
									<Text style={[styles.name, { color: c.text }]}>
										{shop.name}
									</Text>
									<View style={styles.row}>
										<LevelBadge level={shop.level} size="sm" />
										<Text style={[styles.meta, { color: c.muted }]}>
											@{shop.handle}
										</Text>
										<View
											style={[
												styles.pill,
												{
													backgroundColor:
														shop.status === "active"
															? c.successSoft
															: c.dangerSoft,
												},
											]}
										>
											<Text style={[styles.pillText, { color: statusColor }]}>
												{t(`moderation.shopStatus_${shop.status}`)}
											</Text>
										</View>
									</View>
								</View>
							</View>

							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("moderation.account")}
								onPress={() =>
									router.push(`/moderation/user/${owner.id}` as never)
								}
								style={[styles.ownerRow, { borderTopColor: c.border }]}
							>
								<Ionicons
									name="person-circle-outline"
									size={22}
									color={c.muted}
								/>
								<View style={{ flex: 1 }}>
									<Text style={[styles.ownerName, { color: c.text }]}>
										{owner.name || owner.email}
									</Text>
									<Text style={[styles.meta, { color: c.muted }]}>
										{t("moderation.ownerSince", {
											date: formatDate(shop.createdAt, {
												month: "long",
												year: "numeric",
											}),
										})}
									</Text>
								</View>
								<Text style={[styles.link, { color: c.primary }]}>
									{t("moderation.account")}
								</Text>
							</Pressable>

							<View style={[styles.stats, { borderTopColor: c.border }]}>
								<Stat
									label={t("moderation.statProducts")}
									value={data.counts.activeProducts}
									c={c}
								/>
								<Stat
									label={t("moderation.statDrafts")}
									value={data.counts.draftProducts}
									c={c}
								/>
								<Stat
									label={t("moderation.statReports")}
									value={data.counts.reportsAgainst}
									c={c}
								/>
							</View>
						</View>

						{suspension.active ? (
							<View
								style={[
									styles.card,
									{ backgroundColor: c.dangerSoft, borderColor: c.danger },
								]}
							>
								<View style={styles.row}>
									<Ionicons name="ban" size={18} color={c.danger} />
									<Text style={[styles.sanctionTitle, { color: c.danger }]}>
										{suspension.indefinite
											? t("moderation.shopSuspendedIndefinitely")
											: t("moderation.suspendedUntil", {
													date: formatDate(String(suspension.until)),
												})}
									</Text>
								</View>
								{suspension.reason ? (
									<Text style={[styles.body, { color: c.text }]}>
										{t(`report.${suspension.reason}`)}
									</Text>
								) : null}
								{suspension.note ? (
									<Text style={[styles.meta, { color: c.muted }]}>
										{suspension.note}
									</Text>
								) : null}
							</View>
						) : (
							<Text style={[styles.meta, { color: c.muted }]}>
								{t("moderation.noActiveSuspension")}
							</Text>
						)}

						<View style={{ gap: 8 }}>
							<Text style={[styles.sectionLabel, { color: c.muted }]}>
								{t("moderation.reportsAgainstShop")}
							</Text>
							{data.reports.length === 0 ? (
								<Text style={[styles.meta, { color: c.muted }]}>
									{t("moderation.noReports")}
								</Text>
							) : (
								data.reports.map((report) => (
									<ReportRow key={report.id} report={report} c={c} t={t} />
								))
							)}
						</View>

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

					<View
						style={[
							styles.actions,
							{ backgroundColor: c.card, borderTopColor: c.border },
						]}
					>
						{!actionable ? (
							<Text
								style={[
									styles.meta,
									{ color: c.muted, textAlign: "center", flex: 1 },
								]}
							>
								{t("moderation.cannotActOnShop")}
							</Text>
						) : shop.status === "suspended" ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("moderation.shopLift")}
								onPress={onLift}
								disabled={liftPending}
								style={[styles.btn, { backgroundColor: c.success }]}
							>
								{liftPending ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.btnText}>{t("moderation.shopLift")}</Text>
								)}
							</Pressable>
						) : shop.status === "active" ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("moderation.shopSuspend")}
								onPress={() => setSuspending(true)}
								disabled={suspendPending}
								style={[styles.btn, { backgroundColor: c.danger }]}
							>
								<Ionicons name="ban-outline" size={18} color="#fff" />
								<Text style={styles.btnText}>
									{t("moderation.shopSuspend")}
								</Text>
							</Pressable>
						) : (
							<Text
								style={[
									styles.meta,
									{ color: c.muted, textAlign: "center", flex: 1 },
								]}
							>
								{t("moderation.shopClosedNote")}
							</Text>
						)}
					</View>

					<DecisionSheet
						visible={suspending}
						title={t("moderation.shopSuspendSheetTitle")}
						subtitle={t("moderation.shopSuspendSheetSubtitle")}
						choices={reasons}
						choicesLabel={t("moderation.suspendReasonLabel")}
						durations={durations}
						durationsLabel={t("moderation.suspendDurationLabel")}
						textLabel={t("moderation.internalNoteLabel")}
						textPlaceholder={t("moderation.internalNotePlaceholder")}
						confirmLabel={t("moderation.shopConfirmSuspend")}
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

type Palette = ReturnType<typeof useModerationTheme>;

function Stat({
	label,
	value,
	c,
}: {
	label: string;
	value: number;
	c: Palette;
}) {
	return (
		<View style={styles.stat}>
			<Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
			<Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
		</View>
	);
}

function ReportRow({
	report,
	c,
	t,
}: {
	report: ReportDoc;
	c: Palette;
	t: Translate;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t(`report.${report.reason}`)}
			onPress={() => router.push(`/moderation/report/${report.id}` as never)}
			style={[
				styles.historyRow,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<View style={{ flex: 1 }}>
				<Text style={[styles.historyAction, { color: c.text }]}>
					{t(`report.${report.reason}`)}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]}>
					{[
						report.description,
						formatDate(report.createdAt, {
							day: "numeric",
							month: "short",
							year: "numeric",
						}),
					]
						.filter(Boolean)
						.join(" · ")}
				</Text>
			</View>
			<Text
				style={[
					styles.meta,
					{ color: report.status === "pending" ? c.warning : c.muted },
				]}
			>
				{t(`moderation.reportStatus_${report.status}`)}
			</Text>
		</Pressable>
	);
}

function HistoryRow({
	entry,
	c,
	t,
}: {
	entry: ModerationLogEntry;
	c: Palette;
	t: Translate;
}) {
	const actor =
		typeof entry.actor === "object"
			? entry.actor.name || entry.actor.email
			: "—";
	const meta = entry.metadata as
		| { restoredListingIds?: unknown[]; durationDays?: number | null }
		| null
		| undefined;
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
					{[
						actor,
						formatDate(entry.createdAt),
						Array.isArray(meta?.restoredListingIds)
							? t("moderation.restoredCount", {
									count: meta.restoredListingIds.length,
								})
							: null,
					]
						.filter(Boolean)
						.join(" · ")}
				</Text>
				{entry.reason ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t(`report.${entry.reason}`, { defaultValue: entry.reason })}
					</Text>
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
	row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
	name: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
	body: { fontSize: 14, fontFamily: Fonts.body },
	pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
	pillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	ownerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 10,
		minHeight: 44,
	},
	ownerName: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	link: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	stats: {
		flexDirection: "row",
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 12,
	},
	stat: { flex: 1, alignItems: "center", gap: 2 },
	statValue: { fontSize: 18, fontFamily: Fonts.displayBold },
	statLabel: { fontSize: 11, fontFamily: Fonts.body, textAlign: "center" },
	sanctionTitle: { fontSize: 14, fontFamily: Fonts.displayBold, flex: 1 },
	sectionLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	historyRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
		minHeight: 44,
	},
	historyAction: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	actions: {
		flexDirection: "row",
		padding: 16,
		paddingBottom: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	btn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 14,
		paddingVertical: 14,
		minHeight: 44,
	},
	btnText: { fontSize: 15, fontFamily: Fonts.displayBold, color: "#fff" },
});
