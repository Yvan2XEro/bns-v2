import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { useGroupedColors } from "./Grouped";

/**
 * The bar over an account sub-page: back on the left, the title centred,
 * an optional action on the right (a word fits: the sides share the bar). The back button removes itself in a
 * tablet's detail pane; the title stays centred either way.
 */
export function SettingsHeader({
	title,
	fallback = "/(tabs)/account",
	right,
}: {
	title: string;
	fallback?: Href;
	right?: ReactNode;
}) {
	const c = useGroupedColors();
	return (
		<View
			style={[
				styles.bar,
				{ backgroundColor: c.background, borderBottomColor: c.border },
			]}
		>
			<View style={styles.side}>
				<HeaderBackButton color={c.foreground} fallback={fallback} />
			</View>
			<Text
				accessibilityRole="header"
				numberOfLines={1}
				style={[styles.title, { color: c.foreground }]}
			>
				{title}
			</Text>
			<View style={[styles.side, styles.right]}>{right}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: 56,
		paddingHorizontal: 4,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	// Both sides take the same share of the bar, so the title stays centred
	// whatever sits beside it, and a worded action ("Enregistrer") gets the
	// room it needs instead of breaking over three lines in a fixed 56dp.
	side: {
		flex: 1,
		flexBasis: 0,
		minWidth: 56,
		alignItems: "flex-start",
		justifyContent: "center",
	},
	right: { alignItems: "flex-end", paddingRight: 12 },
	title: {
		flexShrink: 1,
		textAlign: "center",
		fontFamily: Fonts.displayBold,
		fontSize: 18,
		lineHeight: 26,
		letterSpacing: -0.2,
	},
});
