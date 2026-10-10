"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ActionDialog } from "~/components/action-dialog";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useShipmentAction } from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	ATTEMPT_REASONS,
	type AttemptValues,
	attemptSchema,
} from "~/lib/shipment-panel";
import { FAILURE_REASON_LABELS } from "~/lib/shipment-status";
import { ProofPhotoField } from "./proof-photo-field";

/**
 * One reason sheet for the two actions that need one: a failed attempt (note
 * and photo welcome) and "parcel back" for a shipment whose failure is not
 * final yet, which the route finalises and returns in one step.
 */
export function ShipmentReasonDialog({
	shopId,
	orderId,
	shipmentId,
	mode,
	onClose,
}: {
	shopId: string;
	orderId: string;
	shipmentId: string;
	mode: "attempt" | "return";
	onClose: () => void;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const action = useShipmentAction(shopId, orderId);
	const [photoId, setPhotoId] = useState<string | null>(null);
	const { register, handleSubmit } = useForm<AttemptValues>({
		resolver: zodResolver(attemptSchema),
		defaultValues: {
			reason: mode === "return" ? "refused" : "absent",
			note: "",
		},
	});
	const onSubmit = handleSubmit(({ reason, note }) =>
		action.mutate(
			mode === "return"
				? { shipmentId, action: "mark_returned", body: { reason } }
				: {
						shipmentId,
						action: "report_attempt",
						body: {
							reason,
							...(note ? { note } : {}),
							...(photoId ? { photoId } : {}),
						},
					},
			{ onSuccess: onClose },
		),
	);
	return (
		<ActionDialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={mode === "return" ? t("returnTitle") : t("attemptTitle")}
			description={mode === "return" ? t("returnBody") : t("attemptBody")}
		>
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				<fieldset className="space-y-1">
					<legend className="font-medium text-sm">{t("reason")}</legend>
					{ATTEMPT_REASONS.map((reason) => (
						<label
							key={reason}
							className="flex min-h-11 items-center gap-3 text-sm"
						>
							<input
								type="radio"
								value={reason}
								className="h-5 w-5 accent-[#1E40AF]"
								{...register("reason")}
							/>
							{tRoot(`Delivery.${FAILURE_REASON_LABELS[reason]}`)}
						</label>
					))}
				</fieldset>
				{mode === "attempt" && (
					<>
						<div className="space-y-1.5">
							<label
								htmlFor="shipment-attempt-note"
								className="block font-medium text-sm"
							>
								{t("note")}
							</label>
							<Textarea
								id="shipment-attempt-note"
								rows={2}
								{...register("note")}
							/>
						</div>
						<ProofPhotoField
							shipmentId={shipmentId}
							kind="attempt"
							photoId={photoId}
							onChange={setPhotoId}
						/>
					</>
				)}
				{action.isError && (
					<p role="alert" className="text-red-700 text-sm">
						{resolveErrorMessage(action.error, tRoot)}
					</p>
				)}
				<div className="flex justify-end">
					<Button
						type="submit"
						className="min-h-11"
						disabled={action.isPending}
					>
						{t("confirm")}
					</Button>
				</div>
			</form>
		</ActionDialog>
	);
}
