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
import { formatPrice, formatPriceRange } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
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
	const uri = resolveListingImageUrl(row.image, "thumbnail");
	const price =
		row.priceMin === null
			? "—"
			: row.variantCount > 1 &&
					row.priceMax !== null &&
					row.priceMax !== row.priceMin
				? t("catalogue.fromPrice", {
						price: formatPrice(row.priceMin, i18n.language),
					})
				: formatPrice(row.priceMin, i18n.language);
	// A variant product says its range once, in the subtitle: "3 variantes ·
	// 5 000 – 9 000". The chip row used to repeat it.
	const range =
		row.variantCount > 1 &&
		row.priceMin !== null &&
		row.priceMax !== null &&
		row.priceMax !== row.priceMin
			? formatPriceRange(row.priceMin, row.priceMax, i18n.language)
			: null;
	const subtitle =
		row.variantCount > 1
			? t("catalogue.variantsPrice", {
					count: row.variantCount,
					price: range ?? price,
				})
			: price;
	const quickStep =
		Boolean(onStep) && row.variantCount === 1 && row.trackInventory;
	const canDecrease = !disabled && !stepping && row.stockOnHand > 0;
	const canIncrease = !disabled && !stepping;
	// The row is one button for a screen reader, so it carries what a sighted
	// seller reads on it — price, stock or status — and the stepper becomes two
	// actions on it, which the nested buttons were not reachable as.
	const statusText =
		row.status === "active"
			? row.trackInventory
				? t("product.unitsInStock", { count: row.available })
				: null
			: t(`catalogue.status_${row.status}`);
	const a11yLabel = [row.title, subtitle, statusText]
		.filter(Boolean)
		.join(", ");
	const a11yActions = quickStep
		? [
				...(canIncrease
					? [
							{
								name: "increment",
								label: t("catalogue.increaseStockFor", { title: row.title }),
							},
						]
					: []),
				...(canDecrease
					? [
							{
								name: "decrement",
								label: t("catalogue.decreaseStockFor", { title: row.title }),
							},
						]
					: []),
			]
		: undefined;

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.row,
				{
					backgroundColor: pressed ? c.primarySoft : c.card,
					borderColor: c.border,
				},
			]}
			accessibilityRole="button"
			accessibilityLabel={a11yLabel}
			accessibilityActions={a11yActions}
			onAccessibilityAction={(event) => {
				if (event.nativeEvent.actionName === "increment" && canIncrease) {
					onStep?.(1);
				} else if (
					event.nativeEvent.actionName === "decrement" &&
					canDecrease
				) {
					onStep?.(-1);
				}
			}}
		>
			{uri ? (
				<Image
					source={{ uri }}
					style={styles.thumb}
					contentFit="cover"
					accessibilityIgnoresInvertColors
				/>
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
				<Text style={[styles.price, { color: c.text }]} numberOfLines={1}>
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
				</View>
			</View>
			{quickStep ? (
				<View
					style={[styles.stepper, { borderColor: c.border }]}
					// Reached through the row's actions; separate stops would be
					// hidden inside the row's own button anyway.
					importantForAccessibility="no-hide-descendants"
					accessibilityElementsHidden
				>
					<Pressable
						disabled={!canDecrease}
						onPress={() => onStep?.(-1)}
						hitSlop={4}
						style={styles.stepBtn}
						accessibilityRole="button"
						accessibilityLabel={t("catalogue.decreaseStockFor", {
							title: row.title,
						})}
					>
						<Ionicons
							name="remove"
							size={18}
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
						disabled={!canIncrease}
						onPress={() => onStep?.(1)}
						hitSlop={4}
						style={styles.stepBtn}
						accessibilityRole="button"
						accessibilityLabel={t("catalogue.increaseStockFor", {
							title: row.title,
						})}
					>
						<Ionicons name="add" size={18} color={c.text} />
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
	title: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	// The amount is what a seller scans the catalogue for: display face, ink.
	price: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
	chips: { flexDirection: "row", alignItems: "center", gap: 8 },
	status: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
	statusText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
	// 40pt buttons plus a 4pt slop make a 48pt target each: outdoors a near
	// miss must not step the wrong way or open the product instead.
	stepper: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		borderWidth: 1,
		borderRadius: 12,
		height: 44,
	},
	stepBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	stepValue: {
		minWidth: 22,
		textAlign: "center",
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
});
