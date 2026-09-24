import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { type Dispatch, type SetStateAction, useState } from "react";
import {
	Pressable,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	MAX_OPTIONS,
	type ProductFormState,
	parseAmount,
	syncVariantRows,
	type VariantRow,
} from "@/src/lib/productForm";
import {
	formatPercent,
	formatXaf,
	marginPercent,
	variantLabel,
} from "@/src/lib/variants";
import { formStyles as f } from "./formStyles";

export function VariantsStep({
	form,
	setForm,
	editing,
	readOnly,
	canManageCost,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	/** Existing product: stock is changed through movements, not typed. */
	editing?: boolean;
	readOnly?: boolean;
	/** Purchase cost and margin are owner/manager-only; see `canManageShop`. */
	canManageCost: boolean;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const [newValues, setNewValues] = useState<Record<number, string>>({});
	// Draft option names, keyed by option index: kept local so a keystroke never
	// touches `form.options` (and therefore never re-syncs the variant rows).
	// The rename only commits — and the rows only resync — on blur/submit.
	const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({});

	const update = (mutate: (s: ProductFormState) => ProductFormState) =>
		setForm((s) => {
			const next = mutate(s);
			return { ...next, variants: syncVariantRows(next) };
		});

	const setRow = (key: string, patch: Partial<VariantRow>) =>
		setForm((s) => {
			const variants = s.variants.map((row) =>
				row.key === key ? { ...row, ...patch } : row,
			);
			if (
				s.samePrice &&
				(patch.price !== undefined || patch.cost !== undefined) &&
				key === s.variants[0]?.key
			) {
				return {
					...s,
					variants: variants.map((row) => ({
						...row,
						price: patch.price ?? row.price,
						cost: patch.cost ?? row.cost,
					})),
				};
			}
			return { ...s, variants };
		});

	const addValue = (index: number) => {
		const value = (newValues[index] ?? "").trim();
		if (!value) return;
		update((s) => ({
			...s,
			options: s.options.map((o, i) =>
				i === index && !o.values.includes(value)
					? { ...o, values: [...o.values, value] }
					: o,
			),
		}));
		setNewValues((v) => ({ ...v, [index]: "" }));
	};

	/** Commits a draft option name, refusing an empty or duplicate one. */
	const commitName = (index: number) => {
		const draft = nameDrafts[index];
		if (draft === undefined) return;
		const trimmed = draft.trim();
		const duplicate = form.options.some(
			(o, i) =>
				i !== index && o.name.trim().toLowerCase() === trimmed.toLowerCase(),
		);
		if (trimmed && !duplicate) {
			update((s) => ({
				...s,
				options: s.options.map((o, i) =>
					i === index ? { ...o, name: trimmed } : o,
				),
			}));
		}
		setNameDrafts((d) => {
			const next = { ...d };
			delete next[index];
			return next;
		});
	};

	const inputStyle = [
		f.input,
		styles.small,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];
	const totalInitial = form.variants.reduce(
		(sum, row) => sum + (parseAmount(row.initialStock) ?? 0),
		0,
	);

	return (
		<View style={{ gap: 14 }}>
			<View
				style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<View style={f.row}>
					<View style={{ flex: 1 }}>
						<Text style={[f.label, { color: c.text }]}>
							{t("product.hasVariants")}
						</Text>
						<Text style={[f.hint, { color: c.muted }]}>
							{t("product.hasVariantsHint")}
						</Text>
					</View>
					<Switch
						value={form.hasVariants}
						disabled={readOnly}
						onValueChange={(hasVariants) =>
							update((s) => ({
								...s,
								hasVariants,
								options:
									hasVariants && s.options.length === 0
										? [{ name: t("product.defaultOptionName"), values: [] }]
										: s.options,
							}))
						}
						trackColor={{ true: c.primary, false: c.border }}
						accessibilityLabel={t("product.hasVariants")}
					/>
				</View>

				{form.hasVariants
					? form.options.map((option, index) => (
							<View
								key={`option-${index}`}
								style={[styles.option, { borderTopColor: c.border }]}
							>
								<View style={f.row}>
									<TextInput
										value={nameDrafts[index] ?? option.name}
										editable={!readOnly}
										onChangeText={(name) =>
											setNameDrafts((d) => ({ ...d, [index]: name }))
										}
										onBlur={() => commitName(index)}
										onSubmitEditing={() => commitName(index)}
										returnKeyType="done"
										placeholder={t("product.optionNamePlaceholder")}
										placeholderTextColor={c.muted}
										style={[
											f.input,
											{
												flex: 1,
												color: c.text,
												backgroundColor: c.input,
												borderColor: c.border,
											},
										]}
										accessibilityLabel={t("product.optionNamePlaceholder")}
									/>
									{!readOnly ? (
										<Pressable
											onPress={() =>
												update((s) => ({
													...s,
													options: s.options.filter((_, i) => i !== index),
												}))
											}
											hitSlop={12}
											style={styles.iconButton}
											accessibilityRole="button"
											accessibilityLabel={t("common.delete")}
										>
											<Ionicons
												name="trash-outline"
												size={18}
												color={c.danger}
											/>
										</Pressable>
									) : null}
								</View>
								<View style={f.chips}>
									{option.values.map((value) => (
										<Pressable
											key={value}
											disabled={readOnly}
											onPress={() =>
												update((s) => ({
													...s,
													options: s.options.map((o, i) =>
														i === index
															? {
																	...o,
																	values: o.values.filter((v) => v !== value),
																}
															: o,
													),
												}))
											}
											style={[
												f.chip,
												{
													borderColor: c.primary,
													backgroundColor: c.primarySoft,
												},
											]}
											accessibilityRole="button"
											accessibilityLabel={t("product.removeValue", { value })}
										>
											<Text style={[f.chipText, { color: c.primary }]}>
												{value} ×
											</Text>
										</Pressable>
									))}
									{!readOnly ? (
										<TextInput
											value={newValues[index] ?? ""}
											onChangeText={(text) =>
												setNewValues((v) => ({ ...v, [index]: text }))
											}
											onSubmitEditing={() => addValue(index)}
											onBlur={() => addValue(index)}
											returnKeyType="done"
											placeholder={t("product.addValue")}
											placeholderTextColor={c.muted}
											style={[
												f.chip,
												styles.valueInput,
												{ borderColor: c.border, color: c.text },
											]}
											accessibilityLabel={t("product.addValue")}
										/>
									) : null}
								</View>
							</View>
						))
					: null}

				{form.hasVariants && form.options.length < MAX_OPTIONS && !readOnly ? (
					<Pressable
						onPress={() =>
							update((s) => ({
								...s,
								options: [...s.options, { name: "", values: [] }],
							}))
						}
						style={[f.row, styles.iconButton]}
						accessibilityRole="button"
						accessibilityLabel={t("product.addOption")}
					>
						<Ionicons name="add-circle-outline" size={18} color={c.primary} />
						<Text style={[f.label, { color: c.primary }]}>
							{t("product.addOption")}
						</Text>
					</Pressable>
				) : null}
			</View>

			<View
				style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<View style={f.row}>
					<Text style={[f.sectionTitle, { color: c.text, flex: 1 }]}>
						{form.hasVariants
							? t("product.variantsGenerated", { count: form.variants.length })
							: t("product.priceAndStock")}
					</Text>
					{form.hasVariants && form.variants.length > 1 ? (
						<Pressable
							disabled={readOnly}
							onPress={() =>
								setForm((s) => ({ ...s, samePrice: !s.samePrice }))
							}
							style={[f.row, styles.iconButton]}
							accessibilityRole="switch"
							accessibilityLabel={t("product.samePrice")}
							accessibilityState={{ checked: form.samePrice }}
						>
							<Ionicons
								name={form.samePrice ? "checkbox" : "square-outline"}
								size={18}
								color={c.primary}
							/>
							<Text style={[f.hint, { color: c.body }]}>
								{t("product.samePrice")}
							</Text>
						</Pressable>
					) : null}
				</View>

				{form.variants.map((row) => {
					const margin = canManageCost
						? marginPercent(parseAmount(row.price), parseAmount(row.cost))
						: null;
					const label =
						variantLabel(row.optionValues, form.options) ||
						t("product.defaultVariant");
					return (
						<View
							key={row.key}
							style={[styles.variant, { borderTopColor: c.border }]}
						>
							<View style={f.row}>
								<Text style={[f.label, { color: c.text, flex: 1 }]}>
									{label}
								</Text>
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
								onChangeText={(sku) => setRow(row.key, { sku })}
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
										onChangeText={(v) =>
											setRow(row.key, { price: v.replace(/\D/g, "") })
										}
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
											onChangeText={(v) =>
												setRow(row.key, { cost: v.replace(/\D/g, "") })
											}
											keyboardType="number-pad"
											style={inputStyle}
											accessibilityLabel={t("product.cost")}
										/>
									</Cell>
								) : null}
								<Cell
									label={
										row.id ? t("product.stock") : t("product.initialStock")
									}
								>
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
											<Ionicons
												name="create-outline"
												size={14}
												color={c.primary}
											/>
										</Pressable>
									) : (
										<TextInput
											value={row.initialStock}
											onChangeText={(v) =>
												setRow(row.key, { initialStock: v.replace(/\D/g, "") })
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
											setRow(row.key, {
												lowStockThreshold: v.replace(/\D/g, ""),
											})
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
				})}
				{!editing ? (
					<Text style={[f.hint, { color: c.muted }]}>
						{t("product.initialStockNote", { count: totalInitial })}
					</Text>
				) : (
					<Text style={[f.hint, { color: c.muted }]}>
						{t("product.stockThroughMovements")}
					</Text>
				)}
			</View>
		</View>
	);
}

function Cell({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	const c = useShopTheme();
	return (
		<View style={styles.cell}>
			<Text style={[f.hint, { color: c.muted }]}>{label}</Text>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	option: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
	valueInput: { minWidth: 110, paddingVertical: 6, fontFamily: Fonts.body },
	variant: { gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	cell: { width: "48%", gap: 4 },
	small: { minHeight: 44 },
	stockBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	iconButton: { minHeight: 44, paddingVertical: 4 },
});
