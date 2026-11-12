import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
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
import { FormError } from "./FormError";
import { inkOf } from "./fill";

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
			<Text style={[formStyles.hint, { color: c.body, fontSize: 14 }]}>
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
								onChangeText={(text) => {
									field.onChange(text);
									// The sixth digit is the buyer's "confirm": no hunt for
									// the button with the keyboard up.
									if (/^\d{6}$/.test(text) && !confirm.isPending) submit();
								}}
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
										borderColor: codeError ? c.danger : c.border,
										minHeight: 56,
										fontSize: 24,
										fontFamily: Fonts.displayBold,
										letterSpacing: 8,
										textAlign: "center",
									},
								]}
							/>
						)}
					/>
					<FormError
						message={
							codeError
								? codeError === "checkout.errorCode"
									? t("checkout.errorCode")
									: codeError
								: null
						}
					/>
					<Text style={[formStyles.hint, { color: c.muted, fontSize: 13 }]}>
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
				<Text style={[formStyles.hint, { color: c.warningText, fontSize: 14 }]}>
					{t("checkout.noMoreAttempts")}
				</Text>
			)}
			{actions.includes("resend_code") ? (
				<View style={{ gap: 4 }}>
					{/* A quiet row, not a second big button under the confirm one. */}
					<Pressable
						onPress={() =>
							resend.mutate(undefined, {
								onSuccess: () => {
									const sent = new Date();
									setLastSentAt(sent);
									setNow(sent);
								},
							})
						}
						disabled={secondsLeft > 0 || resend.isPending}
						accessibilityRole="button"
						accessibilityState={{
							disabled: secondsLeft > 0,
							busy: resend.isPending,
						}}
						style={{
							minHeight: 44,
							flexDirection: "row",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
						}}
					>
						{resend.isPending ? (
							<ActivityIndicator color={c.primary} size="small" />
						) : null}
						<Text
							style={{
								fontSize: 15,
								fontFamily: Fonts.bodySemibold,
								color: secondsLeft > 0 ? c.muted : inkOf(c),
								textDecorationLine: secondsLeft > 0 ? "none" : "underline",
							}}
						>
							{secondsLeft > 0
								? t("checkout.resendIn", { seconds: secondsLeft })
								: t("checkout.resendCode")}
						</Text>
					</Pressable>
					{resend.isSuccess ? (
						<Text
							style={[formStyles.hint, { color: c.successText, fontSize: 13 }]}
							accessibilityLiveRegion="polite"
						>
							{t("checkout.codeSentAgain")}
						</Text>
					) : null}
					<FormError
						message={resend.error ? resolveErrorMessage(resend.error, t) : null}
					/>
				</View>
			) : null}
		</View>
	);
}
