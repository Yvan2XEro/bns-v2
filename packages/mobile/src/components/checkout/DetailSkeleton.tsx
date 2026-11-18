import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { SkeletonBlock } from "@/src/components/SkeletonCard";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

/**
 * The first load of an order-shaped detail (a purchase, a payment step, a
 * return or a dispute, a delivery choice): cards in the shape of what is
 * coming, instead of a lone spinner in the middle of the ground.
 *
 * `cards` sets how many content cards follow the summary card; the summary
 * card ends with the place the total will land.
 */
export function DetailSkeleton({ cards = 2 }: { cards?: number }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const card: StyleProp<ViewStyle> = [
		styles.card,
		{ backgroundColor: c.card, borderColor: c.border },
	];
	return (
		<View
			style={styles.wrap}
			accessible
			accessibilityRole="progressbar"
			accessibilityLabel={t("common.loading")}
		>
			<View style={card}>
				<View style={styles.row}>
					<SkeletonBlock width={56} height={56} borderRadius={12} />
					<View style={styles.lines}>
						<SkeletonBlock width="70%" height={16} />
						<SkeletonBlock width="45%" height={12} />
					</View>
				</View>
				<View style={[styles.rule, { backgroundColor: c.border }]} />
				<View style={styles.total}>
					<SkeletonBlock width={96} height={14} />
					<SkeletonBlock width={120} height={32} borderRadius={8} />
				</View>
			</View>
			{Array.from({ length: cards }, (_, index) => (
				<View key={index} style={card}>
					<SkeletonBlock width="40%" height={18} />
					<SkeletonBlock width="100%" height={12} />
					<SkeletonBlock width="85%" height={12} />
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { padding: 16, gap: 14 },
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 12,
	},
	row: { flexDirection: "row", gap: 12, alignItems: "center" },
	lines: { flex: 1, gap: 8 },
	rule: { height: StyleSheet.hairlineWidth },
	total: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
});
