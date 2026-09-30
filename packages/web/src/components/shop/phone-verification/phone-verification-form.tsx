"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { PhoneInput } from "~/components/ui/phone-input";
import { usePhoneStatus } from "~/hooks/use-phone-status";
import {
	useStartPhoneVerification,
	useVerifyPhoneVerificationCode,
} from "~/hooks/use-phone-verification";
import { ApiError, ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import {
	CODE_FIELD_ERROR_CODES,
	type PhoneNumberValues,
	phoneNumberSchema,
	secondsUntil,
	type VerificationCodeValues,
	verificationCodeSchema,
} from "~/lib/phone-verification";
import { CodeStep } from "./code-step";

/**
 * The one OTP-verification implementation in the codebase: `/settings` and
 * the `/shop/new` dialog both render this. The server is the source of
 * truth throughout — step (phone vs. code), resend timing and the pending
 * phone all come from `usePhoneStatus`, never from local state.
 */
export function PhoneVerificationForm({
	onVerified,
	showStatusSummary = false,
}: {
	onVerified?: () => void;
	showStatusSummary?: boolean;
}) {
	const t = useTranslations("PhoneVerification");
	const tRoot = useTranslations();
	const status = usePhoneStatus();
	const start = useStartPhoneVerification();
	const verify = useVerifyPhoneVerificationCode();
	const [now, setNow] = useState(() => Date.now());

	const phoneForm = useForm<PhoneNumberValues>({
		resolver: zodResolver(phoneNumberSchema),
		defaultValues: { phone: "" },
	});
	const codeForm = useForm<VerificationCodeValues>({
		resolver: zodResolver(verificationCodeSchema),
		defaultValues: { code: "" },
	});

	// Keeps the phone field in step with the server rather than owning its
	// own copy: a fresh load, a resend, or the field clearing itself after an
	// expiry all flow through `status.data` and land here.
	const resetPhone = phoneForm.reset;
	useEffect(() => {
		resetPhone({
			phone: status.data?.pendingPhone ?? status.data?.phone ?? "",
		});
	}, [status.data?.pendingPhone, status.data?.phone, resetPhone]);

	// Re-renders once a second so `wait` stays accurate across a remount or a
	// backgrounded tab; it is recomputed from `resendAvailableAt` on every
	// tick, never counted down locally (see src/lib/phone-verification.ts).
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	const pending = Boolean(status.data?.hasPendingVerification);
	const wait = secondsUntil(status.data?.resendAvailableAt ?? null, now);
	const banner =
		codeForm.formState.errors.root?.message ??
		phoneForm.formState.errors.root?.message;

	const submitPhone = phoneForm.handleSubmit(async (values) => {
		try {
			await start.mutateAsync(values.phone);
			codeForm.clearErrors();
			codeForm.reset({ code: "" });
		} catch (error) {
			const code = error instanceof ApiError ? error.code : "";
			phoneForm.setError(code === ERROR_CODES.phoneInvalid ? "phone" : "root", {
				type: "server",
				message: resolveErrorMessage(error, tRoot),
			});
		}
	});

	const submitCode = codeForm.handleSubmit(async (values) => {
		try {
			await verify.mutateAsync(values.code);
			phoneForm.clearErrors();
			codeForm.reset({ code: "" });
			onVerified?.();
		} catch (error) {
			const code = error instanceof ApiError ? error.code : "";
			codeForm.setError(CODE_FIELD_ERROR_CODES.has(code) ? "code" : "root", {
				type: "server",
				message: resolveErrorMessage(error, tRoot),
			});
		}
	});

	// A client-side schema rejection (too short, wrong shape) and a server
	// refusal both land in `formState.errors`, but only the server's own
	// wording may ever reach the screen verbatim — the local one always shows
	// a translated hint instead, tagged by the `type: "server"` set above.
	const phoneFieldError = phoneForm.formState.errors.phone;
	const phoneFieldMessage = phoneFieldError
		? phoneFieldError.type === "server"
			? phoneFieldError.message
			: t("phoneFormatInvalid")
		: undefined;
	const codeFieldError = codeForm.formState.errors.code;
	const codeFieldMessage = codeFieldError
		? codeFieldError.type === "server"
			? codeFieldError.message
			: t("codeFormatInvalid")
		: undefined;

	if (status.isPending) {
		return <div className="h-24 animate-pulse rounded-xl bg-[#F1F5F9]" />;
	}

	return (
		<div className="space-y-4">
			{showStatusSummary && status.data?.phone && (
				<div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
					<p className="text-[#64748B] text-sm">{t("currentPhone")}</p>
					<p className="mt-1 font-medium text-[#0F172A]">{status.data.phone}</p>
					<p className="mt-1 text-[#64748B] text-xs">
						{status.data.isPhoneVerified
							? t("verifiedBadge")
							: t("notVerifiedBadge")}
					</p>
				</div>
			)}

			<form
				onSubmit={(event) => {
					// Radix's Dialog renders this form through a Portal: the DOM tree
					// splits from the shop-creation form outside the dialog, but React
					// still propagates the submit event along the React tree, into
					// that outer form's onSubmit. Stop it explicitly.
					event.stopPropagation();
					void submitPhone(event);
				}}
				className="space-y-2"
				noValidate
			>
				<Label htmlFor="phone-verification-phone">{t("phoneLabel")}</Label>
				<Controller
					control={phoneForm.control}
					name="phone"
					render={({ field }) => (
						<PhoneInput
							id="phone-verification-phone"
							placeholder={t("phonePlaceholder")}
							disabled={pending}
							aria-invalid={Boolean(phoneFieldMessage)}
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
						/>
					)}
				/>
				{phoneFieldMessage && (
					<p className="text-[#991B1B] text-xs">{phoneFieldMessage}</p>
				)}
				{!pending && (
					<Button
						type="submit"
						disabled={start.isPending}
						className="h-11 w-full rounded-xl bg-[#1E40AF] font-semibold hover:bg-[#1E3A8A]"
					>
						{start.isPending && (
							<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
						)}
						{t("sendCode")}
					</Button>
				)}
			</form>

			{pending && (
				<form
					onSubmit={(event) => {
						// Same portal-vs-React-tree bubbling as the phone form above.
						event.stopPropagation();
						void submitCode(event);
					}}
					noValidate
				>
					<CodeStep
						control={codeForm.control}
						errorMessage={codeFieldMessage}
						wait={wait}
						resendDisabled={start.isPending}
						onResend={() => void submitPhone()}
						verifyPending={verify.isPending}
						verifyDisabled={verify.isPending || start.isPending}
					/>
				</form>
			)}

			{banner && (
				<p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm">
					{banner}
				</p>
			)}
		</div>
	);
}
