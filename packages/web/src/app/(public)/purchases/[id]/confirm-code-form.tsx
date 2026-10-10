"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
	useConfirmOrderCode,
	useResendConfirmationCode,
} from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import { type ConfirmCodeValues, confirmCodeSchema } from "../purchase-view";

/** Each half renders only when `availableActions` offers it. */
export function ConfirmCodeForm({
	orderId,
	canConfirm,
	canResend,
}: {
	orderId: string;
	canConfirm: boolean;
	canResend: boolean;
}) {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const confirm = useConfirmOrderCode({ orderId });
	const resend = useResendConfirmationCode({ orderId });
	const { formState, handleSubmit, register, setError } =
		useForm<ConfirmCodeValues>({
			resolver: zodResolver(confirmCodeSchema),
			defaultValues: { code: "" },
		});

	const onSubmit = handleSubmit(async (values) => {
		try {
			await confirm.mutateAsync(values);
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<section className="space-y-3 rounded-2xl border-2 border-[#F59E0B] bg-[#FFFBEB] p-5">
			<h2 className="font-semibold text-[#0F172A]">{t("confirmCodeTitle")}</h2>
			<p className="text-[#334155] text-sm">{t("confirmCodeBody")}</p>
			{canConfirm && (
				<form
					onSubmit={onSubmit}
					className="flex flex-wrap items-end gap-2"
					noValidate
				>
					<div className="space-y-1.5">
						<label htmlFor="confirm-code" className="block font-medium text-sm">
							{t("confirmCodeLabel")}
						</label>
						<Input
							id="confirm-code"
							inputMode="numeric"
							autoComplete="one-time-code"
							maxLength={6}
							className="h-11 w-40 bg-white font-mono text-lg tracking-widest"
							{...register("code")}
						/>
					</div>
					<Button
						type="submit"
						className="min-h-11"
						disabled={confirm.isPending}
					>
						{t("confirmCodeSubmit")}
					</Button>
				</form>
			)}
			{formState.errors.code && (
				<p className="text-red-700 text-sm">{t("confirmCodeInvalid")}</p>
			)}
			{formState.errors.root?.message && (
				<p role="alert" className="text-red-700 text-sm">
					{formState.errors.root.message}
				</p>
			)}
			{canResend && (
				<Button
					variant="link"
					className="min-h-11 px-0"
					disabled={resend.isPending}
					onClick={() => resend.mutate()}
				>
					{t("resendCode")}
				</Button>
			)}
			{resend.isSuccess && (
				<output className="block text-green-700 text-sm">
					{t("resendCodeSent")}
				</output>
			)}
			{resend.isError && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(resend.error, tRoot)}
				</p>
			)}
		</section>
	);
}
