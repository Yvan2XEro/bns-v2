import { StyleSheet, View } from "react-native";
import { SkeletonRow } from "@/src/components/SkeletonCard";
import { useTranslation } from "@/src/lib/i18n";

/**
 * The first load of a seller list (orders, payouts, invoices, purchase
 * orders): rows in the shape of what is coming instead of a lone spinner,
 * so the screen keeps its layout when the data lands.
 */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
	const { t } = useTranslation();
	return (
		<View
			style={styles.list}
			accessible
			accessibilityRole="progressbar"
			accessibilityLabel={t("common.loading")}
		>
			{Array.from({ length: rows }, (_, index) => (
				<SkeletonRow key={index} />
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
});
