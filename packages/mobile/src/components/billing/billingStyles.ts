import { StyleSheet } from "react-native";
import { Fonts } from "@/constants/theme";

export const billingStyles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 6,
	},
	cardTitle: { fontSize: 15, fontFamily: Fonts.displayBold },
	body: { fontSize: 14, fontFamily: Fonts.body, lineHeight: 20 },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	amount: { fontSize: 22, fontFamily: Fonts.displayBold },
	button: {
		minHeight: 44,
		borderRadius: 12,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		gap: 6,
	},
	buttonText: { fontSize: 14, fontFamily: Fonts.displayBold, color: "#fff" },
});
