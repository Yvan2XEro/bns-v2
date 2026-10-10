"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, LocateFixed } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { useAppConfig } from "~/hooks/use-app-config";
import {
	useCreateLocation,
	useUpdateLocation,
} from "~/hooks/use-delivery-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { DISTRICTS } from "~/lib/checkout-form";
import {
	emptyLocationForm,
	type LocationFormValues,
	locationFormSchema,
	locationToForm,
	locationToInput,
	mapsUrl,
} from "~/lib/delivery-location-form";
import type { ShopLocation } from "../../../../../../../api/src/payload-types";
import { FieldError, Toggle } from "../../settings/orders/form-controls";
import { HoursGrid } from "./hours-grid";

const SELECT_CLASS =
	"flex h-10 w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] px-3 text-[#0F172A] text-sm";

export function LocationDialog({
	shopId,
	location,
	onClose,
}: {
	shopId: string;
	location: ShopLocation | null;
	onClose: () => void;
}) {
	const t = useTranslations("SellerDelivery");
	const tRoot = useTranslations();
	const { launchCities } = useAppConfig();
	const create = useCreateLocation(shopId);
	const update = useUpdateLocation(shopId);
	const [locating, setLocating] = useState(false);
	const form = useForm<LocationFormValues>({
		resolver: zodResolver(locationFormSchema),
		defaultValues: location
			? locationToForm(location)
			: emptyLocationForm(launchCities[0]?.key ?? ""),
	});
	const { register, watch, setValue, setError, handleSubmit, formState } = form;
	const { errors } = formState;
	const city = watch("city");
	const link = mapsUrl(watch("lat"), watch("lng"));
	const err = (message?: string) =>
		message ? t(`locationError.${message}`) : undefined;

	const capturePosition = () => {
		if (!("geolocation" in navigator)) return;
		setLocating(true);
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				setValue("lat", String(pos.coords.latitude), { shouldValidate: true });
				setValue("lng", String(pos.coords.longitude), { shouldValidate: true });
				setLocating(false);
			},
			() => setLocating(false),
			{ enableHighAccuracy: true, timeout: 10_000 },
		);
	};

	const onSubmit = handleSubmit(async (values) => {
		const input = locationToInput(values);
		try {
			if (location)
				await update.mutateAsync({ locationId: location.id, input });
			else await create.mutateAsync(input);
			onClose();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{location ? t("editLocation") : t("addLocation")}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4" noValidate>
					<div className="space-y-1.5">
						<label htmlFor="loc-name" className="block font-medium text-sm">
							{t("fieldName")}
						</label>
						<Input id="loc-name" {...register("name")} />
						<FieldError>{err(errors.name?.message)}</FieldError>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<label htmlFor="loc-city" className="block font-medium text-sm">
								{t("fieldCity")}
							</label>
							<select
								id="loc-city"
								className={SELECT_CLASS}
								{...register("city", {
									onChange: () => setValue("district", ""),
								})}
							>
								{launchCities.map((c) => (
									<option key={c.key} value={c.key}>
										{c.label}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-1.5">
							<label
								htmlFor="loc-district"
								className="block font-medium text-sm"
							>
								{tRoot("Checkout.district")}
							</label>
							<select
								id="loc-district"
								className={SELECT_CLASS}
								{...register("district")}
							>
								<option value="">{tRoot("Checkout.selectDistrict")}</option>
								{(DISTRICTS[city] ?? []).map((d) => (
									<option key={d.key} value={d.key}>
										{d.label}
									</option>
								))}
							</select>
							<FieldError>{err(errors.district?.message)}</FieldError>
						</div>
					</div>
					<div className="space-y-1.5">
						<label htmlFor="loc-landmark" className="block font-medium text-sm">
							{t("fieldLandmark")}
						</label>
						<Input id="loc-landmark" {...register("landmark")} />
						<FieldError>{err(errors.landmark?.message)}</FieldError>
					</div>
					<div className="space-y-1.5">
						<label htmlFor="loc-address" className="block font-medium text-sm">
							{t("fieldAddress")}
						</label>
						<Input id="loc-address" {...register("address")} />
					</div>
					<fieldset className="space-y-2">
						<legend className="font-medium text-sm">
							{t("fieldPosition")}
						</legend>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1">
								<label htmlFor="loc-lat" className="block text-sm">
									{t("fieldLat")}
								</label>
								<Input id="loc-lat" inputMode="decimal" {...register("lat")} />
								<FieldError>{err(errors.lat?.message)}</FieldError>
							</div>
							<div className="space-y-1">
								<label htmlFor="loc-lng" className="block text-sm">
									{t("fieldLng")}
								</label>
								<Input id="loc-lng" inputMode="decimal" {...register("lng")} />
								<FieldError>{err(errors.lng?.message)}</FieldError>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								className="min-h-11"
								disabled={locating}
								onClick={capturePosition}
							>
								<LocateFixed aria-hidden /> {t("usePosition")}
							</Button>
							{link && (
								<Button variant="outline" className="min-h-11" asChild>
									<a href={link} target="_blank" rel="noopener noreferrer">
										<ExternalLink aria-hidden /> {tRoot("Checkout.openInMaps")}
									</a>
								</Button>
							)}
						</div>
					</fieldset>
					<div className="space-y-1.5">
						<label htmlFor="loc-phone" className="block font-medium text-sm">
							{t("fieldPhone")}
						</label>
						<Input id="loc-phone" type="tel" {...register("phone")} />
					</div>
					<HoursGrid form={form} />
					<div className="space-y-1.5">
						<label htmlFor="loc-note" className="block font-medium text-sm">
							{t("fieldHoursNote")}
						</label>
						<Input id="loc-note" {...register("openingHoursNote")} />
					</div>
					<Toggle
						id="loc-pickup"
						label={t("fieldPickup")}
						{...register("pickupEnabled")}
					/>
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="space-y-1">
							<label htmlFor="loc-fee" className="block text-sm">
								{t("fieldPickupFee")}
							</label>
							<Input
								id="loc-fee"
								inputMode="numeric"
								{...register("pickupFee")}
							/>
							<FieldError>{err(errors.pickupFee?.message)}</FieldError>
						</div>
						<div className="space-y-1">
							<label htmlFor="loc-hold" className="block text-sm">
								{t("fieldHoldDays")}
							</label>
							<Input
								id="loc-hold"
								inputMode="numeric"
								{...register("holdDays")}
							/>
							<FieldError>{err(errors.holdDays?.message)}</FieldError>
						</div>
						<div className="space-y-1">
							<label htmlFor="loc-prep" className="block text-sm">
								{t("fieldPreparation")}
							</label>
							<Input
								id="loc-prep"
								inputMode="numeric"
								{...register("preparationHours")}
							/>
							<FieldError>{err(errors.preparationHours?.message)}</FieldError>
						</div>
					</div>
					<Toggle
						id="loc-origin"
						label={t("fieldDispatchOrigin")}
						{...register("isDispatchOrigin")}
					/>
					<Toggle
						id="loc-default"
						label={t("fieldDefaultOrigin")}
						{...register("isDefaultOrigin")}
					/>
					<FieldError>{err(errors.isDefaultOrigin?.message)}</FieldError>
					<Toggle
						id="loc-active"
						label={t("fieldActive")}
						{...register("active")}
					/>
					{errors.root?.message && (
						<p role="alert" className="text-red-700 text-sm">
							{errors.root.message}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={onClose}
						>
							{t("cancel")}
						</Button>
						<Button
							type="submit"
							className="min-h-11"
							disabled={create.isPending || update.isPending}
						>
							{t("save")}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
