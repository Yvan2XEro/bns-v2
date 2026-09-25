import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { StockChip } from "@/src/components/shop/StockChip";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { formatXaf, formatXafRange } from "@/src/lib/variants";
import type { CatalogueRow } from "@/src/types/api";

export function CatalogueRowItem({
	row,
	onPress,
	onStep,
	stepping,
	disabled,
}: {
	row: CatalogueRow;
	onPress: () => void;
	onStep?: (delta: 1 | -1) => void;
	stepping?: boolean;
	disabled?: boolean;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const uri = resolveImageUrl(
		row.image?.thumbnailURL ?? row.image?.url ?? null,
	);
	const price =
		row.priceMin === null
			? "—"
			: row.variantCount > 1 &&
					row.priceMax !== null &&
					row.priceMax !== row.priceMin
				? t("catalogue.fromPrice", {
						price: formatXaf(row.priceMin, i18n.language),
					})
				: formatXaf(row.priceMin, i18n.language);
	const subtitle =
		row.variantCount > 1
			? t("catalogue.variantsPrice", { count: row.variantCount, price })
			: price;
	const quickStep =
		Boolean(onStep) && row.variantCount === 1 && row.trackInventory;

	return (
		<Pressable
			onPress={onPress}
			style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
			accessibilityRole="button"
			accessibilityLabel={row.title}
		>
			{uri ? (
				<Image source={{ uri }} style={styles.thumb} contentFit="cover" />
			) : (
				<View
					style={[
						styles.thumb,
						styles.thumbEmpty,
						{ backgroundColor: c.neutralSoft },
					]}
				>
					<Ionicons name="image-outline" size={20} color={c.muted} />
				</View>
			)}
			<View style={{ flex: 1, gap: 4 }}>
				<Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
					{row.title}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
					{subtitle}
				</Text>
				<View style={styles.chips}>
					{row.status === "active" ? (
						<StockChip
							available={row.available}
							trackInventory={row.trackInventory}
							lowStock={row.lowStock}
							outOfStock={row.outOfStock}
						/>
					) : (
						<View style={[styles.status, { backgroundColor: c.neutralSoft }]}>
							<Text style={[styles.statusText, { color: c.neutralText }]}>
								{t(`catalogue.status_${row.status}`)}
							</Text>
						</View>
					)}
					{row.priceMax !== null &&
					row.priceMin !== null &&
					row.variantCount > 1 ? (
						<Text style={[styles.meta, { color: c.muted }]}>
							{formatXafRange(row.priceMin, row.priceMax, i18n.language)}
						</Text>
					) : null}
				</View>
			</View>
			{quickStep ? (
				<View style={[styles.stepper, { borderColor: c.border }]}>
					<Pressable
						disabled={disabled || stepping || row.stockOnHand <= 0}
						onPress={() => onStep?.(-1)}
						hitSlop={9}
						style={styles.stepBtn}
						accessibilityRole="button"
						accessibilityLabel={t("catalogue.decreaseStockFor", {
							title: row.title,
						})}
					>
						<Ionicons
							name="remove"
							size={16}
							color={row.stockOnHand <= 0 ? c.muted : c.text}
						/>
					</Pressable>
					{stepping ? (
						<ActivityIndicator size="small" color={c.primary} />
					) : (
						<Text style={[styles.stepValue, { color: c.text }]}>
							{row.stockOnHand}
						</Text>
					)}
					<Pressable
						disabled={disabled || stepping}
						onPress={() => onStep?.(1)}
						hitSlop={9}
						style={styles.stepBtn}
						accessibilityRole="button"
						accessibilityLabel={t("catalogue.increaseStockFor", {
							title: row.title,
						})}
					>
						<Ionicons name="add" size={16} color={c.text} />
					</Pressable>
				</View>
			) : (
				<Ionicons name="chevron-forward" size={16} color={c.muted} />
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
	},
	thumb: { width: 56, height: 56, borderRadius: 10 },
	thumbEmpty: { alignItems: "center", justifyContent: "center" },
	title: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	chips: { flexDirection: "row", alignItems: "center", gap: 8 },
	status: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
	statusText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	stepper: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 4,
		height: 34,
	},
	stepBtn: {
		width: 26,
		height: 26,
		alignItems: "center",
		justifyContent: "center",
	},
	stepValue: {
		minWidth: 22,
		textAlign: "center",
		fontSize: 14,
		fontFamily: Fonts.bodyBold,
	},
});
