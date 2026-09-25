import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "./theme";

export function StockChip({
	available,
	trackInventory,
	lowStock,
	outOfStock,
}: {
	available: number;
	trackInventory: boolean;
	lowStock: boolean;
	outOfStock: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	const [bg, fg, label] = !trackInventory
		? [c.neutralSoft, c.neutralText, t("stock.notTracked")]
		: outOfStock
			? [c.dangerSoft, c.dangerText, t("stock.outOfStock")]
			: lowStock
				? [
						c.warningSoft,
						c.warningText,
						t("stock.lowCount", { count: available }),
					]
				: [
						c.successSoft,
						c.successText,
						t("stock.inStockCount", { count: available }),
					];

	return (
		<View style={[styles.chip, { backgroundColor: bg }]}>
			<Text style={[styles.text, { color: fg }]}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	chip: {
		alignSelf: "flex-start",
		borderRadius: 999,
		paddingHorizontal: 9,
		paddingVertical: 3,
	},
	text: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
