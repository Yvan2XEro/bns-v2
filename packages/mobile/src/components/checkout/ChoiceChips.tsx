import { Pressable, Text, View } from "react-native";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

/** A labelled single choice drawn as chips: the city, then the district. */
export function ChoiceChips({
	label,
	options,
	value,
	onChange,
	error,
	hint,
}: {
	label: string;
	options: Array<{ key: string; label: string; disabled?: boolean }>;
	value: string;
	onChange: (key: string) => void;
	error?: string;
	hint?: string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View
			style={{ gap: 6 }}
			accessibilityRole="radiogroup"
			accessibilityLabel={label}
		>
			<Text style={[formStyles.label, { color: c.body }]}>{label}</Text>
			<View style={formStyles.chips}>
				{options.map((option) => {
					const selected = option.key === value;
					return (
						<Pressable
							key={option.key}
							onPress={() => onChange(option.key)}
							disabled={option.disabled}
							accessibilityRole="radio"
							accessibilityLabel={option.label}
							accessibilityState={{ selected, disabled: option.disabled }}
							style={[
								formStyles.chip,
								{
									borderColor: selected ? c.primary : c.border,
									backgroundColor: selected ? c.primarySoft : c.card,
									opacity: option.disabled ? 0.4 : 1,
								},
							]}
						>
							<Text
								style={[
									formStyles.chipText,
									{ color: selected ? c.primary : c.text },
								]}
							>
								{option.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
			{hint ? (
				<Text style={[formStyles.hint, { color: c.muted }]}>{hint}</Text>
			) : null}
			{error ? <Text style={formStyles.error}>{t(error)}</Text> : null}
		</View>
	);
}
