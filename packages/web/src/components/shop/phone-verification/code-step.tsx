"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { type Control, Controller } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { VerificationCodeValues } from "~/lib/phone-verification";
import { formatCountdown } from "~/lib/phone-verification";

/**
 * Step 2: the 6-digit code, plus a resend link gated by the server's
 * cooldown. Kept apart from the orchestrator so the countdown re-render
 * (once a second while `wait > 0`) never forces the phone step above it to
 * re-render too.
 */
export function CodeStep({
	control,
	errorMessage,
	wait,
	resendDisabled,
	onResend,
	verifyPending,
	verifyDisabled,
}: {
	control: Control<VerificationCodeValues>;
	errorMessage?: string;
	/** Seconds left before a resend is allowed; 0 means it is. */
	wait: number;
	resendDisabled: boolean;
	onResend: () => void;
	verifyPending: boolean;
	verifyDisabled: boolean;
}) {
	const t = useTranslations("PhoneVerification");
	const resendLabel =
		wait > 0 ? t("resendIn", { time: formatCountdown(wait) }) : t("resendCode");

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="phone-verification-code">{t("codeLabel")}</Label>
				<Controller
					control={control}
					name="code"
					render={({ field }) => (
						<Input
							id="phone-verification-code"
							inputMode="numeric"
							autoComplete="one-time-code"
							maxLength={6}
							placeholder={t("codePlaceholder")}
							aria-invalid={Boolean(errorMessage)}
							value={field.value}
							onChange={(event) =>
								field.onChange(
									event.target.value.replace(/\D/g, "").slice(0, 6),
								)
							}
							onBlur={field.onBlur}
						/>
					)}
				/>
				{errorMessage && (
					<p className="text-[#991B1B] text-xs">{errorMessage}</p>
				)}
				<button
					type="button"
					disabled={wait > 0 || resendDisabled}
					onClick={onResend}
					className="text-[#1E40AF] text-xs underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[#94A3B8] disabled:no-underline"
				>
					{resendLabel}
				</button>
			</div>
			<Button
				type="submit"
				disabled={verifyDisabled}
				className="h-11 w-full rounded-xl bg-[#0F172A] font-semibold hover:bg-[#1E293B]"
			>
				{verifyPending && (
					<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
				)}
				{t("verify")}
			</Button>
		</div>
	);
}
