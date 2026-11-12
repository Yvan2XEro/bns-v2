import { Ionicons } from "@expo/vector-icons";
import type { Dispatch, SetStateAction } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { type FieldIssue, issueAt } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import {
	MAX_OPTIONS,
	type ProductFormState,
	syncVariantRows,
} from "@/src/lib/productForm";
import { FieldIssueText } from "./FieldIssueText";
import { formStyles as f } from "./formStyles";
import { SwitchRow } from "./SwitchRow";
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
	issues = [],
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	readOnly?: boolean;
	issues?: FieldIssue[];
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showAlert } = useAlert();

	const update = (mutate: (s: ProductFormState) => ProductFormState) =>
		setForm((s) => {
			const next = mutate(s);
			return { ...next, variants: syncVariantRows(next) };
		});

	/**
	 * Commits a name, or says why not. A refused name used to snap back to the
	 * old one on blur with no word; the row now keeps what was typed and shows
	 * this message under it.
	 */
	const commitName = (index: number, name: string): string | null => {
		const trimmed = name.trim();
		if (!trimmed) {
			return t("product.optionNameEmpty", {
				defaultValue: "Donnez un nom à l’option.",
			});
		}
		const duplicate = form.options.some(
			(o, i) =>
				i !== index && o.name.trim().toLowerCase() === trimmed.toLowerCase(),
		);
		if (duplicate) {
			return t("product.optionNameTaken", {
				defaultValue: "Ce nom est déjà utilisé par une autre option.",
			});
		}
		update((s) => ({
			...s,
			options: s.options.map((o, i) =>
				i === index ? { ...o, name: trimmed } : o,
			),
		}));
		return null;
	};

	const dropOption = (index: number) =>
		update((s) => ({ ...s, options: s.options.filter((_, i) => i !== index) }));

	// Removing an option regenerates every variant: the prices, costs and
	// stock typed on them go too. One stray tap on the bin cost all of it, so
	// it asks first — unless nothing has been typed yet.
	const removeOption = (index: number) => {
		const typed = form.variants.some(
			(row) => row.price || row.cost || row.initialStock || row.sku,
		);
		if (!typed) {
			dropOption(index);
			return;
		}
		const name =
			form.options[index]?.name.trim() || t("product.optionNamePlaceholder");
		showAlert(
			t("product.removeOptionTitle", {
				name,
				defaultValue: "Supprimer l’option « {{name}} » ?",
			}),
			t("product.removeOptionMsg", {
				count: form.variants.length,
				defaultValue:
					"Les {{count}} variantes et les prix, coûts et stocks saisis seront retirés.",
			}),
			[
				{ text: t("common.cancel"), style: "cancel" },
				{
					text: t("common.delete"),
					style: "destructive",
					onPress: () => dropOption(index),
				},
			],
		);
	};

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

	const toggleVariants = (hasVariants: boolean) =>
		update((s) => ({
			...s,
			hasVariants,
			options:
				hasVariants && s.options.length === 0
					? [{ name: t("product.defaultOptionName"), values: [] }]
					: s.options,
		}));
	const canAddOption =
		form.hasVariants && form.options.length < MAX_OPTIONS && !readOnly;

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<SwitchRow
				title={t("product.hasVariants")}
				hint={t("product.hasVariantsHint")}
				value={form.hasVariants}
				disabled={readOnly}
				onChange={toggleVariants}
			/>

			{form.hasVariants ? (
				<View style={styles.options}>
					{form.options.map((option, index) => (
						<VariantOptionRow
							key={`option-${index}`}
							option={option}
							readOnly={readOnly}
							onCommitName={(name) => commitName(index, name)}
							onRemove={() => removeOption(index)}
							onRemoveValue={(value) => removeValue(index, value)}
							onAddValue={(value) => addValue(index, value)}
							nameIssue={issueAt(issues, `options.${index}.name`)}
							valuesIssue={issueAt(issues, `options.${index}.values`)}
						/>
					))}
					<FieldIssueText issue={issueAt(issues, "options")} />
				</View>
			) : null}

			{/* A secondary action, outlined in the link colour: it adds structure,
			    it does not save anything. */}
			{canAddOption ? (
				<Pressable
					onPress={() =>
						update((s) => ({
							...s,
							options: [...s.options, { name: "", values: [] }],
						}))
					}
					style={({ pressed }) => [
						styles.addOption,
						{
							borderColor: c.border,
							backgroundColor: pressed ? c.primarySoft : "transparent",
						},
					]}
					accessibilityRole="button"
					accessibilityLabel={t("product.addOption")}
				>
					<Ionicons name="add" size={20} color={c.link} />
					<Text style={[f.label, { color: c.link }]}>
						{t("product.addOption")}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	options: { gap: 12 },
	addOption: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1,
		borderStyle: "dashed",
		paddingHorizontal: 14,
	},
});
