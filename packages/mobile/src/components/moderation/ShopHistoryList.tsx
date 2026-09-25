import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import type { ModerationLogEntry, ReportDoc } from "@/src/types/api";
import type { ModerationPalette, Translate } from "./theme";

interface ShopHistoryListProps {
	reports: ReportDoc[];
	history: ModerationLogEntry[];
	c: ModerationPalette;
	t: Translate;
}

/** Reports filed against the shop, and the moderation log for it. */
export function ShopHistoryList({
	reports,
	history,
	c,
	t,
}: ShopHistoryListProps) {
	return (
		<>
			<View style={{ gap: 8 }}>
				<Text style={[styles.sectionLabel, { color: c.muted }]}>
					{t("moderation.reportsAgainstShop")}
				</Text>
				{reports.length === 0 ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("moderation.noReports")}
					</Text>
				) : (
					reports.map((report) => (
						<ReportRow key={report.id} report={report} c={c} t={t} />
					))
				)}
			</View>

			<View style={{ gap: 8 }}>
				<Text style={[styles.sectionLabel, { color: c.muted }]}>
					{t("moderation.historyLabel")}
				</Text>
				{history.length === 0 ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("moderation.historyEmpty")}
					</Text>
				) : (
					history.map((entry) => (
						<HistoryRow key={entry.id} entry={entry} c={c} t={t} />
					))
				)}
			</View>
		</>
	);
}

function ReportRow({
	report,
	c,
	t,
}: {
	report: ReportDoc;
	c: ModerationPalette;
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
	c: ModerationPalette;
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
	sectionLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	meta: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
	historyRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
		minHeight: 44,
	},
	historyAction: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
