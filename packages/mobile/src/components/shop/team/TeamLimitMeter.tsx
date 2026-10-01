import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { seatSummary } from "@/src/lib/teamForm";
import type { TeamView } from "@/src/types/api";
import { useShopTheme } from "../theme";

/**
 * Reads straight off `maxMembers`, never a hard-coded cap: the number
 * changes with the shop's verification level, and a level drop can leave
 * `activeCount` above it (`overage`) without anybody being removed — the
 * meter says so rather than silently showing "7 / 5".
 */
export function TeamLimitMeter({ team }: { team: TeamView }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { used, total, overage } = seatSummary(team);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.seats, { color: c.text }]}>
				{t("team.seats", { used, total })}
			</Text>
			{overage > 0 ? (
				<Text style={[styles.overage, { color: c.warningText }]}>
					{t("team.overage", { count: overage })}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: 1,
		padding: 14,
		marginHorizontal: 16,
		marginBottom: 12,
	},
	seats: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	overage: { fontSize: 12, fontFamily: Fonts.body, marginTop: 4 },
});
