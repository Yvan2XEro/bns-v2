import { StyleSheet } from "react-native";
import { Fonts } from "@/constants/theme";

/**
 * Text and field styles for the case forms (return inspection, refund
 * proof, evidence): every `Text` carries a family, so Android never falls
 * back to Roboto, and every field and option clears 48pt.
 */
export const caseForm = StyleSheet.create({
	heading: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 26 },
	subheading: { fontFamily: Fonts.bodySemibold, fontSize: 15, lineHeight: 21 },
	label: { fontFamily: Fonts.bodySemibold, fontSize: 15, lineHeight: 22 },
	body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	meta: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19 },
	error: { fontFamily: Fonts.bodySemibold, fontSize: 13, lineHeight: 19 },
	buttonText: { fontFamily: Fonts.bodyBold, fontSize: 16, lineHeight: 22 },
	input: { fontFamily: Fonts.body, fontSize: 16 },
});
