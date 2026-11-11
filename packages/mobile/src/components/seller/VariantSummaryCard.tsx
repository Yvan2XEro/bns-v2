import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

/** The variant being adjusted, its current stock, and — when relevant — the tracking-on notice. */
export function VariantSummaryCard({
	title,
	current,
	reserved = 0,
	lowStockThreshold,
	tracked,
}: {
	title: string;
	current: number;
	/** Units orders hold: the stock cannot go below them. */
	reserved?: number;
	lowStockThreshold?: number | null;
	tracked: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const low = lowStockThreshold != null && current <= lowStockThreshold;

	return (
		<View style={styles.stack}>
			{/* A card on the screen's ground, not the ground itself: before, it
			    took `bg` and read as loose text above the picker. */}
			<View
				style={[
					styles.card,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<View style={[styles.tile, { backgroundColor: c.primarySoft }]}>
					<Ionicons name="cube-outline" size={20} color={c.link} />
				</View>
				<View style={styles.main}>
					<Text
						style={[styles.product, { color: c.text }]}
						numberOfLines={2}
						accessibilityRole="header"
					>
						{title}
					</Text>
					{/* Low stock says so with an icon too, not by colour alone. */}
					<View style={styles.metaRow}>
						{low ? (
							<Ionicons
								name="alert-circle"
								size={14}
								color={c.warningText}
								importantForAccessibility="no"
							/>
						) : null}
						<Text
							style={[
								styles.meta,
								styles.metaMain,
								{ color: low ? c.warningText : c.body },
							]}
						>
							{lowStockThreshold != null
								? t("stock.currentWithThreshold", {
										count: current,
										threshold: lowStockThreshold,
									})
								: t("stock.current", { count: current })}
						</Text>
					</View>
					{reserved > 0 ? (
						<Text style={[styles.meta, { color: c.muted }]}>
							{t("stock.reservedLine", {
								reserved,
								available: Math.max(0, current - reserved),
							})}
						</Text>
					) : null}
				</View>
			</View>

			{!tracked ? (
				<View
					style={[styles.notice, { backgroundColor: c.warningSoft }]}
					accessible
				>
					<Ionicons
						name="information-circle-outline"
						size={18}
						color={c.warningText}
						style={styles.noticeIcon}
						importantForAccessibility="no"
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
	stack: { gap: 10 },
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 14,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	tile: {
		width: 44,
		height: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	main: { flex: 1, minWidth: 0, gap: 4 },
	product: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.displayBold },
	metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
	meta: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
		fontVariant: ["tabular-nums"],
	},
	metaMain: { flexShrink: 1, fontFamily: Fonts.bodySemibold },
	notice: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 12,
	},
	noticeIcon: { marginTop: 1 },
	noticeText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodyMedium,
	},
});
