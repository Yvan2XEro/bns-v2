import { type Control, Controller } from "react-hook-form";
import { Text, TextInput, type TextInputProps, View } from "react-native";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import type {
	AddressField,
	CheckoutAddressValues,
} from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";

/** One text field of the address form; the error is a translation key. */
export function AddressTextField({
	control,
	name,
	label,
	hint,
	error,
	transform,
	...input
}: {
	control: Control<CheckoutAddressValues>;
	name: AddressField;
	label: string;
	hint?: string;
	error?: string;
	transform?: (text: string) => string;
} & Pick<
	TextInputProps,
	"keyboardType" | "autoComplete" | "multiline" | "placeholder" | "maxLength"
>) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View style={{ gap: 6 }}>
			<Text style={[formStyles.label, { color: c.body }]}>{label}</Text>
			<Controller
				control={control}
				name={name}
				render={({ field }) => (
					<TextInput
						{...input}
						value={field.value}
						onChangeText={(text) =>
							field.onChange(transform ? transform(text) : text)
						}
						onBlur={field.onBlur}
						accessibilityLabel={label}
						accessibilityHint={hint}
						placeholderTextColor={c.muted}
						style={[
							formStyles.input,
							input.multiline && formStyles.multiline,
							{
								color: c.text,
								backgroundColor: c.input,
								borderColor: error ? c.danger : c.border,
							},
						]}
					/>
				)}
			/>
			{hint ? (
				<Text style={[formStyles.hint, { color: c.muted }]}>{hint}</Text>
			) : null}
			{error ? (
				<Text style={formStyles.error} accessibilityLiveRegion="polite">
					{t(error)}
				</Text>
			) : null}
		</View>
	);
}
