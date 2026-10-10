"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { ActionDialog, type DialogControl } from "~/components/action-dialog";
import { Button } from "~/components/ui/button";
import { useCancelOrder } from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	BUYER_CANCEL_REASONS,
	type CancelValues,
	cancelSchema,
} from "../purchase-view";

export function CancelDialog({
	orderId,
	...control
}: DialogControl & { orderId: string }) {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const cancel = useCancelOrder({ orderId });
	const { formState, handleSubmit, register, setError } = useForm<CancelValues>(
		{ resolver: zodResolver(cancelSchema) },
	);

	const onSubmit = handleSubmit(async (values) => {
		try {
			await cancel.mutateAsync(values);
			control.onOpenChange(false);
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<ActionDialog {...control} title={t("cancelConfirm")}>
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				<fieldset className="space-y-2">
					<legend className="mb-2 font-medium text-sm">
						{t("cancelReason")}
					</legend>
					{BUYER_CANCEL_REASONS.map((reason) => (
						<label
							key={reason.value}
							className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[#E2E8F0] px-3"
						>
							<input
								type="radio"
								value={reason.value}
								{...register("reason")}
							/>
							<span className="text-sm">{t(reason.labelKey)}</span>
						</label>
					))}
				</fieldset>
				{formState.errors.reason && (
					<p className="text-red-700 text-sm">{t("cancelReasonRequired")}</p>
				)}
				{formState.errors.root?.message && (
					<p role="alert" className="text-red-700 text-sm">
						{formState.errors.root.message}
					</p>
				)}
				<div className="flex flex-wrap justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						onClick={() => control.onOpenChange(false)}
					>
						{t("dismiss")}
					</Button>
					<Button
						type="submit"
						variant="destructive"
						className="min-h-11"
						disabled={cancel.isPending}
					>
						{t("cancelSubmit")}
					</Button>
				</div>
			</form>
		</ActionDialog>
	);
}
