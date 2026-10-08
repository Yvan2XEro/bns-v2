import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formStyles } from "@/src/components/seller/formStyles";
import { FieldError } from "@/src/components/sellerOrders/FormBits";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

export function TextField({
	label,
	value,
	onChange,
	error,
	keyboardType,
	multiline,
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (next: string) => void;
	error?: string;
	keyboardType?: "default" | "number-pad" | "decimal-pad" | "phone-pad";
	multiline?: boolean;
	placeholder?: string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View style={{ gap: 6 }}>
			<Text style={[formStyles.label, { color: c.body }]}>{label}</Text>
			<TextInput
				value={value}
				onChangeText={onChange}
				keyboardType={keyboardType}
				multiline={multiline}
				placeholder={placeholder}
				placeholderTextColor={c.muted}
				accessibilityLabel={label}
				style={[
					formStyles.input,
					multiline ? formStyles.multiline : null,
					{
						color: c.text,
						backgroundColor: c.input,
						borderColor: error ? c.danger : c.border,
					},
				]}
			/>
			<FieldError message={error ? t(error) : undefined} />
		</View>
	);
}

export function ToggleField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: boolean;
	onChange: (next: boolean) => void;
}) {
	const c = useShopTheme();
	return (
		<View style={[formStyles.row, { minHeight: 44 }]}>
			<Text
				style={{ flex: 1, color: c.text, fontFamily: Fonts.body, fontSize: 14 }}
			>
				{label}
			</Text>
			<Switch
				value={value}
				onValueChange={onChange}
				accessibilityLabel={label}
				trackColor={{ true: c.primary }}
			/>
		</View>
	);
}

export function ChipField<T extends string>({
	label,
	options,
	selected,
	onToggle,
	error,
	labelOf,
}: {
	label: string;
	options: readonly T[];
	selected: readonly T[];
	onToggle: (option: T) => void;
	error?: string;
	labelOf: (option: T) => string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View style={{ gap: 6 }}>
			<Text style={[formStyles.label, { color: c.body }]}>{label}</Text>
			<View style={formStyles.chips}>
				{options.map((option) => {
					const on = selected.includes(option);
					return (
						<Pressable
							key={option}
							onPress={() => onToggle(option)}
							accessibilityRole="checkbox"
							accessibilityState={{ checked: on }}
							accessibilityLabel={labelOf(option)}
							style={[
								formStyles.chip,
								{
									borderColor: on ? c.primary : c.border,
									backgroundColor: on ? c.primarySoft : c.card,
								},
							]}
						>
							<Text
								style={[
									formStyles.chipText,
									{ color: on ? c.primary : c.body },
								]}
							>
								{labelOf(option)}
							</Text>
						</Pressable>
					);
				})}
			</View>
			<FieldError message={error ? t(error) : undefined} />
		</View>
	);
}

/** A single-choice row of chips. */
export function ChoiceField<T extends string>({
	label,
	options,
	value,
	onChange,
	labelOf,
}: {
	label: string;
	options: readonly T[];
	value: T;
	onChange: (next: T) => void;
	labelOf: (option: T) => string;
}) {
	const c = useShopTheme();
	return (
		<View style={{ gap: 6 }}>
			<Text style={[formStyles.label, { color: c.body }]}>{label}</Text>
			<View style={formStyles.chips} accessibilityRole="radiogroup">
				{options.map((option) => {
					const on = value === option;
					return (
						<Pressable
							key={option}
							onPress={() => onChange(option)}
							accessibilityRole="radio"
							accessibilityState={{ selected: on }}
							accessibilityLabel={labelOf(option)}
							style={[
								formStyles.chip,
								{
									borderColor: on ? c.primary : c.border,
									backgroundColor: on ? c.primarySoft : c.card,
								},
							]}
						>
							<Text
								style={[
									formStyles.chipText,
									{ color: on ? c.primary : c.body },
								]}
							>
								{labelOf(option)}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}
