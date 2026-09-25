import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { parseAmount, type VariantRow } from "@/src/lib/productForm";
import {
	formatPercent,
	formatXaf,
	marginPercent,
	type ProductOption,
	variantLabel,
} from "@/src/lib/variants";
import { formStyles as f } from "./formStyles";

/** One variant's SKU, price, cost, stock and threshold — a single card row. */
export function VariantRowCard({
	row,
	options,
	readOnly,
	canManageCost,
	onChange,
}: {
	row: VariantRow;
	options: ProductOption[];
	readOnly?: boolean;
	canManageCost: boolean;
	onChange: (patch: Partial<VariantRow>) => void;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const inputStyle = [
		f.input,
		styles.small,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];
	const margin = canManageCost
		? marginPercent(parseAmount(row.price), parseAmount(row.cost))
		: null;
	const label =
		variantLabel(row.optionValues, options) || t("product.defaultVariant");

	return (
		<View style={[styles.variant, { borderTopColor: c.border }]}>
			<View style={f.row}>
				<Text style={[f.label, { color: c.text, flex: 1 }]}>{label}</Text>
				{margin !== null ? (
					<Text style={[f.hint, { color: c.successText }]}>
						{t("product.margin", {
							value: formatPercent(margin, i18n.language),
						})}
					</Text>
				) : null}
			</View>
			<TextInput
				value={row.sku}
				editable={!readOnly}
				onChangeText={(sku) => onChange({ sku })}
				autoCapitalize="characters"
				placeholder={t("product.skuPlaceholder")}
				placeholderTextColor={c.muted}
				style={inputStyle}
				accessibilityLabel={t("product.skuPlaceholder")}
			/>
			<View style={styles.grid}>
				<Cell label={t("product.price")}>
					<TextInput
						value={row.price}
						editable={!readOnly}
						onChangeText={(v) => onChange({ price: v.replace(/\D/g, "") })}
						keyboardType="number-pad"
						style={inputStyle}
						accessibilityLabel={t("product.price")}
					/>
				</Cell>
				{canManageCost ? (
					<Cell label={t("product.cost")}>
						<TextInput
							value={row.cost}
							editable={!readOnly}
							onChangeText={(v) => onChange({ cost: v.replace(/\D/g, "") })}
							keyboardType="number-pad"
							style={inputStyle}
							accessibilityLabel={t("product.cost")}
						/>
					</Cell>
				) : null}
				<Cell label={row.id ? t("product.stock") : t("product.initialStock")}>
					{row.id ? (
						<Pressable
							disabled={readOnly}
							onPress={() =>
								router.push({
									pathname: "/seller/stock-adjust",
									params: { variantId: row.id },
								} as never)
							}
							style={[...inputStyle, styles.stockBtn]}
							accessibilityRole="button"
							accessibilityLabel={t("product.stock")}
						>
							<Text style={[f.label, { color: c.text }]}>
								{row.trackInventory ? (row.stockOnHand ?? 0) : "—"}
							</Text>
							<Ionicons name="create-outline" size={14} color={c.primary} />
						</Pressable>
					) : (
						<TextInput
							value={row.initialStock}
							onChangeText={(v) =>
								onChange({ initialStock: v.replace(/\D/g, "") })
							}
							keyboardType="number-pad"
							style={inputStyle}
							accessibilityLabel={t("product.initialStock")}
						/>
					)}
				</Cell>
				<Cell label={t("product.threshold")}>
					<TextInput
						value={row.lowStockThreshold}
						editable={!readOnly}
						onChangeText={(v) =>
							onChange({ lowStockThreshold: v.replace(/\D/g, "") })
						}
						keyboardType="number-pad"
						style={inputStyle}
						accessibilityLabel={t("product.threshold")}
					/>
				</Cell>
			</View>
			{row.price && parseAmount(row.price) !== null ? (
				<Text style={[f.hint, { color: c.muted }]}>
					{formatXaf(parseAmount(row.price) ?? 0, i18n.language)}
				</Text>
			) : null}
		</View>
	);
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
	const c = useShopTheme();
	return (
		<View style={styles.cell}>
			<Text style={[f.hint, { color: c.muted }]}>{label}</Text>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	variant: { gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	cell: { width: "48%", gap: 4 },
	small: { minHeight: 44 },
	stockBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
});
