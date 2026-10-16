"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PlaceSuggestField } from "~/components/address/place-suggest-field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { PhoneInput } from "~/components/ui/phone-input";
import { Textarea } from "~/components/ui/textarea";
import { useAuth } from "~/hooks/use-auth";
import { useMarketPhone } from "~/hooks/use-market-phone";
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
import {
	addressPatchFromPlace,
	SAVED_ADDRESS_LABEL_MAX,
	suggestionCities,
} from "~/lib/saved-addresses";
import type {
	AddressInput,
	DeliveryMethod,
	LaunchCityOption,
} from "~/types/order";
import { Field, SELECT_CLASS } from "./form-field";
import { LocationField } from "./location-field";

export interface AddressMeta {
	label: string;
	/** Checkout's « Enregistrer cette adresse ». */
	save: boolean;
	isDefault: boolean;
}

/**
 * The address form. `extra` adds the address-book fields: `"book"` a label
 * and the default toggle (account page, editing a saved address), `"save"`
 * the « Enregistrer cette adresse » toggle with its label (a new address at
 * checkout).
 */
export function AddressStep({
	initial,
	launchCities,
	shopCity,
	method,
	rejectedField,
	rejection,
	onSubmit,
	extra,
	initialLabel = "",
	initialDefault = false,
	submitLabel,
	pending = false,
	onCancel,
}: {
	initial: AddressInput | null;
	launchCities: LaunchCityOption[];
	shopCity: string | null;
	method: DeliveryMethod;
	rejectedField: AddressField | null;
	rejection: ApiError | null;
	onSubmit: (address: AddressInput, meta: AddressMeta) => void;
	extra?: "book" | "save";
	initialLabel?: string;
	initialDefault?: boolean;
	submitLabel?: string;
	pending?: boolean;
	onCancel?: () => void;
}) {
	const t = useTranslations("Checkout");
	const tAddr = useTranslations("Addresses");
	const [label, setLabel] = useState(initialLabel);
	const [save, setSave] = useState(false);
	const [isDefault, setIsDefault] = useState(initialDefault);
	const [placeOutside, setPlaceOutside] = useState(false);
	const tRoot = useTranslations();
	const { user } = useAuth();
	const verifiedPhone = user?.phoneVerifiedAt ? (user.phone ?? "") : "";
	const servedCity = launchCities.some((c) => c.key === shopCity)
		? shopCity
		: null;

	const phoneRule = useMarketPhone();
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
				phoneRule.pattern,
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
		return isAddressErrorKey(message)
			? t(message, { example: phoneRule.example })
			: message;
	};
	const city = watch("city");
	const district = watch("district");

	return (
		<form
			noValidate
			className="space-y-4"
			onSubmit={handleSubmit((values) =>
				onSubmit(toAddressInput(values), { label, save, isDefault }),
			)}
		>
			{extra === "book" ? (
				<Field id="addressLabel" label={`${tAddr("label")} (${t("optional")})`}>
					<Input
						id="addressLabel"
						maxLength={SAVED_ADDRESS_LABEL_MAX}
						placeholder={tAddr("labelHint")}
						value={label}
						onChange={(event) => setLabel(event.target.value)}
					/>
				</Field>
			) : null}
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
							placeholder={phoneRule.placeholder}
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
							aria-invalid={Boolean(formState.errors.phone)}
						/>
					)}
				/>
			</Field>
			<PlaceSuggestField
				onPick={(place) => {
					const patch = addressPatchFromPlace(
						place,
						suggestionCities(launchCities),
					);
					const outside =
						!patch || (servedCity !== null && patch.city !== servedCity);
					setPlaceOutside(outside);
					if (!patch || outside) return;
					const cityChanged = patch.city !== city;
					setValue("city", patch.city);
					if (!patch.district && !cityChanged) return;
					setValue("district", patch.district);
					setValue("districtOther", patch.districtOther);
				}}
			/>
			{placeOutside ? (
				<p className="text-sm text-warn-ink-soft">{tAddr("placeOutside")}</p>
			) : null}
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
			{extra === "book" ? (
				<label className="flex min-h-11 items-center gap-2 text-ink-soft text-sm">
					<input
						type="checkbox"
						className="h-4 w-4"
						checked={isDefault}
						disabled={initialDefault}
						onChange={(event) => setIsDefault(event.target.checked)}
					/>
					{tAddr("makeDefault")}
				</label>
			) : null}
			{extra === "save" ? (
				<div className="space-y-2 rounded-xl border border-line p-3">
					<label className="flex min-h-11 items-center gap-2 font-semibold text-ink text-sm">
						<input
							type="checkbox"
							className="h-4 w-4"
							checked={save}
							onChange={(event) => setSave(event.target.checked)}
						/>
						{tAddr("saveThisAddress")}
					</label>
					{save ? (
						<Field
							id="addressLabel"
							label={`${tAddr("label")} (${t("optional")})`}
						>
							<Input
								id="addressLabel"
								maxLength={SAVED_ADDRESS_LABEL_MAX}
								placeholder={tAddr("labelHint")}
								value={label}
								onChange={(event) => setLabel(event.target.value)}
							/>
						</Field>
					) : null}
				</div>
			) : null}
			{formState.errors.root?.message && (
				<p role="alert" className="text-red-700 text-sm">
					{formState.errors.root.message}
				</p>
			)}
			<div className="flex gap-3">
				{onCancel ? (
					<Button
						type="button"
						variant="outline"
						className="min-h-11 flex-1"
						onClick={onCancel}
					>
						{tAddr("cancel")}
					</Button>
				) : null}
				<Button
					type="submit"
					disabled={pending}
					className="min-h-11 flex-1 bg-brand hover:bg-brand-strong"
				>
					{submitLabel ?? t("continue")}
				</Button>
			</div>
		</form>
	);
}
