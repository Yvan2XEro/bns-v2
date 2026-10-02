"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	type OrderActionTarget,
	useMarkDeliveryFailed,
	useReportFailedAttempt,
} from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	DELIVERY_FAILURE_REASONS,
	type DeliveryFailureValues,
	deliveryFailureSchema,
	optionalNote,
} from "../order-forms";
import { ReasonRadios } from "./reason-radios";

/** A first failed attempt, or the delivery given up on: same reasons, two routes. */
export function FailureDialog({
	mode,
	open,
	target,
	onClose,
}: {
	mode: "report_failed_attempt" | "mark_delivery_failed";
	open: boolean;
	target: OrderActionTarget;
	onClose: () => void;
}) {
	const t = useTranslations("SellerOrders");
	const tRoot = useTranslations();
	const report = useReportFailedAttempt(target);
	const markFailed = useMarkDeliveryFailed(target);
	const mutation = mode === "report_failed_attempt" ? report : markFailed;

	const form = useForm<DeliveryFailureValues>({
		resolver: zodResolver(deliveryFailureSchema),
		defaultValues: { note: "" },
	});
	const { errors } = form.formState;

	const close = () => {
		form.reset();
		report.reset();
		markFailed.reset();
		onClose();
	};

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			await mutation.mutateAsync({
				reason: values.reason,
				note: optionalNote(values.note),
			});
			close();
		} catch (error) {
			form.setError("root", {
				type: "server",
				message: resolveErrorMessage(error, tRoot, t("actionFailed")),
			});
		}
	});

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{mode === "report_failed_attempt"
							? t("reportFailedAttempt")
							: t("markFailed")}
					</DialogTitle>
					<DialogDescription>{t("failureBody")}</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4" noValidate>
					<ReasonRadios
						legend={t("failureReason")}
						name="reason"
						options={DELIVERY_FAILURE_REASONS.map((value) => ({
							value,
							label: tRoot(`OrderStatus.failure_${value}`),
						}))}
						register={form.register("reason")}
						error={errors.reason ? t("reasonRequired") : null}
					/>
					<label className="block space-y-1 text-sm">
						<span className="font-medium text-[#0F172A]">
							{t("noteOptional")}
						</span>
						<textarea
							{...form.register("note")}
							rows={3}
							maxLength={500}
							className="w-full rounded-lg border border-[#E2E8F0] p-3"
						/>
					</label>
					{errors.root?.message && (
						<p role="alert" className="text-red-700 text-sm">
							{errors.root.message}
						</p>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={close}>
							{t("dismiss")}
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{t("confirm")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
