import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { ProductOption } from "@/src/lib/variants";
import { formStyles as f } from "./formStyles";

/**
 * One option: its name (staged locally, committed on blur/Enter — see
 * `VariantOptionsEditor`) and its values as removable chips.
 */
export function VariantOptionRow({
	option,
	readOnly,
	onCommitName,
	onRemove,
	onRemoveValue,
	onAddValue,
}: {
	option: ProductOption;
	readOnly?: boolean;
	onCommitName: (name: string) => void;
	onRemove: () => void;
	onRemoveValue: (value: string) => void;
	onAddValue: (value: string) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [nameDraft, setNameDraft] = useState<string | null>(null);
	const [newValue, setNewValue] = useState("");

	const commitName = () => {
		if (nameDraft === null) return;
		onCommitName(nameDraft);
		setNameDraft(null);
	};

	const addValue = () => {
		const value = newValue.trim();
		if (!value) return;
		onAddValue(value);
		setNewValue("");
	};

	return (
		<View style={[styles.option, { borderTopColor: c.border }]}>
			<View style={f.row}>
				<TextInput
					value={nameDraft ?? option.name}
					editable={!readOnly}
					onChangeText={setNameDraft}
					onBlur={commitName}
					onSubmitEditing={commitName}
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
						onPress={onRemove}
						hitSlop={12}
						style={styles.iconButton}
						accessibilityRole="button"
						accessibilityLabel={t("common.delete")}
					>
						<Ionicons name="trash-outline" size={18} color={c.danger} />
					</Pressable>
				) : null}
			</View>
			<View style={f.chips}>
				{option.values.map((value) => (
					<Pressable
						key={value}
						disabled={readOnly}
						onPress={() => onRemoveValue(value)}
						style={[
							f.chip,
							{ borderColor: c.primary, backgroundColor: c.primarySoft },
						]}
						accessibilityRole="button"
						accessibilityLabel={t("product.removeValue", { value })}
					>
						<Text style={[f.chipText, { color: c.primary }]}>{value} ×</Text>
					</Pressable>
				))}
				{!readOnly ? (
					<TextInput
						value={newValue}
						onChangeText={setNewValue}
						onSubmitEditing={addValue}
						onBlur={addValue}
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
	);
}

const styles = StyleSheet.create({
	option: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
	valueInput: { minWidth: 110, paddingVertical: 6, fontFamily: Fonts.body },
	iconButton: { minHeight: 44, paddingVertical: 4 },
});
