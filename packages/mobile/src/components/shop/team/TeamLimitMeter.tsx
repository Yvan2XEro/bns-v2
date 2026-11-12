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
			<View
				style={[styles.track, { backgroundColor: c.neutralSoft }]}
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
			>
				<View
					style={[
						styles.fill,
						{
							width: `${total > 0 ? Math.min(100, (used / total) * 100) : 0}%`,
							backgroundColor: overage > 0 ? c.warningText : c.primary,
						},
					]}
				/>
			</View>
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
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 10,
	},
	seats: {
		fontSize: 18,
		lineHeight: 24,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
	track: { height: 6, borderRadius: 3, overflow: "hidden" },
	fill: { height: "100%", borderRadius: 3 },
	overage: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
});
