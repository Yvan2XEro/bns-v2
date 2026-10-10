"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LocateFixed } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { ActionDialog, type DialogControl } from "~/components/action-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useRescheduleShipment } from "~/hooks/use-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type RescheduleValues,
	rescheduleSchema,
	toRescheduleInput,
} from "~/lib/reschedule-form";
import { formatDeliveryDate, rescheduleChoices } from "~/lib/shipment-tracking";
import { useLocaleKey } from "~/lib/use-locale-key";

/** Day and window are offered from today; the server judges the zone's delivery days. */
export function RescheduleDialog({
	orderId,
	shipmentId,
	now,
	...control
}: DialogControl & { orderId: string; shipmentId: string; now: Date }) {
	const t = useTranslations("Tracking");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const reschedule = useRescheduleShipment(orderId, shipmentId);
	const choices = useMemo(() => rescheduleChoices(now), [now]);
	const form = useForm<RescheduleValues>({
		resolver: zodResolver(rescheduleSchema),
		defaultValues: {
			day: choices[0]?.key ?? "",
			window: "morning",
			landmark: "",
			lat: "",
			lng: "",
		},
	});
	const { register, watch, setValue, setError, handleSubmit, formState } = form;
	const { errors } = formState;
	const day = choices.find((entry) => entry.key === watch("day"));
	const err = (message?: string) =>
		message ? t(`rescheduleError.${message}`) : null;

	const locate = () => {
		if (!("geolocation" in navigator)) return;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				setValue("lat", String(pos.coords.latitude));
				setValue("lng", String(pos.coords.longitude));
			},
			() => undefined,
			{ enableHighAccuracy: true, timeout: 10_000 },
		);
	};

	const onSubmit = handleSubmit(async (values) => {
		const input = toRescheduleInput(values, choices);
		if (!input) {
			setError("window", { message: "windowRequired" });
			return;
		}
		try {
			await reschedule.mutateAsync(input);
			control.onOpenChange(false);
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<ActionDialog
			{...control}
			title={t("rescheduleTitle")}
			description={t("rescheduleBody")}
		>
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				<div className="space-y-1.5">
					<label htmlFor="reschedule-day" className="block font-medium text-sm">
						{t("fieldDay")}
					</label>
					<select
						id="reschedule-day"
						className="flex h-10 w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] px-3 text-sm"
						{...register("day")}
					>
						{choices.map((entry) => (
							<option key={entry.key} value={entry.key}>
								{formatDeliveryDate(entry.windows[0]?.iso ?? "", locale)}
							</option>
						))}
					</select>
					{err(errors.day?.message) && (
						<p className="text-red-600 text-xs">{err(errors.day?.message)}</p>
					)}
				</div>
				<fieldset className="space-y-1">
					<legend className="font-medium text-sm">{t("fieldWindow")}</legend>
					{(day?.windows ?? []).map(({ window }) => (
						<label
							key={window}
							className="flex min-h-11 items-center gap-3 text-sm"
						>
							<input
								type="radio"
								value={window}
								className="h-5 w-5 accent-[#1E40AF]"
								{...register("window")}
							/>
							{tRoot(`Delivery.window.${window}`)}
						</label>
					))}
					{err(errors.window?.message) && (
						<p className="text-red-600 text-xs">
							{err(errors.window?.message)}
						</p>
					)}
				</fieldset>
				<div className="space-y-1.5">
					<label
						htmlFor="reschedule-landmark"
						className="block font-medium text-sm"
					>
						{t("fieldLandmark")}
					</label>
					<Input id="reschedule-landmark" {...register("landmark")} />
					{err(errors.landmark?.message) && (
						<p className="text-red-600 text-xs">
							{err(errors.landmark?.message)}
						</p>
					)}
				</div>
				<div className="space-y-1.5">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						onClick={locate}
					>
						<LocateFixed aria-hidden /> {t("usePosition")}
					</Button>
					{watch("lat") && (
						<p className="text-[#64748B] text-xs">{t("positionCaptured")}</p>
					)}
					{err(errors.lat?.message) && (
						<p className="text-red-600 text-xs">{err(errors.lat?.message)}</p>
					)}
				</div>
				{errors.root?.message && (
					<p role="alert" className="text-red-700 text-sm">
						{errors.root.message}
					</p>
				)}
				<div className="flex justify-end">
					<Button
						type="submit"
						className="min-h-11"
						disabled={reschedule.isPending}
					>
						{t("rescheduleSubmit")}
					</Button>
				</div>
			</form>
		</ActionDialog>
	);
}
