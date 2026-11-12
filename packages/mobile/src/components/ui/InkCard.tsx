import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";

/** The card's ground: ink, the same in both themes. */
const INK = Colors.light.foreground;

/** Text colours on the ink card, the same in both themes. Each holds
 *  4.5:1 or better on `INK` (muted 11:1, faint 7.4:1). */
export const ON_INK = {
	text: "#ffffff",
	muted: Colors.dark.body,
	faint: Colors.dark.mutedForeground,
	amber: "#ffd25a",
	green: "#8fddb0",
	rule: "#3a3f66",
} as const;

/** The dark money card the design opens payments and billing with. */
export function InkCard({ children }: { children: ReactNode }) {
	const c = useShopTheme();
	return (
		<View style={[styles.card, { borderColor: c.isDark ? c.border : INK }]}>
			{children}
		</View>
	);
}

export const inkText = StyleSheet.create({
	label: {
		color: ON_INK.muted,
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.body,
	},
	hero: {
		color: ON_INK.text,
		fontSize: 30,
		lineHeight: 36,
		fontFamily: Fonts.displayExtrabold,
	},
	value: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.displayBold },
	footnote: {
		color: ON_INK.faint,
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.body,
	},
	rule: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: ON_INK.rule,
		marginVertical: 8,
	},
});

const styles = StyleSheet.create({
	card: {
		backgroundColor: INK,
		borderRadius: 18,
		borderWidth: 1,
		padding: 16,
		gap: 6,
	},
});
