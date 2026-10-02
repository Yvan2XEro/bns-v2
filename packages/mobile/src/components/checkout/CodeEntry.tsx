import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Text, TextInput, View } from "react-native";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	useConfirmOrderCode,
	useResendConfirmationCode,
} from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { resendSecondsLeft } from "@/src/lib/checkoutFlow";
import {
	type ConfirmationCodeValues,
	confirmationCodeSchema,
} from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import { availableActions } from "@/src/lib/orderActions";
import type { OrderView } from "@/src/types/order";
import { CheckoutButton } from "./CheckoutButton";

/**
 * The SMS-code outcome. Whether "confirm" and "resend" exist comes from the
 * action table, so the attempts and resends left — not this screen — decide.
 */
export function CodeEntry({
	order,
	onAttempt,
}: {
	order: OrderView;
	onAttempt: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const confirm = useConfirmOrderCode(order.id);
	const resend = useResendConfirmationCode(order.id);
	const actions = availableActions(order, "buyer", null);
	// The placement sent the first code; a resend restarts the cooldown.
	const [lastSentAt, setLastSentAt] = useState(
		() => new Date(order.timestamps.placedAt),
	);
	const [now, setNow] = useState(() => new Date());
	const secondsLeft = resendSecondsLeft(lastSentAt, now);

	useEffect(() => {
		if (secondsLeft === 0) return;
		const timer = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(timer);
	}, [secondsLeft]);

	const { control, formState, handleSubmit, setError } =
		useForm<ConfirmationCodeValues>({
			resolver: zodResolver(confirmationCodeSchema),
			defaultValues: { code: "" },
		});
	const codeError = formState.errors.code?.message;

	const submit = handleSubmit((values) =>
		confirm.mutate(
			{ code: values.code },
			{
				onError: (error) => {
					setError("code", { message: resolveErrorMessage(error, t) });
					// A wrong code spends an attempt server-side.
					onAttempt();
				},
			},
		),
	);

	return (
		<View style={{ gap: 10 }}>
			<Text style={[formStyles.hint, { color: c.body }]}>
				{t("checkout.codeBody")}
			</Text>
			<Text style={[formStyles.hint, { color: c.muted }]}>
				{t("checkout.codeSent", { phone: order.delivery.phone })}
			</Text>
			{actions.includes("confirm_code") ? (
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
								accessibilityLabel={t("checkout.enterCode")}
								placeholder={t("checkout.enterCode")}
								placeholderTextColor={c.muted}
								style={[
									formStyles.input,
									{
										color: c.text,
										backgroundColor: c.input,
										borderColor: c.border,
										fontSize: 20,
										letterSpacing: 6,
									},
								]}
							/>
						)}
					/>
					{codeError ? (
						<Text style={formStyles.error} accessibilityLiveRegion="polite">
							{codeError === "checkout.errorCode"
								? t("checkout.errorCode")
								: codeError}
						</Text>
					) : null}
					<Text style={[formStyles.hint, { color: c.muted }]}>
						{t("checkout.attemptsLeft", {
							count: order.confirmation.attemptsLeft,
						})}
					</Text>
					<CheckoutButton
						label={t("checkout.confirmCode")}
						onPress={submit}
						loading={confirm.isPending}
					/>
				</>
			) : (
				<Text style={[formStyles.hint, { color: c.warningText }]}>
					{t("checkout.noMoreAttempts")}
				</Text>
			)}
			{actions.includes("resend_code") ? (
				<View style={{ gap: 4 }}>
					<CheckoutButton
						variant="outline"
						label={
							secondsLeft > 0
								? t("checkout.resendIn", { seconds: secondsLeft })
								: t("checkout.resendCode")
						}
						disabled={secondsLeft > 0}
						loading={resend.isPending}
						onPress={() =>
							resend.mutate(undefined, {
								onSuccess: () => {
									const sent = new Date();
									setLastSentAt(sent);
									setNow(sent);
								},
							})
						}
					/>
					{resend.isSuccess ? (
						<Text style={[formStyles.hint, { color: c.successText }]}>
							{t("checkout.codeSentAgain")}
						</Text>
					) : null}
					{resend.error ? (
						<Text style={formStyles.error} accessibilityRole="alert">
							{resolveErrorMessage(resend.error, t)}
						</Text>
					) : null}
				</View>
			) : null}
		</View>
	);
}
