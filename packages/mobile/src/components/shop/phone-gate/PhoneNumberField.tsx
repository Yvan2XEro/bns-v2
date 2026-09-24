import { type Control, Controller, type FieldError } from "react-hook-form";
import { Text, TextInput, View } from "react-native";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "../theme";
import type { PhoneFormValues } from "./schemas";
import { fieldStyles } from "./styles";

/** Step 1: the number a code is sent to. Disabled once a code is pending. */
export function PhoneNumberField({
	control,
	error,
	editable,
}: {
	control: Control<PhoneFormValues>;
	error?: FieldError;
	editable: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View>
			<Text style={[fieldStyles.label, { color: c.body }]}>
				{t("shop.gatePhoneLabel")}
			</Text>
			<Controller
				control={control}
				name="phone"
				render={({ field }) => (
					<TextInput
						value={field.value}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						editable={editable}
						keyboardType="phone-pad"
						placeholder="+237 6XX XXX XXX"
						placeholderTextColor={c.muted}
						accessibilityLabel={t("shop.gatePhoneLabel")}
						style={[
							fieldStyles.input,
							{
								color: c.text,
								backgroundColor: c.input,
								borderColor: c.border,
							},
						]}
					/>
				)}
			/>
			{error ? (
				<Text style={[fieldStyles.hint, { color: c.danger }]}>
					{error.message}
				</Text>
			) : null}
		</View>
	);
}
