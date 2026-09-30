import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	businessTypeLabelKey,
	isBusinessType,
	legalBlockLines,
	legalIsVerified,
} from "@/src/lib/shopLegal";
import type { ShopLegal } from "@/src/types/api";
import { useShopTheme } from "./theme";

/** A shop's declared or reviewed legal identity — renders nothing below level 3 or with nothing declared. */
export function LegalBlock({ legal }: { legal: ShopLegal | null }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const lines = legalBlockLines(legal);
	if (lines.length === 0) return null;
	const verified = legalIsVerified(legal);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.header}>
				<Ionicons
					name={verified ? "checkmark-circle" : "document-text-outline"}
					size={16}
					color={verified ? c.successText : c.muted}
				/>
				<Text style={[styles.title, { color: c.text }]}>
					{verified
						? t("shop.legalVerifiedTitle")
						: t("shop.legalDeclaredTitle")}
				</Text>
			</View>
			{lines.map((line) => (
				<View key={line.label} style={styles.row}>
					<Text style={[styles.label, { color: c.muted }]}>
						{t(`shop.${line.label}`)}
					</Text>
					<Text style={[styles.value, { color: c.text }]} numberOfLines={1}>
						{line.label === "businessType" && isBusinessType(line.value)
							? t(`shop.${businessTypeLabelKey(line.value)}`)
							: line.value}
					</Text>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 10,
	},
	header: { flexDirection: "row", alignItems: "center", gap: 8 },
	title: { fontSize: 15, fontFamily: Fonts.displayBold },
	row: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 12,
	},
	label: { fontSize: 13, fontFamily: Fonts.body, flexShrink: 0 },
	value: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
		textAlign: "right",
	},
});
