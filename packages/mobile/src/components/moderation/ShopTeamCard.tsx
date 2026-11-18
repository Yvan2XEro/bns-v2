import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import type {
	ModerationShopTeamMember,
	ShopActivityView,
} from "@/src/types/api";
import { SectionTitle } from "./ModerationKit";
import type { ModerationPalette, Translate } from "./theme";
import { tonesOf } from "./tones";

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
			<View style={styles.section}>
				<SectionTitle>{t("moderation.teamSectionTitle")}</SectionTitle>
				{team.length === 0 ? (
					<Text style={[styles.empty, { color: c.muted }]}>
						{t("moderation.teamEmpty")}
					</Text>
				) : (
					<View
						style={[
							styles.group,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						{team.map((member, index) => (
							<TeamMemberRow
								key={member.id}
								member={member}
								first={index === 0}
								c={c}
								t={t}
							/>
						))}
					</View>
				)}
			</View>

			<View style={styles.section}>
				<SectionTitle>{t("moderation.teamActivitySectionTitle")}</SectionTitle>
				{activity.length === 0 ? (
					<Text style={[styles.empty, { color: c.muted }]}>
						{t("moderation.teamActivityEmpty")}
					</Text>
				) : (
					<View
						style={[
							styles.group,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						{activity.map((entry, index) => (
							<ActivityRow
								key={entry.id}
								entry={entry}
								first={index === 0}
								c={c}
								t={t}
							/>
						))}
					</View>
				)}
			</View>
		</>
	);
}

function TeamMemberRow({
	member,
	first,
	c,
	t,
}: {
	member: ModerationShopTeamMember;
	first: boolean;
	c: ModerationPalette;
	t: Translate;
}) {
	const k = tonesOf(c);
	const joined = formatDate(member.joinedAt, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
	return (
		<View
			style={[
				styles.row,
				!first && styles.divided,
				{ borderTopColor: c.border },
			]}
		>
			<View style={styles.flex}>
				<Text style={[styles.rowTitle, { color: c.text }]}>
					{member.name ?? "—"}
				</Text>
				{joined ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("moderation.teamJoinedOn", { date: joined })}
					</Text>
				) : null}
			</View>
			<View style={[styles.roleChip, { backgroundColor: k.selectedSoft }]}>
				<Text style={[styles.roleChipText, { color: c.text }]}>
					{t(`moderation.teamRole_${member.role}`)}
				</Text>
			</View>
		</View>
	);
}

function ActivityRow({
	entry,
	first,
	c,
	t,
}: {
	entry: ShopActivityView;
	first: boolean;
	c: ModerationPalette;
	t: Translate;
}) {
	const actorName = entry.actor?.name ?? null;
	return (
		<View
			style={[
				styles.row,
				!first && styles.divided,
				{ borderTopColor: c.border },
			]}
		>
			<View style={styles.flex}>
				<Text style={[styles.rowTitle, { color: c.text }]}>
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
	flex: { flex: 1 },
	section: { gap: 8 },
	empty: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	group: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 14,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 56,
		paddingVertical: 10,
	},
	divided: { borderTopWidth: StyleSheet.hairlineWidth },
	rowTitle: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body, marginTop: 1 },
	roleChip: {
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	roleChipText: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
	},
});
