import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { HUB_HEADER_BG } from "@/src/components/shop/SellerHubHeader";
import { useShopTheme } from "@/src/components/shop/theme";

/** Text colours on the ink card, the same in both themes. */
export const ON_INK = {
	text: "#ffffff",
	muted: "#94a3b8",
	faint: "#64748b",
	amber: "#fcd34d",
	green: "#86efac",
	rule: "#334155",
} as const;

/** The dark money card the design opens payments and billing with. */
export function InkCard({ children }: { children: ReactNode }) {
	const c = useShopTheme();
	return (
		<View
			style={[
				styles.card,
				{ borderColor: c.isDark ? c.border : HUB_HEADER_BG },
			]}
		>
			{children}
		</View>
	);
}

export const inkText = StyleSheet.create({
	label: { color: ON_INK.muted, fontSize: 12, fontFamily: Fonts.body },
	hero: {
		color: ON_INK.text,
		fontSize: 32,
		fontFamily: Fonts.displayExtrabold,
	},
	value: { fontSize: 17, fontFamily: Fonts.displayBold },
	footnote: { color: ON_INK.faint, fontSize: 11, fontFamily: Fonts.body },
	rule: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: ON_INK.rule,
		marginVertical: 8,
	},
});

const styles = StyleSheet.create({
	card: {
		backgroundColor: HUB_HEADER_BG,
		borderRadius: 18,
		borderWidth: 1,
		padding: 16,
		gap: 6,
	},
});
