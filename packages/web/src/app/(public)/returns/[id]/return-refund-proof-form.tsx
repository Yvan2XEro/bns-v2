"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { useReturnAction } from "~/hooks/use-returns";
import { resolveErrorMessage } from "~/lib/apiError";
import { REFUND_METHOD_LABELS } from "~/lib/case-status";
import {
	RETURN_REFUND_METHODS,
	type ReturnRefundProofFormInput,
	type ReturnRefundProofInput,
	returnRefundProofFormSchema,
} from "../../../../../../api/src/contracts/returnInputs";
import type { ReturnCaseView } from "../../../../../../api/src/contracts/returns";
import { ReturnEvidenceUpload } from "./return-evidence-upload";

export function ReturnRefundProofForm({ view }: { view: ReturnCaseView }) {
	const t = useTranslations("Returns");
	const tRoot = useTranslations();
	const submit = useReturnAction();
	const form = useForm<
		ReturnRefundProofFormInput,
		undefined,
		ReturnRefundProofInput
	>({
		resolver: zodResolver(returnRefundProofFormSchema),
		defaultValues: {
			method: "cash",
			amount: String(view.refund.amount),
			transactionId: "",
			evidenceIds: [],
		},
	});
	return (
		<form
			className="space-y-4"
			onSubmit={form.handleSubmit(async (body) => {
				if (body.amount < view.refund.amount) {
					form.setError("amount", {
						message: t("refundTooLow", { amount: view.refund.amount }),
					});
					return;
				}
				try {
					await submit.mutateAsync({
						caseId: view.id,
						action: "refund_proof",
						body,
					});
				} catch (error) {
					form.setError("root", { message: resolveErrorMessage(error, tRoot) });
				}
			})}
		>
			<h3 className="font-medium">{t("action.refund_proof")}</h3>
			<p className="text-[#64748B] text-sm">{t("refundProofInstructions")}</p>
			<label className="block text-sm">
				{t("refundMethod")}
				<select
					{...form.register("method")}
					className="mt-1 block min-h-11 w-full rounded-lg border px-2"
				>
					{RETURN_REFUND_METHODS.map((method) => (
						<option key={method} value={method}>
							{t(REFUND_METHOD_LABELS[method])}
						</option>
					))}
				</select>
			</label>
			<label className="block text-sm">
				{t("refundAmountLabel")}
				<input
					{...form.register("amount")}
					inputMode="numeric"
					className="mt-1 block min-h-11 w-full rounded-lg border px-2"
					aria-invalid={Boolean(form.formState.errors.amount)}
				/>
			</label>
			<label className="block text-sm">
				{t("transactionId")}
				<input
					{...form.register("transactionId")}
					maxLength={200}
					className="mt-1 block min-h-11 w-full rounded-lg border px-2"
					aria-invalid={Boolean(form.formState.errors.transactionId)}
				/>
			</label>
			<Controller
				control={form.control}
				name="evidenceIds"
				render={({ field }) => (
					<ReturnEvidenceUpload
						caseId={view.id}
						kind="payment_proof"
						evidenceIds={field.value}
						onChange={field.onChange}
					/>
				)}
			/>
			{Object.keys(form.formState.errors).length ? (
				<p role="alert" className="text-red-700 text-sm">
					{form.formState.errors.root?.message ?? t("refundProofValidation")}
				</p>
			) : null}
			<button
				type="submit"
				disabled={submit.isPending}
				className="min-h-11 rounded-xl bg-[#1E40AF] px-4 font-medium text-sm text-white disabled:opacity-50"
			>
				{t("action.refund_proof")}
			</button>
		</form>
	);
}
