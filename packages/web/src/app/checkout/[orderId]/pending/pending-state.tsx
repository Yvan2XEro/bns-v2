"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import {
	canResend,
	formatCountdown,
	resendWaitSeconds,
	secondsUntil,
} from "~/lib/payment-flow";
import {
	PAYMENT_CHANNEL_INSTRUCTIONS,
	PAYMENT_CHANNEL_LABELS,
	type PaymentChannel,
} from "~/lib/payment-status";

/**
 * The buyer is waiting on the operator's own prompt. `providerInstructions`
 * — carried over from the intent-creation response, see `pay-client.tsx` —
 * wins over the generic per-channel fallback when the provider sent one.
 */
export function PendingState({
	channel,
	expiresAt,
	providerInstructions,
	pendingSince,
	now,
	onResend,
	resending,
}: {
	channel: PaymentChannel;
	expiresAt: string;
	providerInstructions: string | null;
	pendingSince: number;
	now: number;
	onResend: () => void;
	resending: boolean;
}) {
	const t = useTranslations("Payments");
	const secondsLeft = secondsUntil(expiresAt, now);
	const waitSeconds = resendWaitSeconds(pendingSince, now);
	const ready = canResend(pendingSince, now);

	return (
		<div className="space-y-5 text-center">
			<LoaderCircle className="mx-auto h-10 w-10 animate-spin text-[#1E40AF]" />
			<h1 className="font-bold text-2xl text-[#0F172A]">
				{t("pending_title")}
			</h1>
			<p className="font-semibold text-[#0F172A] text-lg">
				{t("pending_expiresIn", { time: formatCountdown(secondsLeft) })}
			</p>
			<div className="space-y-1 rounded-2xl border border-[#E2E8F0] p-4 text-left text-sm">
				<p className="font-medium text-[#0F172A]">
					{t(PAYMENT_CHANNEL_LABELS[channel])}
				</p>
				<p className="text-[#334155]">
					{providerInstructions ?? t(PAYMENT_CHANNEL_INSTRUCTIONS[channel])}
				</p>
			</div>
			<p className="text-[#64748B] text-sm">{t("pending_checking")}</p>
			<Button
				type="button"
				variant="outline"
				className="min-h-11"
				disabled={!ready || resending}
				onClick={onResend}
			>
				{resending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
				{ready
					? t("pending_noPrompt")
					: t("pending_noPromptWait", {
							time: formatCountdown(waitSeconds),
						})}
			</Button>
		</div>
	);
}
