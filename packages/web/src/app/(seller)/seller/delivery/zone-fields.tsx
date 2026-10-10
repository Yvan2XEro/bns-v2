"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Input } from "~/components/ui/input";
import { useAppConfig } from "~/hooks/use-app-config";
import { useAvailableCouriers } from "~/hooks/use-delivery-settings";
import { DISTRICTS } from "~/lib/checkout-form";
import {
	courierCostHint,
	couriersForCity,
	ZONE_DAYS,
	ZONE_METHODS,
	type ZoneFormValues,
} from "~/lib/delivery-zone-form";
import { formatXaf } from "~/lib/order-money";
import { useLocaleKey } from "../billing/use-locale-key";
import { FieldError, Toggle } from "../settings/orders/form-controls";

const SELECT_CLASS =
	"flex h-10 w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] px-3 text-[#0F172A] text-sm";

function Field({
	id,
	label,
	error,
	children,
}: {
	id: string;
	label: string;
	error?: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={id} className="block font-medium text-sm">
				{label}
			</label>
			{children}
			<FieldError>{error}</FieldError>
		</div>
	);
}

export function ZoneFields({ form }: { form: UseFormReturn<ZoneFormValues> }) {
	const t = useTranslations("SellerDelivery");
	const locale = useLocaleKey();
	const { launchCities, couriersEnabled } = useAppConfig();
	const couriers = useAvailableCouriers();
	const { register, watch, formState, setValue } = form;
	const { errors } = formState;
	const city = watch("city");
	const method = watch("method");
	const districts = watch("districts");
	const days = watch("deliveryDays");
	const courierId = watch("courier");
	const offered = couriersForCity(couriers.data ?? [], city);
	const hint = courierCostHint(
		offered.find((c) => c.id === courierId),
		city,
		districts,
	);
	const err = (message?: string) =>
		message ? t(`zoneError.${message}`) : undefined;
	const toggle = <T,>(list: T[], value: T): T[] =>
		list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

	return (
		<>
			<Field
				id="zone-name"
				label={t("fieldName")}
				error={err(errors.name?.message)}
			>
				<Input id="zone-name" {...register("name")} />
			</Field>
			<Field
				id="zone-city"
				label={t("fieldCity")}
				error={err(errors.city?.message)}
			>
				<select
					id="zone-city"
					className={SELECT_CLASS}
					{...register("city", {
						onChange: () => setValue("districts", []),
					})}
				>
					{launchCities.map((c) => (
						<option key={c.key} value={c.key}>
							{c.label}
						</option>
					))}
				</select>
			</Field>
			<fieldset className="space-y-2">
				<legend className="font-medium text-sm">{t("fieldDistricts")}</legend>
				<p className="text-[#64748B] text-xs">{t("districtsHelp")}</p>
				<div className="grid max-h-44 grid-cols-2 gap-x-3 overflow-y-auto rounded-xl border border-[#E2E8F0] p-2">
					{(DISTRICTS[city] ?? []).map((d) => (
						<Toggle
							key={d.key}
							id={`zone-district-${d.key}`}
							label={d.label}
							checked={districts.includes(d.key)}
							onChange={() => setValue("districts", toggle(districts, d.key))}
						/>
					))}
				</div>
				<FieldError>{err(errors.districts?.message)}</FieldError>
			</fieldset>
			<Field id="zone-method" label={t("fieldMethod")}>
				<select
					id="zone-method"
					className={SELECT_CLASS}
					{...register("method")}
				>
					{ZONE_METHODS.filter((m) => m !== "courier" || couriersEnabled).map(
						(m) => (
							<option key={m} value={m}>
								{t(`method.${m}`)}
							</option>
						),
					)}
				</select>
			</Field>
			{method === "courier" && (
				<Field
					id="zone-courier"
					label={t("fieldCourier")}
					error={err(errors.courier?.message)}
				>
					<select
						id="zone-courier"
						className={SELECT_CLASS}
						{...register("courier")}
					>
						<option value="">{t("chooseCourier")}</option>
						{offered.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
					{hint && (
						<p className="text-[#64748B] text-xs">
							{t("courierTariff", {
								amount: formatXaf(hint.amount, locale),
								min: hint.etaMinHours,
								max: hint.etaMaxHours,
							})}
						</p>
					)}
				</Field>
			)}
			<div className="grid gap-3 sm:grid-cols-3">
				<Field
					id="zone-fee"
					label={t("columnFee")}
					error={err(errors.fee?.message)}
				>
					<Input id="zone-fee" inputMode="numeric" {...register("fee")} />
				</Field>
				<Field
					id="zone-free"
					label={t("columnFreeAbove")}
					error={err(errors.freeAboveSubtotal?.message)}
				>
					<Input
						id="zone-free"
						inputMode="numeric"
						{...register("freeAboveSubtotal")}
					/>
				</Field>
				<Field
					id="zone-min"
					label={t("columnMinimum")}
					error={err(errors.minOrderSubtotal?.message)}
				>
					<Input
						id="zone-min"
						inputMode="numeric"
						{...register("minOrderSubtotal")}
					/>
				</Field>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<Field
					id="zone-eta-min"
					label={t("fieldEtaMin")}
					error={err(errors.etaMinHours?.message)}
				>
					<Input
						id="zone-eta-min"
						inputMode="numeric"
						{...register("etaMinHours")}
					/>
				</Field>
				<Field
					id="zone-eta-max"
					label={t("fieldEtaMax")}
					error={err(errors.etaMaxHours?.message)}
				>
					<Input
						id="zone-eta-max"
						inputMode="numeric"
						{...register("etaMaxHours")}
					/>
				</Field>
				<Field
					id="zone-cutoff"
					label={t("fieldCutoff")}
					error={err(errors.cutoffTime?.message)}
				>
					<Input id="zone-cutoff" type="time" {...register("cutoffTime")} />
				</Field>
			</div>
			<fieldset className="space-y-1">
				<legend className="font-medium text-sm">{t("fieldDays")}</legend>
				<div className="flex flex-wrap gap-x-3">
					{ZONE_DAYS.map((day) => (
						<Toggle
							key={day}
							id={`zone-day-${day}`}
							label={t(`day.${day}`)}
							checked={days.includes(day)}
							onChange={() => setValue("deliveryDays", toggle(days, day))}
						/>
					))}
				</div>
				<FieldError>{err(errors.deliveryDays?.message)}</FieldError>
			</fieldset>
			<Toggle id="zone-cod" label={t("fieldCod")} {...register("codAllowed")} />
			{!watch("codAllowed") && (
				<p className="text-[#92400E] text-xs">{t("codOffHint")}</p>
			)}
			<Toggle
				id="zone-active"
				label={t("fieldActive")}
				{...register("active")}
			/>
		</>
	);
}
