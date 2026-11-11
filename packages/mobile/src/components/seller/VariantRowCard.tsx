import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { type FieldIssue, issueAt } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { parseAmount, type VariantRow } from "@/src/lib/productForm";
import {
	formatPercent,
	marginPercent,
	type ProductOption,
	variantLabel,
} from "@/src/lib/variants";
import { FieldIssueText, ISSUE_BORDER } from "./FieldIssueText";
import { formStyles as f } from "./formStyles";

/** One variant's SKU, price, cost, stock and threshold — a single card row. */
export function VariantRowCard({
	row,
	index,
	issues,
	options,
	readOnly,
	canManageCost,
	onChange,
}: {
	row: VariantRow;
	index: number;
	issues: FieldIssue[];
	options: ProductOption[];
	readOnly?: boolean;
	canManageCost: boolean;
	onChange: (patch: Partial<VariantRow>) => void;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	// Read-only (a staff role without rights): the fields sit in the well with
	// muted ink, so they read as values rather than as inputs that ignore taps.
	const inputStyle = [
		f.input,
		{
			color: readOnly ? c.muted : c.text,
			backgroundColor: readOnly ? c.neutralSoft : c.input,
			borderColor: c.border,
		},
	];
	const numberInput = [...inputStyle, styles.number];
	const margin = canManageCost
		? marginPercent(parseAmount(row.price), parseAmount(row.cost))
		: null;
	const label =
		variantLabel(row.optionValues, options) || t("product.defaultVariant");
	const issueOf = (field: string) =>
		issueAt(issues, `variants.${index}.${field}`);
	const flagged = (field: string) =>
		issueOf(field) ? { borderColor: ISSUE_BORDER } : null;
	const price = parseAmount(row.price);
	const stockValue = row.trackInventory ? String(row.stockOnHand ?? 0) : "—";

	return (
		<View style={[styles.variant, { borderTopColor: c.border }]}>
			{/* The variant's name leads; the margin is a quiet result beside it. */}
			<View style={styles.header}>
				<Text
					style={[styles.name, { color: c.text }]}
					numberOfLines={2}
					accessibilityRole="header"
				>
					{label}
				</Text>
				{margin !== null ? (
					<View style={[styles.margin, { backgroundColor: c.successSoft }]}>
						<Text style={[styles.marginText, { color: c.successText }]}>
							{t("product.margin", {
								value: formatPercent(margin, i18n.language),
							})}
						</Text>
					</View>
				) : null}
			</View>
			<FieldIssueText issue={issueOf("optionValues")} />

			{/* The money and the stock first: what a seller fills on every row. */}
			<View style={styles.grid}>
				<Cell label={t("product.price")}>
					<TextInput
						value={row.price}
						editable={!readOnly}
						onChangeText={(v) => onChange({ price: v.replace(/\D/g, "") })}
						keyboardType="number-pad"
						style={[...numberInput, flagged("price")]}
						accessibilityLabel={t("product.price")}
					/>
					{/* The amount as buyers will read it, right under what was typed. */}
					{row.price && price !== null ? (
						<Text
							style={[styles.echo, { color: c.muted }]}
							numberOfLines={1}
							importantForAccessibility="no"
						>
							{formatPrice(price, i18n.language)}
						</Text>
					) : null}
					<FieldIssueText issue={issueOf("price")} />
				</Cell>
				{canManageCost ? (
					<Cell label={t("product.cost")}>
						<TextInput
							value={row.cost}
							editable={!readOnly}
							onChangeText={(v) => onChange({ cost: v.replace(/\D/g, "") })}
							keyboardType="number-pad"
							style={[...numberInput, flagged("cost")]}
							accessibilityLabel={t("product.cost")}
						/>
						<FieldIssueText issue={issueOf("cost")} />
					</Cell>
				) : null}
				<Cell label={row.id ? t("product.stock") : t("product.initialStock")}>
					{row.id ? (
						// Stock on an existing variant moves through a movement, never a
						// typed number: the field opens the stock screen.
						<Pressable
							disabled={readOnly}
							onPress={() =>
								router.push({
									pathname: "/seller/stock-adjust",
									params: { variantId: row.id },
								} as never)
							}
							style={({ pressed }) => [
								...inputStyle,
								styles.stockBtn,
								pressed && { backgroundColor: c.primarySoft },
							]}
							accessibilityRole="button"
							accessibilityLabel={`${t("product.stock")} ${stockValue}`}
							accessibilityState={{ disabled: !!readOnly }}
						>
							<Text
								style={[
									styles.stockValue,
									{ color: readOnly ? c.muted : c.text },
								]}
							>
								{stockValue}
							</Text>
							{readOnly ? null : (
								<Ionicons
									name="create-outline"
									size={18}
									color={c.link}
									importantForAccessibility="no"
								/>
							)}
						</Pressable>
					) : (
						<TextInput
							value={row.initialStock}
							editable={!readOnly}
							onChangeText={(v) =>
								onChange({ initialStock: v.replace(/\D/g, "") })
							}
							keyboardType="number-pad"
							style={[...numberInput, flagged("initialStock")]}
							accessibilityLabel={t("product.initialStock")}
						/>
					)}
					<FieldIssueText issue={issueOf("initialStock")} />
				</Cell>
				<Cell label={t("product.threshold")}>
					<TextInput
						value={row.lowStockThreshold}
						editable={!readOnly}
						onChangeText={(v) =>
							onChange({ lowStockThreshold: v.replace(/\D/g, "") })
						}
						keyboardType="number-pad"
						style={[...numberInput, flagged("lowStockThreshold")]}
						accessibilityLabel={t("product.threshold")}
					/>
					<FieldIssueText issue={issueOf("lowStockThreshold")} />
				</Cell>
			</View>

			{/* The identifiers are optional and come last, full width: a barcode
			    is too long to sit in half a row. */}
			<View style={styles.identifiers}>
				<TextInput
					value={row.sku}
					editable={!readOnly}
					onChangeText={(sku) => onChange({ sku })}
					autoCapitalize="characters"
					placeholder={t("product.skuPlaceholder")}
					placeholderTextColor={c.muted}
					style={[...inputStyle, flagged("sku")]}
					accessibilityLabel={t("product.skuPlaceholder")}
				/>
				<FieldIssueText issue={issueOf("sku")} />
				<TextInput
					value={row.barcode ?? ""}
					editable={!readOnly}
					onChangeText={(barcode) =>
						onChange({ barcode: barcode.replace(/[^\d\s]/g, "") })
					}
					keyboardType="number-pad"
					placeholder={t("product.barcodePlaceholder")}
					placeholderTextColor={c.muted}
					style={[...inputStyle, styles.number, flagged("barcode")]}
					accessibilityLabel={t("product.barcodePlaceholder")}
				/>
				<FieldIssueText issue={issueOf("barcode")} />
			</View>
		</View>
	);
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
	const c = useShopTheme();
	return (
		<View style={styles.cell}>
			<Text style={[styles.cellLabel, { color: c.body }]}>{label}</Text>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	variant: {
		gap: 12,
		paddingTop: 14,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 28,
	},
	name: {
		flex: 1,
		fontSize: 15,
		lineHeight: 20,
		fontFamily: Fonts.displaySemibold,
	},
	margin: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	marginText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		fontVariant: ["tabular-nums"],
	},
	// Two cells to a row at any width; the basis leaves room for the gap.
	grid: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 12 },
	cell: { flexBasis: "45%", flexGrow: 1, gap: 6 },
	cellLabel: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
	number: { fontVariant: ["tabular-nums"] },
	echo: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.body,
		fontVariant: ["tabular-nums"],
	},
	identifiers: { gap: 8 },
	stockBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	stockValue: {
		fontSize: 16,
		fontFamily: Fonts.displaySemibold,
		fontVariant: ["tabular-nums"],
	},
});
