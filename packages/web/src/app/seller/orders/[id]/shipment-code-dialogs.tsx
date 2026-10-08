"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useShipmentAction } from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type HandoverCodeValues,
	handoverCodeSchema,
} from "~/lib/shipment-panel";
import { ActionDialog } from "../../../purchases/[id]/action-dialog";
import { ProofPhotoField } from "./proof-photo-field";

interface Props {
	shopId: string;
	orderId: string;
	shipmentId: string;
	onClose: () => void;
}

/** The buyer's four digits, plus an optional photo; wrong codes count against the order's own attempts. */
export function ShipmentHandoverDialog({
	shopId,
	orderId,
	shipmentId,
	onClose,
}: Props) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const action = useShipmentAction(shopId, orderId);
	const [photoId, setPhotoId] = useState<string | null>(null);
	const { register, handleSubmit, formState } = useForm<HandoverCodeValues>({
		resolver: zodResolver(handoverCodeSchema),
		defaultValues: { code: "" },
	});
	const onSubmit = handleSubmit(({ code }) =>
		action.mutate(
			{
				shipmentId,
				action: "handover",
				body: { code, ...(photoId ? { photoId } : {}) },
			},
			{ onSuccess: onClose },
		),
	);
	return (
		<ActionDialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={t("handoverTitle")}
			description={t("handoverBody")}
		>
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				<div className="space-y-1.5">
					<label htmlFor="shipment-code" className="block font-medium text-sm">
						{t("handoverCode")}
					</label>
					<Input
						id="shipment-code"
						inputMode="numeric"
						maxLength={4}
						autoComplete="one-time-code"
						{...register("code")}
					/>
					{formState.errors.code && (
						<p className="text-red-600 text-xs">{t("codeFormat")}</p>
					)}
				</div>
				<ProofPhotoField
					shipmentId={shipmentId}
					kind="handover"
					photoId={photoId}
					onChange={setPhotoId}
				/>
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
						{t("handoverSubmit")}
					</Button>
				</div>
			</form>
		</ActionDialog>
	);
}

/** The weaker proof: a photo is required and the buyer can contest it for 48 hours. */
export function ShipmentDeclareDialog({
	shopId,
	orderId,
	shipmentId,
	onClose,
}: Props) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const action = useShipmentAction(shopId, orderId);
	const [photoId, setPhotoId] = useState<string | null>(null);
	const [note, setNote] = useState("");
	return (
		<ActionDialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={t("declareTitle")}
			description={t("declareBody")}
		>
			<div className="space-y-4">
				<p className="rounded-xl bg-[#FFFBEB] p-3 text-[#92400E] text-sm">
					{t("declareWarning")}
				</p>
				<ProofPhotoField
					shipmentId={shipmentId}
					kind="declaration"
					photoId={photoId}
					onChange={setPhotoId}
					required
				/>
				<div className="space-y-1.5">
					<label
						htmlFor="shipment-declare-note"
						className="block font-medium text-sm"
					>
						{t("note")}
					</label>
					<Textarea
						id="shipment-declare-note"
						rows={2}
						maxLength={300}
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				</div>
				{action.isError && (
					<p role="alert" className="text-red-700 text-sm">
						{resolveErrorMessage(action.error, tRoot)}
					</p>
				)}
				<div className="flex justify-end">
					<Button
						className="min-h-11"
						disabled={!photoId || action.isPending}
						onClick={() =>
							action.mutate(
								{
									shipmentId,
									action: "declare_delivered",
									body: {
										photoId: photoId ?? "",
										...(note.trim() ? { note: note.trim() } : {}),
									},
								},
								{ onSuccess: onClose },
							)
						}
					>
						{t("declareSubmit")}
					</Button>
				</div>
			</div>
		</ActionDialog>
	);
}
