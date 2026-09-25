import { StyleSheet } from "react-native";
import { Fonts } from "@/constants/theme";

/** Shared between the phone and code steps, so both fields line up. */
export const fieldStyles = StyleSheet.create({
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold, marginTop: 8 },
	input: {
		height: 50,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		fontSize: 16,
		fontFamily: Fonts.body,
	},
	code: { letterSpacing: 12, fontSize: 22, textAlign: "center" },
	hint: { fontSize: 12, fontFamily: Fonts.body },
	links: { flexDirection: "row", justifyContent: "space-between" },
	linkHit: { minHeight: 44, justifyContent: "center" },
	link: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
