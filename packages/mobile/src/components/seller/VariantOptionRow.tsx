import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { dangerInk } from "@/src/components/shop/ink";
import { useShopTheme } from "@/src/components/shop/theme";
import type { FieldIssue } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import type { ProductOption } from "@/src/lib/variants";
import { FieldIssueText, ISSUE_BORDER } from "./FieldIssueText";
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
	nameIssue,
	valuesIssue,
}: {
	option: ProductOption;
	readOnly?: boolean;
	/** Returns why the name was refused, or null once it is committed. */
	onCommitName: (name: string) => string | null;
	onRemove: () => void;
	onRemoveValue: (value: string) => void;
	onAddValue: (value: string) => void;
	nameIssue?: FieldIssue;
	valuesIssue?: FieldIssue;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [nameDraft, setNameDraft] = useState<string | null>(null);
	const [nameError, setNameError] = useState<string | null>(null);
	const [newValue, setNewValue] = useState("");

	const commitName = () => {
		if (nameDraft === null) return;
		const refused = onCommitName(nameDraft);
		setNameError(refused);
		// A refused name stays in the field, with the reason under it.
		if (!refused) setNameDraft(null);
	};

	// "S, M, L" adds three values at once; Enter adds one and keeps the
	// keyboard up for the next.
	const addValue = () => {
		const values = newValue
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean);
		if (values.length === 0) return;
		for (const value of values) onAddValue(value);
		setNewValue("");
	};

	return (
		<View style={[styles.option, { borderTopColor: c.border }]}>
			<View style={f.row}>
				<TextInput
					value={nameDraft ?? option.name}
					editable={!readOnly}
					onChangeText={(text) => {
						setNameDraft(text);
						if (nameError) setNameError(null);
					}}
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
							borderColor: nameIssue || nameError ? ISSUE_BORDER : c.border,
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
			{nameError ? (
				<Text
					style={[f.error, { color: dangerInk(c) }]}
					accessibilityRole="alert"
				>
					{nameError}
				</Text>
			) : (
				<FieldIssueText issue={nameIssue} />
			)}
			<View style={f.chips}>
				{option.values.map((value) => (
					<Pressable
						key={value}
						disabled={readOnly}
						onPress={() => onRemoveValue(value)}
						style={[
							f.chip,
							styles.valueChip,
							{ borderColor: c.primary, backgroundColor: c.primarySoft },
						]}
						accessibilityRole="button"
						accessibilityLabel={t("product.removeValue", { value })}
					>
						<Text style={[f.chipText, { color: c.link }]}>{value}</Text>
						{!readOnly ? (
							<Ionicons name="close" size={14} color={c.link} />
						) : null}
					</Pressable>
				))}
				{!readOnly ? (
					<TextInput
						value={newValue}
						onChangeText={setNewValue}
						onSubmitEditing={addValue}
						onBlur={addValue}
						submitBehavior="submit"
						returnKeyType="next"
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
			<FieldIssueText issue={valuesIssue} />
		</View>
	);
}

const styles = StyleSheet.create({
	option: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
	valueInput: { minWidth: 110, paddingVertical: 6, fontFamily: Fonts.body },
	iconButton: { minHeight: 44, paddingVertical: 4 },
	valueChip: { flexDirection: "row", alignItems: "center", gap: 6 },
});
