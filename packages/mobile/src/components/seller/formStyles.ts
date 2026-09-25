import { StyleSheet } from "react-native";
import { Fonts } from "@/constants/theme";

export const formStyles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 10,
	},
	sectionTitle: { fontSize: 16, fontFamily: Fonts.displayBold },
	labelRow: { flexDirection: "row", justifyContent: "space-between" },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	counter: { fontSize: 12, fontFamily: Fonts.body },
	hint: { fontSize: 12, fontFamily: Fonts.body },
	input: {
		minHeight: 46,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 12,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	multiline: { minHeight: 110, paddingTop: 12, textAlignVertical: "top" },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		borderRadius: 999,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 8,
		minHeight: 44,
		justifyContent: "center",
	},
	chipText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	row: { flexDirection: "row", alignItems: "center", gap: 10 },
	error: { fontSize: 12, fontFamily: Fonts.body, color: "#dc2626" },
});
