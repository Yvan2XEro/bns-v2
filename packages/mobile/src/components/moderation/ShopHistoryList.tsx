import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import type { ModerationLogEntry, ReportDoc } from "@/src/types/api";
import { SectionTitle, TonePill } from "./ModerationKit";
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
			<View style={styles.section}>
				<SectionTitle>{t("moderation.reportsAgainstShop")}</SectionTitle>
				{reports.length === 0 ? (
					<Text style={[styles.empty, { color: c.muted }]}>
						{t("moderation.noReports")}
					</Text>
				) : (
					reports.map((report) => (
						<ReportRow key={report.id} report={report} c={c} t={t} />
					))
				)}
			</View>

			<View style={styles.section}>
				<SectionTitle>{t("moderation.historyLabel")}</SectionTitle>
				{history.length === 0 ? (
					<Text style={[styles.empty, { color: c.muted }]}>
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
	const status = t(`moderation.reportStatus_${report.status}`);
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${t(`report.${report.reason}`)}, ${status}`}
			onPress={() => router.push(`/moderation/report/${report.id}` as never)}
			style={({ pressed }) => [
				styles.row,
				{
					backgroundColor: c.card,
					borderColor: c.border,
					opacity: pressed ? 0.85 : 1,
				},
			]}
		>
			<View style={styles.flex}>
				<Text style={[styles.rowTitle, { color: c.text }]}>
					{t(`report.${report.reason}`)}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]} numberOfLines={2}>
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
			<TonePill
				tone={report.status === "pending" ? "warning" : "neutral"}
				label={status}
			/>
			<Ionicons name="chevron-forward" size={18} color={c.muted} />
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
			style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.flex}>
				<Text style={[styles.rowTitle, { color: c.text }]}>
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
					<Text style={[styles.meta, { color: c.text }]}>
						{t(`report.${entry.reason}`, { defaultValue: entry.reason })}
					</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	section: { gap: 8 },
	empty: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
		minHeight: 56,
	},
	rowTitle: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body, marginTop: 1 },
});
