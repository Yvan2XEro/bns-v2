import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	businessTypeLabelKey,
	isBusinessType,
	legalBlockLines,
} from "@/src/lib/shopLegal";
import type { ShopLegal } from "@/src/types/api";
import { useShopTheme } from "./theme";

/**
 * A shop's declared or reviewed legal identity — renders nothing below level
 * 3 or with nothing declared. `verified` is the server's own capability
 * (`PublicShop.legalVerified`), never derived here from `legal.verifiedAt`.
 */
export function LegalBlock({
	legal,
	verified,
}: {
	legal: ShopLegal | null;
	verified: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const lines = legalBlockLines(legal);
	if (lines.length === 0) return null;

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.header}>
				<Ionicons
					name={verified ? "checkmark-circle" : "document-text-outline"}
					size={18}
					color={verified ? c.successText : c.muted}
				/>
				<Text
					style={[styles.title, { color: c.text }]}
					accessibilityRole="header"
				>
					{verified
						? t("shop.legalVerifiedTitle")
						: t("shop.legalDeclaredTitle")}
				</Text>
			</View>
			{lines.map((line, index) => (
				<View
					key={line.label}
					style={[
						styles.row,
						index > 0 && {
							borderTopWidth: StyleSheet.hairlineWidth,
							borderTopColor: c.border,
						},
					]}
				>
					<Text style={[styles.label, { color: c.muted }]}>
						{t(`shop.${line.label}`)}
					</Text>
					<Text
						style={[styles.value, { color: c.text }]}
						numberOfLines={2}
						selectable
					>
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
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 6,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 6,
	},
	title: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.displayBold },
	row: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 10,
	},
	label: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
		flexShrink: 0,
	},
	value: {
		fontSize: 14,
		lineHeight: 19,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
		textAlign: "right",
	},
});
