import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import type { TeamMemberView } from "@/src/types/api";
import { useShopTheme } from "../theme";

const ROLE_KEY: Record<TeamMemberView["role"], string> = {
	owner: "team.roleOwner",
	manager: "team.roleManager",
	staff: "team.roleStaff",
};

/** One roster row. A press opens the member's detail screen. */
export function MemberRow({
	member,
	onPress,
}: {
	member: TeamMemberView;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const joined = formatDate(
		member.joinedAt,
		{ day: "numeric", month: "short", year: "numeric" },
		i18n.language?.startsWith("en") ? "en-GB" : "fr-FR",
	);
	const name = member.name ?? t("team.noName");

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={t("team.memberRowLabel", {
				name,
				role: t(ROLE_KEY[member.role]),
			})}
			style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<ShopAvatar name={name} logo={member.avatarUrl} size={40} radius={20} />
			<View style={styles.body}>
				<View style={styles.nameLine}>
					<Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
						{name}
					</Text>
					{member.suspended ? (
						<View style={[styles.chip, { backgroundColor: c.dangerSoft }]}>
							<Text style={[styles.chipText, { color: c.dangerText }]}>
								{t("team.suspended")}
							</Text>
						</View>
					) : null}
				</View>
				<Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
					{t(ROLE_KEY[member.role])}
					{joined ? ` · ${t("team.joined", { date: joined })}` : ""}
				</Text>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 44,
		padding: 12,
		borderRadius: 14,
		borderWidth: 1,
	},
	body: { flex: 1, gap: 2 },
	nameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
	name: { fontSize: 15, fontFamily: Fonts.bodySemibold, flexShrink: 1 },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	chip: {
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 2,
	},
	chipText: { fontSize: 10, fontFamily: Fonts.bodySemibold },
});
