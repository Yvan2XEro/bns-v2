import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

/** The variant being adjusted, its current stock, and — when relevant — the tracking-on notice. */
export function VariantSummaryCard({
	title,
	current,
	lowStockThreshold,
	tracked,
}: {
	title: string;
	current: number;
	lowStockThreshold: number | null;
	tracked: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View style={{ gap: 14 }}>
			<View>
				<Text style={[styles.product, { color: c.text }]}>{title}</Text>
				<Text style={[styles.meta, { color: c.muted }]}>
					{lowStockThreshold !== null
						? t("stock.currentWithThreshold", {
								count: current,
								threshold: lowStockThreshold,
							})
						: t("stock.current", { count: current })}
				</Text>
			</View>

			{!tracked ? (
				<View style={[styles.notice, { backgroundColor: c.warningSoft }]}>
					<Ionicons
						name="information-circle-outline"
						size={16}
						color={c.warningText}
					/>
					<Text style={[styles.noticeText, { color: c.warningText }]}>
						{t("stock.trackingNote")}
					</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	product: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	notice: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		padding: 10,
		borderRadius: 10,
	},
	noticeText: { flex: 1, fontSize: 12, fontFamily: Fonts.bodySemibold },
});
