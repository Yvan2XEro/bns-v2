import { Ionicons } from "@expo/vector-icons";
import type { Dispatch, SetStateAction } from "react";
import { Pressable, Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	type ProductFormState,
	parseAmount,
	type VariantRow,
} from "@/src/lib/productForm";
import { formStyles as f } from "./formStyles";
import { VariantOptionsEditor } from "./VariantOptionsEditor";
import { VariantRowCard } from "./VariantRowCard";

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
	const { t } = useTranslation();

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

	const totalInitial = form.variants.reduce(
		(sum, row) => sum + (parseAmount(row.initialStock) ?? 0),
		0,
	);

	return (
		<View style={{ gap: 14 }}>
			<VariantOptionsEditor form={form} setForm={setForm} readOnly={readOnly} />

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
							style={{
								flexDirection: "row",
								alignItems: "center",
								gap: 10,
								minHeight: 44,
							}}
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

				{form.variants.map((row) => (
					<VariantRowCard
						key={row.key}
						row={row}
						options={form.options}
						readOnly={readOnly}
						canManageCost={canManageCost}
						onChange={(patch) => setRow(row.key, patch)}
					/>
				))}
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
