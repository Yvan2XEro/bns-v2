import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import type { PaymentChannel } from "@/src/lib/paymentStatus";

/**
 * Each operator's own colours, so the choice reads at a glance. Both carry
 * ink: white on Orange's orange is under 3:1.
 */
const MARKS: Record<PaymentChannel, { label: string; bg: string; fg: string }> =
	{
		"cm.mtn": { label: "MTN", bg: "#ffcc00", fg: "#12163a" },
		"cm.orange": { label: "OM", bg: "#ff7900", fg: "#12163a" },
	};

export function OperatorMark({
	channel,
	size = 40,
}: {
	channel: PaymentChannel;
	size?: number;
}) {
	const mark = MARKS[channel];
	return (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={[
				styles.mark,
				{
					width: size,
					height: size,
					borderRadius: size / 4,
					backgroundColor: mark.bg,
				},
			]}
		>
			<Text style={[styles.text, { color: mark.fg, fontSize: size * 0.3 }]}>
				{mark.label}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	mark: { alignItems: "center", justifyContent: "center" },
	text: { fontFamily: Fonts.displayExtrabold },
});
