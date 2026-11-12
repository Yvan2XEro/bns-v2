import { StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useModerationTheme } from "./theme";

/**
 * The heading over one group of an ops queue (courier dispatch, rider
 * runs): the group's name and how many rows sit under it. Read as one
 * header, "To pick up, 3", so the count is never announced on its own.
 */
export function OpsGroupHeader({
	title,
	count,
}: {
	title: string;
	count: number;
}) {
	const c = useModerationTheme();
	const well = c.isDark ? Colors.dark.card : Colors.light.well;
	return (
		<View
			accessible
			accessibilityRole="header"
			accessibilityLabel={`${title}, ${count}`}
			style={styles.row}
		>
			<Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
				{title}
			</Text>
			<View style={[styles.count, { backgroundColor: well }]}>
				<Text style={[styles.countText, { color: c.text }]}>{count}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginTop: 12,
	},
	title: {
		flexShrink: 1,
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
	},
	count: {
		minWidth: 26,
		height: 26,
		borderRadius: 13,
		paddingHorizontal: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	countText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.displayBold },
});
