import { Pressable, Text, TextInput, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	type ListingAttribute,
	maskDateInput,
	sanitizeNumberInput,
} from "@/src/lib/listingForm";
import { formStyles as f } from "./formStyles";

/** One category attribute: a chip picker for select/boolean, a text input otherwise. */
export function ProductAttributeInput({
	attribute,
	value,
	onChange,
}: {
	attribute: ListingAttribute;
	value: string;
	onChange: (value: string) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const label = `${attribute.name}${attribute.unit ? ` (${attribute.unit})` : ""}${attribute.required ? " *" : ""}`;
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];

	const choices =
		attribute.type === "select"
			? attribute.options.map((o) => ({ value: o.value, label: o.label }))
			: attribute.type === "boolean"
				? [
						{ value: "true", label: t("common.yes") },
						{ value: "false", label: t("common.no") },
					]
				: null;

	return (
		<View style={{ gap: 6 }}>
			<Text style={[f.label, { color: c.body }]}>{label}</Text>
			{choices ? (
				<View style={f.chips}>
					{choices.map((choice) => {
						const active = value === choice.value;
						return (
							<Pressable
								key={choice.value}
								onPress={() => onChange(active ? "" : choice.value)}
								style={[
									f.chip,
									{
										borderColor: active ? c.primary : c.border,
										backgroundColor: active ? c.primarySoft : c.card,
									},
								]}
								accessibilityRole="button"
								accessibilityLabel={choice.label}
								accessibilityState={{ selected: active }}
							>
								<Text
									style={[f.chipText, { color: active ? c.primary : c.body }]}
								>
									{choice.label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			) : (
				<TextInput
					value={value}
					onChangeText={(text) =>
						onChange(
							attribute.type === "number"
								? sanitizeNumberInput(text)
								: attribute.type === "date"
									? maskDateInput(text)
									: text,
						)
					}
					keyboardType={
						attribute.type === "number" || attribute.type === "date"
							? "numeric"
							: "default"
					}
					placeholder={
						attribute.type === "date" ? t("product.datePlaceholder") : undefined
					}
					placeholderTextColor={c.muted}
					style={inputStyle}
					accessibilityLabel={label}
				/>
			)}
		</View>
	);
}
