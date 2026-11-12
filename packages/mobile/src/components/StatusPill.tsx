import { StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type Tone = "success" | "info" | "danger" | "neutral" | "warning";

const STATUS_TONES: Record<string, Tone> = {
	published: "success",
	pending: "info",
	rejected: "danger",
	sold: "neutral",
	expired: "warning",
	boosted: "warning",
	completed: "success",
	failed: "danger",
	refunded: "neutral",
};

/** Soft fill and text pairs, 4.5:1 or better in both themes. */
function toneColors(tone: Tone, isDark: boolean) {
	const c = isDark ? Colors.dark : Colors.light;
	switch (tone) {
		case "success":
			return { bg: c.successTint, text: c.successText };
		case "info":
			return { bg: c.primaryTint, text: c.link };
		case "danger":
			return { bg: c.dangerTint, text: c.dangerText };
		case "warning":
			return { bg: c.warningTint, text: c.warningText };
		default:
			return { bg: c.well, text: c.body };
	}
}

interface StatusPillProps {
	status: string;
	/** Translated label: the pill has no copy of its own. */
	label: string;
}

export function StatusPill({ status, label }: StatusPillProps) {
	const isDark = useColorScheme() === "dark";
	const colors = toneColors(STATUS_TONES[status] ?? "neutral", isDark);
	return (
		<View style={[styles.pill, { backgroundColor: colors.bg }]}>
			<Text style={[styles.text, { color: colors.text }]}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 3,
		alignSelf: "flex-start",
	},
	text: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
});
