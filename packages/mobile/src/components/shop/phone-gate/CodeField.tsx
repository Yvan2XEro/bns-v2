import type { RefObject } from "react";
import { type Control, Controller, type FieldError } from "react-hook-form";
import { Pressable, Text, TextInput, View } from "react-native";
import { formatCountdown } from "@/src/lib/countdown";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "../theme";
import type { CodeFormValues } from "./schemas";
import { fieldStyles } from "./styles";

/** Step 2: the 6-digit code, plus a resend link gated by the server's cooldown. */
export function CodeField({
	control,
	error,
	codeRef,
	wait,
	resendDisabled,
	onResend,
}: {
	control: Control<CodeFormValues>;
	error?: FieldError;
	codeRef: RefObject<TextInput | null>;
	/** Seconds left before a resend is allowed; 0 means it is. */
	wait: number;
	resendDisabled: boolean;
	onResend: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const resendLabel =
		wait > 0
			? t("shop.gateResendIn", { time: formatCountdown(wait) })
			: t("shop.gateResend");

	return (
		<View>
			<Text style={[fieldStyles.label, { color: c.body }]}>
				{t("shop.gateCodeLabel")}
			</Text>
			<Controller
				control={control}
				name="code"
				render={({ field }) => (
					<TextInput
						ref={codeRef}
						value={field.value}
						onChangeText={(v) =>
							field.onChange(v.replace(/\D/g, "").slice(0, 6))
						}
						onBlur={field.onBlur}
						keyboardType="number-pad"
						textContentType="oneTimeCode"
						autoComplete="sms-otp"
						maxLength={6}
						placeholder="••••••"
						placeholderTextColor={c.muted}
						accessibilityLabel={t("shop.gateCodeLabel")}
						style={[
							fieldStyles.input,
							fieldStyles.code,
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
			<View style={fieldStyles.links}>
				<Pressable
					disabled={wait > 0 || resendDisabled}
					onPress={onResend}
					accessibilityRole="button"
					accessibilityLabel={resendLabel}
					hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
					style={fieldStyles.linkHit}
				>
					<Text
						style={[
							fieldStyles.link,
							{ color: wait > 0 ? c.muted : c.primary },
						]}
					>
						{resendLabel}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}
