"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { PhoneInput } from "~/components/ui/phone-input";
import { useAssignRider } from "~/hooks/use-shop-shipments";
import { useShopTeam } from "~/hooks/use-shop-team";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type ExternalRiderValues,
	externalRiderSchema,
} from "~/lib/shipment-panel";
import { ActionDialog } from "../../../(public)/purchases/[id]/action-dialog";

/** A team member rides under their own account; anyone else is a name and a phone the link is texted to. */
export function ShipmentRiderDialog({
	shopId,
	orderId,
	shipmentId,
	onClose,
}: {
	shopId: string;
	orderId: string;
	shipmentId: string;
	onClose: () => void;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const team = useShopTeam(shopId);
	const assign = useAssignRider(shopId, orderId);
	const [userId, setUserId] = useState("");
	const { register, control, handleSubmit, formState } =
		useForm<ExternalRiderValues>({
			resolver: zodResolver(externalRiderSchema),
			defaultValues: { name: "", phone: "" },
		});
	const members = team.data?.members ?? [];

	const onExternal = handleSubmit(({ name, phone }) =>
		assign.mutate({ shipmentId, name, phone }, { onSuccess: onClose }),
	);

	return (
		<ActionDialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={t("riderTitle")}
			description={t("riderBody")}
		>
			<div className="space-y-5">
				<section className="space-y-2">
					<h3 className="font-medium text-sm">{t("riderMember")}</h3>
					<select
						aria-label={t("riderMember")}
						value={userId}
						onChange={(e) => setUserId(e.target.value)}
						className="flex h-10 w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] px-3 text-sm"
					>
						<option value="">{t("riderChoose")}</option>
						{members.map((member) => (
							<option key={member.id} value={member.userId}>
								{member.name ?? member.userId}
							</option>
						))}
					</select>
					<Button
						className="min-h-11"
						disabled={!userId || assign.isPending}
						onClick={() =>
							assign.mutate({ shipmentId, userId }, { onSuccess: onClose })
						}
					>
						{t("riderAssign")}
					</Button>
				</section>
				<form onSubmit={onExternal} className="space-y-2" noValidate>
					<h3 className="font-medium text-sm">{t("riderExternal")}</h3>
					<label htmlFor="rider-name" className="block text-sm">
						{t("riderName")}
					</label>
					<Input id="rider-name" {...register("name")} />
					{formState.errors.name && (
						<p className="text-red-600 text-xs">{t("riderNameRequired")}</p>
					)}
					<label htmlFor="rider-phone" className="block text-sm">
						{t("riderPhone")}
					</label>
					<Controller
						control={control}
						name="phone"
						render={({ field }) => (
							<PhoneInput
								id="rider-phone"
								value={field.value}
								onChange={field.onChange}
							/>
						)}
					/>
					{formState.errors.phone && (
						<p className="text-red-600 text-xs">{t("riderPhoneInvalid")}</p>
					)}
					<Button
						type="submit"
						className="min-h-11"
						disabled={assign.isPending}
					>
						{t("riderAssign")}
					</Button>
				</form>
				{assign.isError && (
					<p role="alert" className="text-red-700 text-sm">
						{resolveErrorMessage(assign.error, tRoot)}
					</p>
				)}
			</div>
		</ActionDialog>
	);
}
