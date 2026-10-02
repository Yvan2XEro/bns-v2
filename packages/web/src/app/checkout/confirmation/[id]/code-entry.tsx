"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	availableActions,
	useConfirmOrderCode,
	useResendConfirmationCode,
} from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type ConfirmationCodeValues,
	confirmationCodeSchema,
	resendSecondsLeft,
} from "~/lib/checkout-form";
import type { OrderView } from "~/types/order";

/**
 * The SMS-code outcome. Which of "confirm" and "resend" exist comes from the
 * action table, so the attempts and resends left — not this screen — decide.
 */
export function CodeEntry({
	order,
	onAttempt,
}: {
	order: OrderView;
	onAttempt: () => void;
}) {
	const t = useTranslations("Checkout");
	const tRoot = useTranslations();
	const target = { orderId: order.id };
	const confirm = useConfirmOrderCode(target);
	const resend = useResendConfirmationCode(target);
	const actions = availableActions(order, "buyer");
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

	const { formState, handleSubmit, register, setError } =
		useForm<ConfirmationCodeValues>({
			resolver: zodResolver(confirmationCodeSchema),
			defaultValues: { code: "" },
		});

	const onSubmit = handleSubmit((values) =>
		confirm.mutate(
			{ code: values.code.trim() },
			{
				onError: (error) => {
					setError("code", { message: resolveErrorMessage(error, tRoot) });
					// A wrong code spends an attempt server-side.
					onAttempt();
				},
			},
		),
	);

	const codeError = formState.errors.code?.message;

	return (
		<div className="space-y-4">
			<p className="text-[#334155] text-sm">{t("codeBody")}</p>
			<p className="text-[#64748B] text-sm">
				{t("codeSent", { phone: order.delivery.phone })}
			</p>
			{actions.includes("confirm_code") ? (
				<form noValidate onSubmit={onSubmit} className="space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="confirmation-code">{t("codeLabel")}</Label>
						<Input
							id="confirmation-code"
							inputMode="numeric"
							autoComplete="one-time-code"
							maxLength={6}
							className="h-11 text-lg tracking-[0.4em]"
							aria-invalid={Boolean(codeError)}
							{...register("code")}
						/>
						{codeError && (
							<p role="alert" className="text-red-600 text-xs">
								{codeError === "errorCode" ? t("errorCode") : codeError}
							</p>
						)}
						<p className="text-[#64748B] text-xs">
							{t("attemptsLeft", { count: order.confirmation.attemptsLeft })}
						</p>
					</div>
					<Button
						type="submit"
						className="min-h-11 w-full bg-[#1E40AF] hover:bg-[#1E3A8A]"
						disabled={confirm.isPending}
					>
						{confirm.isPending && (
							<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
						)}
						{t("confirmCode")}
					</Button>
				</form>
			) : (
				<p className="text-[#92400E] text-sm">{t("noMoreAttempts")}</p>
			)}
			{actions.includes("resend_code") && (
				<div className="space-y-1">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						disabled={secondsLeft > 0 || resend.isPending}
						onClick={() =>
							resend.mutate(undefined, {
								onSuccess: () => {
									const sent = new Date();
									setLastSentAt(sent);
									setNow(sent);
								},
							})
						}
					>
						{secondsLeft > 0
							? t("resendIn", { seconds: secondsLeft })
							: t("resendCode")}
					</Button>
					{resend.isSuccess && (
						<p className="text-[#166534] text-sm">{t("codeSentAgain")}</p>
					)}
					{resend.error && (
						<p role="alert" className="text-red-600 text-sm">
							{resolveErrorMessage(resend.error, tRoot)}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
