"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { useReturnAction } from "~/hooks/use-returns";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	createReturnInspectionFormSchema,
	RETURN_INSPECTION_OUTCOMES,
	type ReturnInspectionFormInput,
	type ReturnInspectionFormOutput,
} from "../../../../../api/src/contracts/returnInputs";
import type { ReturnCaseView } from "../../../../../api/src/contracts/returns";
import { ReturnEvidenceUpload } from "./return-evidence-upload";

export function ReturnInspectionForm({ view }: { view: ReturnCaseView }) {
	const t = useTranslations("Returns");
	const tRoot = useTranslations();
	const submit = useReturnAction();
	const form = useForm<
		ReturnInspectionFormInput,
		undefined,
		ReturnInspectionFormOutput
	>({
		resolver: zodResolver(
			createReturnInspectionFormSchema(view.basis, view.items),
		),
		defaultValues: {
			items: view.items.map((item) => ({
				orderItemId: item.orderItemId,
				outcome: "",
				deductionAmount: "0",
				note: "",
				evidenceIds: [],
			})),
		},
	});
	return (
		<form
			className="space-y-4"
			onSubmit={form.handleSubmit(async (body) => {
				try {
					await submit.mutateAsync({
						caseId: view.id,
						action: "inspect",
						body,
					});
				} catch (error) {
					form.setError("root", { message: resolveErrorMessage(error, tRoot) });
				}
			})}
		>
			<h3 className="font-medium">{t("inspect")}</h3>
			{view.items.map((item, index) => {
				const errors = form.formState.errors.items?.[index];
				return (
					<fieldset
						key={item.orderItemId}
						className="space-y-3 rounded-xl border border-[#E2E8F0] p-4"
					>
						<legend className="font-medium text-sm">
							{item.title} × {item.quantity}
						</legend>
						<input
							type="hidden"
							{...form.register(`items.${index}.orderItemId`)}
						/>
						<label className="block text-sm">
							{t("inspectionOutcome")}
							<select
								{...form.register(`items.${index}.outcome`)}
								className="mt-1 block min-h-11 w-full rounded-lg border px-2"
								aria-invalid={Boolean(errors?.outcome)}
							>
								<option value="">{t("chooseInspection")}</option>
								{RETURN_INSPECTION_OUTCOMES.map((outcome) => (
									<option key={outcome} value={outcome}>
										{t(`inspection.${outcome}`)}
									</option>
								))}
							</select>
						</label>
						<label className="block text-sm">
							{t("deductionAmount")}
							<input
								{...form.register(`items.${index}.deductionAmount`)}
								inputMode="numeric"
								readOnly={view.basis === "non_conformity"}
								className="mt-1 block min-h-11 w-full rounded-lg border px-2 read-only:bg-[#F1F5F9]"
								aria-invalid={Boolean(errors?.deductionAmount)}
							/>
						</label>
						{view.basis === "non_conformity" ? (
							<p className="text-[#64748B] text-sm">
								{t("deductionUnavailable")}
							</p>
						) : null}
						<label className="block text-sm">
							{t("inspectionNote")}
							<textarea
								{...form.register(`items.${index}.note`)}
								maxLength={1000}
								className="mt-1 block min-h-20 w-full rounded-lg border p-2"
								aria-invalid={Boolean(errors?.note)}
							/>
						</label>
						<Controller
							control={form.control}
							name={`items.${index}.evidenceIds`}
							render={({ field }) => (
								<ReturnEvidenceUpload
									caseId={view.id}
									kind="photo"
									evidenceIds={field.value}
									onChange={field.onChange}
								/>
							)}
						/>
						{errors ? (
							<p role="alert" className="text-red-700 text-sm">
								{t("inspectionValidation")}
							</p>
						) : null}
					</fieldset>
				);
			})}
			{form.formState.errors.root ? (
				<p role="alert" className="text-red-700 text-sm">
					{form.formState.errors.root.message}
				</p>
			) : null}
			<button
				type="submit"
				disabled={submit.isPending}
				className="min-h-11 rounded-xl bg-[#1E40AF] px-4 font-medium text-sm text-white disabled:opacity-50"
			>
				{t("action.inspect")}
			</button>
		</form>
	);
}
