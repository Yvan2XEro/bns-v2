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
	lowStockThreshold?: number | null;
	tracked: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const low = lowStockThreshold != null && current <= lowStockThreshold;

	return (
		<View style={{ gap: 14 }}>
			<View style={[styles.card, { backgroundColor: c.bg }]}>
				<View style={[styles.tile, { backgroundColor: c.primarySoft }]}>
					<Ionicons name="cube-outline" size={20} color={c.primary} />
				</View>
				<View style={styles.main}>
					<Text style={[styles.product, { color: c.text }]} numberOfLines={2}>
						{title}
					</Text>
					<Text style={[styles.meta, { color: low ? c.warningText : c.muted }]}>
						{lowStockThreshold != null
							? t("stock.currentWithThreshold", {
									count: current,
									threshold: lowStockThreshold,
								})
							: t("stock.current", { count: current })}
					</Text>
				</View>
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
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 12,
		borderRadius: 14,
	},
	tile: {
		width: 44,
		height: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	main: { flex: 1, minWidth: 0, gap: 2 },
	product: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	notice: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		padding: 10,
		borderRadius: 10,
	},
	noticeText: { flex: 1, fontSize: 12, fontFamily: Fonts.bodySemibold },
});
