import { StyleSheet } from "react-native";
import { Fonts } from "@/constants/theme";

export const billingStyles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 6,
	},
	cardTitle: {
		fontSize: 18,
		lineHeight: 26,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.2,
	},
	body: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22 },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	amount: {
		fontSize: 24,
		lineHeight: 32,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
		fontVariant: ["tabular-nums"],
	},
	button: {
		minHeight: 52,
		borderRadius: 12,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		gap: 6,
	},
	buttonText: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
		color: "#fff",
	},
});
