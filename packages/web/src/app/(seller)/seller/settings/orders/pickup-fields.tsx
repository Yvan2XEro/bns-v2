"use client";

import { useTranslations } from "next-intl";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	MAX_PICKUP_TEXT,
	type OrderSettingsFormValues,
} from "~/lib/order-settings-form";
import { FieldError } from "./form-controls";

export function PickupFields({
	register,
	errors,
}: {
	register: UseFormRegister<OrderSettingsFormValues>;
	errors: FieldErrors<OrderSettingsFormValues>;
}) {
	const t = useTranslations("Billing");
	const tooLong = (failed: boolean) =>
		failed ? t("tooLong", { max: MAX_PICKUP_TEXT }) : null;

	return (
		<>
			<div className="space-y-1.5">
				<Label htmlFor="pickup-address">{t("pickupAddress")}</Label>
				<Input
					id="pickup-address"
					className="h-11"
					aria-invalid={Boolean(errors.pickupAddress)}
					{...register("pickupAddress")}
				/>
				<FieldError>
					{errors.pickupAddress?.message === "required"
						? t("pickupAddressRequired")
						: tooLong(Boolean(errors.pickupAddress))}
				</FieldError>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="pickup-landmark">{t("pickupLandmark")}</Label>
				<Input
					id="pickup-landmark"
					className="h-11"
					{...register("pickupLandmark")}
				/>
				<FieldError>{tooLong(Boolean(errors.pickupLandmark))}</FieldError>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="pickup-hours">{t("pickupHours")}</Label>
				<Input
					id="pickup-hours"
					className="h-11"
					{...register("pickupHours")}
				/>
				<FieldError>{tooLong(Boolean(errors.pickupHours))}</FieldError>
			</div>
		</>
	);
}
