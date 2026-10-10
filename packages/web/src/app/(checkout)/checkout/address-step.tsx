"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { PhoneInput } from "~/components/ui/phone-input";
import { Textarea } from "~/components/ui/textarea";
import { useAuth } from "~/hooks/use-auth";
import { type ApiError, resolveErrorMessage } from "~/lib/apiError";
import {
	ADDRESS_ERROR_KEYS,
	type AddressField,
	type CheckoutAddressValues,
	checkoutAddressSchema,
	DISTRICTS,
	isAddressErrorKey,
	otherDistrictOf,
	toAddressInput,
} from "~/lib/checkout-form";
import type {
	AddressInput,
	DeliveryMethod,
	LaunchCityOption,
} from "~/types/order";
import { Field, SELECT_CLASS } from "./form-field";
import { LocationField } from "./location-field";

export function AddressStep({
	initial,
	launchCities,
	shopCity,
	method,
	rejectedField,
	rejection,
	onSubmit,
}: {
	initial: AddressInput | null;
	launchCities: LaunchCityOption[];
	shopCity: string | null;
	method: DeliveryMethod;
	rejectedField: AddressField | null;
	rejection: ApiError | null;
	onSubmit: (address: AddressInput) => void;
}) {
	const t = useTranslations("Checkout");
	const tRoot = useTranslations();
	const { user } = useAuth();
	const verifiedPhone = user?.phoneVerifiedAt ? (user.phone ?? "") : "";
	const servedCity = launchCities.some((c) => c.key === shopCity)
		? shopCity
		: null;

	const {
		control,
		formState,
		handleSubmit,
		register,
		setError,
		setValue,
		watch,
	} = useForm<CheckoutAddressValues>({
		resolver: zodResolver(
			checkoutAddressSchema(
				launchCities.map((c) => c.key),
				method,
			),
		),
		defaultValues: {
			recipientName: initial?.recipientName ?? user?.name ?? "",
			phone: initial?.phone ?? verifiedPhone,
			city: initial?.city ?? servedCity ?? "",
			district: initial?.district ?? "",
			districtOther: initial?.districtOther ?? "",
			landmark: initial?.landmark ?? "",
			instructions: initial?.instructions ?? "",
			gps: initial?.gps,
		},
	});

	// The server refused a field the client let through: show it where it belongs.
	const rejectionMessage = rejection
		? resolveErrorMessage(rejection, tRoot)
		: null;
	useEffect(() => {
		if (rejectedField) {
			setError(rejectedField, { message: ADDRESS_ERROR_KEYS[rejectedField] });
		} else if (rejectionMessage) {
			setError("root", { message: rejectionMessage });
		}
	}, [rejectedField, rejectionMessage, setError]);

	const errorText = (field: AddressField) => {
		const message = formState.errors[field]?.message;
		return isAddressErrorKey(message) ? t(message) : message;
	};
	const city = watch("city");
	const district = watch("district");

	return (
		<form
			noValidate
			className="space-y-4"
			onSubmit={handleSubmit((values) => onSubmit(toAddressInput(values)))}
		>
			<Field
				id="recipientName"
				label={t("recipientName")}
				error={errorText("recipientName")}
			>
				<Input
					id="recipientName"
					autoComplete="name"
					{...register("recipientName")}
				/>
			</Field>
			<Field id="phone" label={t("phone")} error={errorText("phone")}>
				<Controller
					control={control}
					name="phone"
					render={({ field }) => (
						<PhoneInput
							id="phone"
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
							aria-invalid={Boolean(formState.errors.phone)}
						/>
					)}
				/>
			</Field>
			<Field
				id="city"
				label={t("city")}
				error={errorText("city")}
				hint={servedCity ? t("citySameCityOnly") : undefined}
			>
				<select id="city" className={SELECT_CLASS} {...register("city")}>
					<option value="">{t("selectCity")}</option>
					{launchCities.map((c) => (
						<option
							key={c.key}
							value={c.key}
							disabled={servedCity !== null && c.key !== servedCity}
						>
							{c.label}
						</option>
					))}
				</select>
			</Field>
			<Field id="district" label={t("district")} error={errorText("district")}>
				<select
					id="district"
					className={SELECT_CLASS}
					{...register("district")}
				>
					<option value="">{t("selectDistrict")}</option>
					{(DISTRICTS[city] ?? []).map((d) => (
						<option key={d.key} value={d.key}>
							{d.label}
						</option>
					))}
					{city && (
						<option value={otherDistrictOf(city)}>
							{t("districtOtherOption")}
						</option>
					)}
				</select>
			</Field>
			{city && district === otherDistrictOf(city) && (
				<Field
					id="districtOther"
					label={t("districtOther")}
					error={errorText("districtOther")}
				>
					<Input id="districtOther" {...register("districtOther")} />
				</Field>
			)}
			<Field
				id="landmark"
				label={
					method === "pickup"
						? `${t("landmark")} (${t("optional")})`
						: t("landmark")
				}
				hint={t("landmarkHelp")}
				error={errorText("landmark")}
			>
				<Input id="landmark" {...register("landmark")} />
			</Field>
			<LocationField
				value={watch("gps")}
				onChange={(gps) => setValue("gps", gps)}
			/>
			<Field
				id="instructions"
				label={`${t("instructions")} (${t("optional")})`}
				error={errorText("instructions")}
			>
				<Textarea id="instructions" rows={3} {...register("instructions")} />
			</Field>
			{formState.errors.root?.message && (
				<p role="alert" className="text-red-700 text-sm">
					{formState.errors.root.message}
				</p>
			)}
			<Button
				type="submit"
				className="min-h-11 w-full bg-[#1E40AF] hover:bg-[#1E3A8A]"
			>
				{t("continue")}
			</Button>
		</form>
	);
}
