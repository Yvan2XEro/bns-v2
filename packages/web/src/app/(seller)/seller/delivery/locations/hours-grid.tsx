"use client";

import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { Input } from "~/components/ui/input";
import type { LocationFormValues } from "~/lib/delivery-location-form";
import { FieldError } from "../../settings/orders/form-controls";

export function HoursGrid({
	form,
}: {
	form: UseFormReturn<LocationFormValues>;
}) {
	const t = useTranslations("SellerDelivery");
	const { register, watch, formState } = form;
	const grid = watch("openingHours");
	const message = formState.errors.openingHours?.message;
	return (
		<fieldset className="space-y-2">
			<legend className="font-medium text-sm">{t("fieldHours")}</legend>
			{grid.map((entry, index) => (
				<div key={entry.day} className="flex items-center gap-2">
					<label className="flex min-h-11 w-28 items-center gap-2 text-sm">
						<input
							type="checkbox"
							className="h-5 w-5 accent-[#1E40AF]"
							{...register(`openingHours.${index}.open`)}
						/>
						{t(`day.${entry.day}`)}
					</label>
					<Input
						type="time"
						aria-label={t("hoursOpens", { day: t(`day.${entry.day}`) })}
						disabled={!entry.open}
						{...register(`openingHours.${index}.opens`)}
					/>
					<Input
						type="time"
						aria-label={t("hoursCloses", { day: t(`day.${entry.day}`) })}
						disabled={!entry.open}
						{...register(`openingHours.${index}.closes`)}
					/>
				</div>
			))}
			<FieldError>
				{message ? t(`locationError.${message}`) : undefined}
			</FieldError>
		</fieldset>
	);
}
