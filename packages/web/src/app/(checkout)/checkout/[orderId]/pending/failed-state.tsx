"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { type ApiError, resolveErrorMessage } from "~/lib/apiError";
import {
	type FailedAction,
	type PayAttemptValues,
	payAttemptSchema,
} from "~/lib/payment-flow";
import {
	PAYMENT_CHANNEL_LABELS,
	PAYMENT_FAILURE_MESSAGES,
	type PaymentChannel,
	type PaymentFailureCode,
} from "~/lib/payment-status";
import { AttemptFields } from "../attempt-fields";

/**
 * The failed screen, "on the same route" as pending (the P5 design doc's own
 * words): a per-`failureCode` sentence, attempts left, and whichever of
 * "Try again" / "Use another number or operator" / "Pay on delivery
 * instead" `failedActions` offers. "Try again" resubmits with the same
 * channel and phone the buyer already confirmed; "Use another number or
 * operator" reveals the same two fields, editable, with the operator
 * forgotten first.
 */
export function FailedState({
	failureCode,
	channel,
	attemptsLeft,
	defaultPhone,
	actions,
	onRetrySame,
	onSubmitAttempt,
	submitting,
	submitError,
	onPayOnDelivery,
	cancelPending,
}: {
	failureCode: PaymentFailureCode;
	channel: PaymentChannel;
	attemptsLeft: number;
	defaultPhone: string;
	actions: FailedAction[];
	onRetrySame: () => void;
	onSubmitAttempt: (values: PayAttemptValues) => void;
	submitting: boolean;
	submitError: ApiError | null;
	onPayOnDelivery: () => void;
	cancelPending: boolean;
}) {
	const t = useTranslations("Payments");
	// Bound to no namespace, called with full dotted paths — see
	// `pay-client.tsx`'s comment on the same choice: a second namespace-bound
	// translator in this file would make the locale gate check every
	// `Payments.*` call above against it too.
	const tRoot = useTranslations();
	const [editing, setEditing] = useState(false);

	const { control, formState, handleSubmit, register, reset } =
		useForm<PayAttemptValues>({
			resolver: zodResolver(payAttemptSchema),
			defaultValues: { phone: defaultPhone },
		});

	const openEditor = () => {
		reset({ phone: defaultPhone });
		setEditing(true);
	};

	const submit = handleSubmit((values) => onSubmitAttempt(values));

	return (
		<div className="space-y-5 text-center">
			<h1 className="font-bold text-2xl text-[#0F172A]">{t("failed_title")}</h1>
			<p className="text-[#64748B] text-sm">
				{t(PAYMENT_CHANNEL_LABELS[channel])}
			</p>
			<p className="text-[#334155] text-sm">
				{t(PAYMENT_FAILURE_MESSAGES[failureCode])}
			</p>
			<p className="text-[#64748B] text-sm">
				{t("failed_attemptsLeft", { attempts: attemptsLeft })}
			</p>

			{submitError && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(submitError, tRoot)}
				</p>
			)}

			{!editing && (
				<div className="flex flex-col gap-3">
					{actions.includes("retry") && (
						<Button
							type="button"
							className="min-h-11 bg-[#1E40AF] hover:bg-[#1E3A8A]"
							disabled={submitting}
							onClick={onRetrySame}
						>
							{submitting && (
								<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
							)}
							{t("failed_retry")}
						</Button>
					)}
					{actions.includes("changeOperator") && (
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={openEditor}
						>
							{t("failed_changeNumber")}
						</Button>
					)}
					{actions.includes("payOnDelivery") && (
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							disabled={cancelPending}
							onClick={onPayOnDelivery}
						>
							{t("pay_payOnDelivery")}
						</Button>
					)}
				</div>
			)}

			{editing && (
				<form onSubmit={submit} className="space-y-4 text-left" noValidate>
					<AttemptFields
						control={control}
						register={register}
						errors={formState.errors}
					/>
					<Button
						type="submit"
						className="min-h-11 w-full bg-[#1E40AF] hover:bg-[#1E3A8A]"
						disabled={submitting}
					>
						{submitting && (
							<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
						)}
						{t("failed_retry")}
					</Button>
				</form>
			)}
		</div>
	);
}
