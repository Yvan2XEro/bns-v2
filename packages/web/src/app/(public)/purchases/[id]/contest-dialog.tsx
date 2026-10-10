"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useContestDelivery } from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import { type ContestValues, contestSchema } from "../purchase-view";
import { ActionDialog, type DialogControl } from "./action-dialog";

/** Only ever opened from the action bar, which offers it for a seller declaration before `contestBy`. */
export function ContestDialog({
	orderId,
	contestBy,
	...control
}: DialogControl & { orderId: string; contestBy: string | null }) {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const contest = useContestDelivery({ orderId });
	const { formState, handleSubmit, register, setError } =
		useForm<ContestValues>({
			resolver: zodResolver(contestSchema),
			defaultValues: { note: "" },
		});

	const onSubmit = handleSubmit(async ({ note }) => {
		try {
			await contest.mutateAsync(note ? { note } : {});
			control.onOpenChange(false);
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<ActionDialog
			{...control}
			title={t("contestDelivery")}
			description={t("contestBody")}
		>
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				{contestBy && (
					<p className="text-[#64748B] text-sm">
						{t("contestWindow", { date: formatOrderDate(contestBy, locale) })}
					</p>
				)}
				<div className="space-y-1.5">
					<label htmlFor="contest-note" className="block font-medium text-sm">
						{t("contestNote")}
					</label>
					<Textarea id="contest-note" rows={4} {...register("note")} />
				</div>
				{formState.errors.root?.message && (
					<p role="alert" className="text-red-700 text-sm">
						{formState.errors.root.message}
					</p>
				)}
				<div className="flex justify-end">
					<Button
						type="submit"
						className="min-h-11"
						disabled={contest.isPending}
					>
						{t("contestSubmit")}
					</Button>
				</div>
			</form>
		</ActionDialog>
	);
}
