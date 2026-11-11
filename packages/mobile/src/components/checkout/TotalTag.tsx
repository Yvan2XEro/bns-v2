import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";

/** Signage yellow, the same in both themes; its text is always ink. */
const SUN = "#ffb81c";
const INK = "#12163a";

const SIZES = {
	md: { fontSize: 18, lineHeight: 22, paddingH: 8, paddingV: 3, radius: 7 },
	lg: { fontSize: 24, lineHeight: 28, paddingH: 10, paddingV: 4, radius: 8 },
	xl: { fontSize: 30, lineHeight: 36, paddingH: 12, paddingV: 4, radius: 10 },
} as const;

/**
 * The price tag, applied to a total: Outfit ExtraBold, ink on signage
 * yellow. One per screen, on the amount the buyer actually pays.
 */
export function TotalTag({
	amount,
	size = "lg",
	accessibilityLabel,
}: {
	amount: string;
	size?: keyof typeof SIZES;
	accessibilityLabel?: string;
}) {
	const s = SIZES[size];
	return (
		<View
			style={[
				styles.tag,
				{
					paddingHorizontal: s.paddingH,
					paddingVertical: s.paddingV,
					borderRadius: s.radius,
				},
			]}
			accessible
			accessibilityLabel={accessibilityLabel ?? amount}
		>
			<Text
				style={[
					styles.text,
					{ fontSize: s.fontSize, lineHeight: s.lineHeight },
				]}
				numberOfLines={1}
				adjustsFontSizeToFit
				minimumFontScale={0.7}
			>
				{amount}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	tag: { backgroundColor: SUN, alignSelf: "flex-start", flexShrink: 1 },
	text: {
		color: INK,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
		fontVariant: ["tabular-nums"],
	},
});
