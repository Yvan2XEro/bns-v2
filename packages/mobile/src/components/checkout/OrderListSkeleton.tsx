import { StyleSheet, View } from "react-native";
import { SkeletonRow } from "@/src/components/SkeletonCard";
import { useTranslation } from "@/src/lib/i18n";

/**
 * The first load of an order-shaped list (purchases, returns, disputes):
 * rows in the shape of what is coming, instead of a lone spinner.
 */
export function OrderListSkeleton({ rows = 5 }: { rows?: number }) {
	const { t } = useTranslation();
	return (
		<View
			style={styles.list}
			accessible
			accessibilityRole="progressbar"
			accessibilityLabel={t("common.loading")}
		>
			{Array.from({ length: rows }, (_, index) => (
				<View key={index} style={styles.row}>
					<SkeletonRow />
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	list: { padding: 16, gap: 10 },
	row: { borderRadius: 16, overflow: "hidden" },
});
