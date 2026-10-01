import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import type { ModerationShopTeamMember, ShopActivityView } from "@/src/types/api";
import { StyleSheet, Text, View } from "react-native";
import type { ModerationPalette, Translate } from "./theme";

interface ShopTeamCardProps {
	team: ModerationShopTeamMember[];
	activity: ShopActivityView[];
	c: ModerationPalette;
	t: Translate;
}

/**
 * The moderator's Team section (Task 32): the shop's active members with
 * their role and join date, plus its last 20 activity entries, newest first.
 * The API already strips `metadata` on `variant.cost_changed` for this
 * reader — a moderator has no business reading a shop's margins — so this
 * component never reaches into an entry's `metadata` itself.
 */
export function ShopTeamCard({ team, activity, c, t }: ShopTeamCardProps) {
	return (
		<>
			<View style={{ gap: 8 }}>
				<Text style={[styles.sectionLabel, { color: c.muted }]}>
					{t("moderation.teamSectionTitle")}
				</Text>
				{team.length === 0 ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("moderation.teamEmpty")}
					</Text>
				) : (
					team.map((member) => (
						<TeamMemberRow key={member.id} member={member} c={c} t={t} />
					))
				)}
			</View>

			<View style={{ gap: 8 }}>
				<Text style={[styles.sectionLabel, { color: c.muted }]}>
					{t("moderation.teamActivitySectionTitle")}
				</Text>
				{activity.length === 0 ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("moderation.teamActivityEmpty")}
					</Text>
				) : (
					activity.map((entry) => (
						<ActivityRow key={entry.id} entry={entry} c={c} t={t} />
					))
				)}
			</View>
		</>
	);
}

function TeamMemberRow({
	member,
	c,
	t,
}: {
	member: ModerationShopTeamMember;
	c: ModerationPalette;
	t: Translate;
}) {
	const joined = formatDate(member.joinedAt, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
	return (
		<View
			style={[
				styles.historyRow,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<View style={{ flex: 1 }}>
				<Text style={[styles.historyAction, { color: c.text }]}>
					{member.name ?? "—"}
				</Text>
				{joined ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("moderation.teamJoinedOn", { date: joined })}
					</Text>
				) : null}
			</View>
			<View
				style={[styles.roleChip, { backgroundColor: c.bg, borderColor: c.border }]}
			>
				<Text style={[styles.roleChipText, { color: c.text }]}>
					{t(`moderation.teamRole_${member.role}`)}
				</Text>
			</View>
		</View>
	);
}

function ActivityRow({
	entry,
	c,
	t,
}: {
	entry: ShopActivityView;
	c: ModerationPalette;
	t: Translate;
}) {
	const actorName = entry.actor?.name ?? null;
	return (
		<View
			style={[
				styles.historyRow,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<View style={{ flex: 1 }}>
				<Text style={[styles.historyAction, { color: c.text }]}>
					{t(`moderation.teamActivityAction_${entry.action.replace(".", "_")}`)}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]}>
					{[actorName, formatDate(entry.createdAt)].filter(Boolean).join(" · ")}
				</Text>
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
		gap: 8,
	},
	historyAction: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	roleChip: {
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	roleChipText: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
	},
});
