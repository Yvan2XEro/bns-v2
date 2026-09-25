import { Ionicons } from "@expo/vector-icons";
import type { Dispatch, SetStateAction } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	MAX_OPTIONS,
	type ProductFormState,
	syncVariantRows,
} from "@/src/lib/productForm";
import { formStyles as f } from "./formStyles";
import { VariantOptionRow } from "./VariantOptionRow";

/**
 * The "has variants" switch plus the option/value editor. Renaming an option
 * is staged locally (in `VariantOptionRow`) and only committed (refusing
 * empty or duplicate) on blur/Enter — see `productForm.test.ts` for why a
 * keystroke must never touch `form.options` directly.
 */
export function VariantOptionsEditor({
	form,
	setForm,
	readOnly,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	readOnly?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	const update = (mutate: (s: ProductFormState) => ProductFormState) =>
		setForm((s) => {
			const next = mutate(s);
			return { ...next, variants: syncVariantRows(next) };
		});

	const commitName = (index: number, name: string) => {
		const trimmed = name.trim();
		const duplicate = form.options.some(
			(o, i) =>
				i !== index && o.name.trim().toLowerCase() === trimmed.toLowerCase(),
		);
		if (!trimmed || duplicate) return;
		update((s) => ({
			...s,
			options: s.options.map((o, i) =>
				i === index ? { ...o, name: trimmed } : o,
			),
		}));
	};

	const removeOption = (index: number) =>
		update((s) => ({ ...s, options: s.options.filter((_, i) => i !== index) }));

	const removeValue = (index: number, value: string) =>
		update((s) => ({
			...s,
			options: s.options.map((o, i) =>
				i === index ? { ...o, values: o.values.filter((v) => v !== value) } : o,
			),
		}));

	const addValue = (index: number, value: string) =>
		update((s) => ({
			...s,
			options: s.options.map((o, i) =>
				i === index && !o.values.includes(value)
					? { ...o, values: [...o.values, value] }
					: o,
			),
		}));

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
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
						<VariantOptionRow
							key={`option-${index}`}
							option={option}
							readOnly={readOnly}
							onCommitName={(name) => commitName(index, name)}
							onRemove={() => removeOption(index)}
							onRemoveValue={(value) => removeValue(index, value)}
							onAddValue={(value) => addValue(index, value)}
						/>
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
					style={[f.row, { minHeight: 44 }]}
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
	);
}
