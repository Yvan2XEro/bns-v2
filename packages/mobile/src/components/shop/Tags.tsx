import { StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import type { ShopPalette } from "./theme";
import { useShopTheme } from "./theme";

/** Signage yellow, ink text: the same in both themes (DESIGN.md, price tag). */
const SUN = Colors.light.sun;
const INK = Colors.light.sunForeground;

/**
 * An amount on the seller screens, set as the app's price tag: Poppins
 * ExtraBold, ink on signage yellow. For money the shop takes in (an order
 * total, a payout); a fee or a debt stays plain text so the yellow keeps
 * meaning "a price".
 */
export function AmountTag({
	label,
	size = "md",
}: {
	/** Already formatted, e.g. `formatPrice(total, lang)`. */
	label: string;
	size?: "sm" | "md" | "lg";
}) {
	return (
		<View style={[styles.tag, size === "lg" && styles.tagLg]}>
			<Text
				style={[
					styles.tagText,
					size === "sm" && styles.tagTextSm,
					size === "lg" && styles.tagTextLg,
				]}
				numberOfLines={1}
			>
				{label}
			</Text>
		</View>
	);
}

export type StatusTone = "warning" | "info" | "success" | "danger" | "neutral";

function toneColors(c: ShopPalette, tone: StatusTone) {
	switch (tone) {
		case "warning":
			return { bg: c.warningSoft, fg: c.warningText };
		case "info":
			return { bg: c.primarySoft, fg: c.isDark ? c.text : c.link };
		case "success":
			return { bg: c.successSoft, fg: c.successText };
		case "danger":
			return { bg: c.dangerSoft, fg: c.dangerText };
		default:
			return { bg: c.neutralSoft, fg: c.neutralText };
	}
}

/**
 * A status as a soft pill, toned by what it asks of the seller: warning for
 * "waiting on you", info for "moving", success for "done", danger for
 * "went wrong". Text tones are the palette's `*Text` ones, readable in both
 * themes.
 */
export function StatusTag({
	label,
	tone,
}: {
	label: string;
	tone: StatusTone;
}) {
	const c = useShopTheme();
	const colors = toneColors(c, tone);
	return (
		<View style={[styles.pill, { backgroundColor: colors.bg }]}>
			<Text style={[styles.pillText, { color: colors.fg }]} numberOfLines={1}>
				{label}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	tag: {
		alignSelf: "flex-start",
		backgroundColor: SUN,
		borderRadius: 7,
		paddingHorizontal: 8,
		paddingTop: 2,
		paddingBottom: 3,
	},
	tagLg: {
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingTop: 4,
		paddingBottom: 6,
	},
	tagText: {
		color: INK,
		fontFamily: Fonts.displayExtrabold,
		fontSize: 15,
		lineHeight: 19,
		letterSpacing: -0.2,
	},
	tagTextSm: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 17 },
	tagTextLg: {
		fontFamily: Fonts.displayBold,
		fontSize: 24,
		lineHeight: 32,
		letterSpacing: -0.6,
	},
	pill: {
		alignSelf: "flex-start",
		borderRadius: 999,
		paddingHorizontal: 9,
		paddingVertical: 3,
		flexShrink: 1,
	},
	pillText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
});
