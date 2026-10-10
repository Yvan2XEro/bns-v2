"use client";

import { useTranslations } from "next-intl";
import type { UseFormRegister } from "react-hook-form";
import { type Control, Controller, type FieldErrors } from "react-hook-form";
import { PhoneInput } from "~/components/ui/phone-input";
import type { PayAttemptValues } from "~/lib/payment-flow";
import { PAYMENT_CHANNEL_LABELS } from "~/lib/payment-status";
import { Field } from "../form-field";

/**
 * The operator-choice + phone fields, shared by `/pay`'s first attempt and
 * `/pending`'s failed-state "use another number or operator" form — the one
 * place either screen asks the buyer which channel and number to charge.
 */
export function AttemptFields({
	control,
	register,
	errors,
	disabled,
}: {
	control: Control<PayAttemptValues>;
	register: UseFormRegister<PayAttemptValues>;
	errors: FieldErrors<PayAttemptValues>;
	disabled?: boolean;
}) {
	const t = useTranslations("Payments");
	const tRoot = useTranslations();

	return (
		<>
			<fieldset disabled={disabled} className="space-y-2 disabled:opacity-50">
				<legend className="font-medium text-sm">{t("pay_operator")}</legend>
				{(
					Object.keys(PAYMENT_CHANNEL_LABELS) as Array<
						keyof typeof PAYMENT_CHANNEL_LABELS
					>
				).map((channel) => (
					<label
						key={channel}
						className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[#E2E8F0] px-3"
					>
						<input type="radio" value={channel} {...register("channel")} />
						<span className="text-sm">
							{t(PAYMENT_CHANNEL_LABELS[channel])}
						</span>
					</label>
				))}
				{errors.channel && (
					<p role="alert" className="text-red-700 text-xs">
						{tRoot("PaymentsPay.operatorRequired")}
					</p>
				)}
			</fieldset>

			<Field
				id="attempt-phone"
				label={t("pay_phone")}
				hint={t("pay_phoneHint")}
				error={errors.phone ? tRoot("Checkout.errorPhone") : undefined}
			>
				<Controller
					control={control}
					name="phone"
					render={({ field }) => (
						<PhoneInput
							id="attempt-phone"
							disabled={disabled}
							value={field.value}
							onChange={field.onChange}
						/>
					)}
				/>
			</Field>
		</>
	);
}
