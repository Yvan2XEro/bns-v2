import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, TextInput } from "react-native";
import { Fonts } from "@/constants/theme";
import {
	useConfirmOrderCode,
	useResendConfirmationCode,
} from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	type ConfirmCodeValues,
	confirmCodeSchema,
} from "@/src/lib/purchaseForms";
import { useShopTheme } from "../shop/theme";
import { Card, FieldError, PurchaseButton, purchaseText } from "./ui";

/** Each half renders only when `availableActions` offers it. */
export function ConfirmCodeCard({
	orderId,
	canConfirm,
	canResend,
}: {
	orderId: string;
	canConfirm: boolean;
	canResend: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const confirm = useConfirmOrderCode(orderId);
	const resend = useResendConfirmationCode(orderId);
	const { control, formState, handleSubmit, setError } =
		useForm<ConfirmCodeValues>({
			resolver: zodResolver(confirmCodeSchema),
			defaultValues: { code: "" },
		});

	const onSubmit = handleSubmit(async (values) => {
		try {
			await confirm.mutateAsync(values);
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, t) });
		}
	});

	const codeError = formState.errors.code?.message;

	return (
		<Card title={t("purchases.confirmCodeTitle")} accent={c.sell}>
			<Text style={[purchaseText.body, { color: c.body }]}>
				{t("purchases.confirmCodeBody")}
			</Text>
			{canConfirm ? (
				<>
					<Controller
						control={control}
						name="code"
						render={({ field }) => (
							<TextInput
								value={field.value}
								onChangeText={field.onChange}
								onBlur={field.onBlur}
								keyboardType="number-pad"
								autoComplete="one-time-code"
								textContentType="oneTimeCode"
								maxLength={6}
								accessibilityLabel={t("purchases.confirmCodeLabel")}
								placeholder={t("purchases.confirmCodeLabel")}
								placeholderTextColor={c.muted}
								style={[
									styles.input,
									{
										color: c.text,
										backgroundColor: c.input,
										borderColor: codeError ? c.danger : c.border,
									},
								]}
							/>
						)}
					/>
					<FieldError message={codeError ? t(codeError) : null} />
					<PurchaseButton
						label={t("purchases.confirmCodeSubmit")}
						pending={confirm.isPending}
						onPress={onSubmit}
					/>
				</>
			) : null}
			<FieldError message={formState.errors.root?.message} />
			{canResend ? (
				<PurchaseButton
					label={t("purchases.resendCode")}
					tone="outline"
					pending={resend.isPending}
					onPress={() => resend.mutate()}
				/>
			) : null}
			{resend.isSuccess ? (
				<Text style={[purchaseText.muted, { color: c.successText }]}>
					{t("purchases.resendCodeSent")}
				</Text>
			) : null}
			<FieldError
				message={resend.isError ? resolveErrorMessage(resend.error, t) : null}
			/>
		</Card>
	);
}

const styles = StyleSheet.create({
	input: {
		minHeight: 48,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 14,
		fontSize: 22,
		letterSpacing: 6,
		fontFamily: Fonts.bodySemibold,
	},
});
