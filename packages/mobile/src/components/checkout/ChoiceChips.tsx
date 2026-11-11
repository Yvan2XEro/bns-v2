import { Pressable, StyleSheet, Text, View } from "react-native";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { FormError } from "./FormError";
import { inkOf } from "./fill";

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
			<Text style={[formStyles.label, styles.label, { color: c.body }]}>
				{label}
			</Text>
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
							accessibilityState={{
								checked: selected,
								disabled: option.disabled,
							}}
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
									{ color: selected ? inkOf(c) : c.text },
								]}
							>
								{option.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
			{hint ? (
				<Text style={[formStyles.hint, styles.hint, { color: c.muted }]}>
					{hint}
				</Text>
			) : null}
			<FormError message={error ? t(error) : null} />
		</View>
	);
}

const styles = StyleSheet.create({
	label: { fontSize: 14 },
	hint: { fontSize: 13, lineHeight: 18 },
});
