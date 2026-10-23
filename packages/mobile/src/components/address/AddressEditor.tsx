import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Switch, Text, TextInput, View } from "react-native";
import { AddressTextField } from "@/src/components/checkout/AddressTextField";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { ChoiceChips } from "@/src/components/checkout/ChoiceChips";
import { LocationField } from "@/src/components/checkout/LocationField";
import { FormRow } from "@/src/components/layout/FormRow";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAuth } from "@/src/lib/auth";
import {
	ADDRESS_ERROR_KEYS,
	type AddressField,
	addressDefaults,
	type CheckoutAddressValues,
	checkoutAddressSchema,
	DISTRICTS,
	otherDistrictOf,
	phoneFromTyping,
	toAddressInput,
} from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import { phoneExample } from "@/src/lib/market";
import {
	addressPatchFromPlace,
	SAVED_ADDRESS_LABEL_MAX,
	suggestionCities,
} from "@/src/lib/savedAddresses";
import type { AddressInput, DeliveryMethod } from "@/src/types/order";
import { PlaceSuggestField } from "./PlaceSuggestField";

export interface AddressMeta {
	label: string;
	/** Checkout's « Enregistrer cette adresse ». */
	save: boolean;
	isDefault: boolean;
}

/**
 * The address form, shared by checkout and « Mes adresses ». `extra` adds the
 * address-book fields: `"book"` a label and the default switch, `"save"` the
 * « Enregistrer cette adresse » switch with its label.
 */
export function AddressEditor({
	initial,
	launchCities,
	servedCity,
	method,
	rejectedField,
	formError,
	extra,
	initialLabel = "",
	initialDefault = false,
	submitLabel,
	pending = false,
	onCancel,
	onSubmit,
}: {
	initial: AddressInput | null;
	launchCities: ReadonlyArray<{ key: string; label: string }>;
	servedCity: string | null;
	method: DeliveryMethod;
	rejectedField: AddressField | null;
	formError?: string | null;
	extra?: "book" | "save";
	initialLabel?: string;
	initialDefault?: boolean;
	submitLabel: string;
	pending?: boolean;
	onCancel?: () => void;
	onSubmit: (address: AddressInput, meta: AddressMeta) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { user } = useAuth();
	const [label, setLabel] = useState(initialLabel);
	const [save, setSave] = useState(false);
	const [isDefault, setIsDefault] = useState(initialDefault);
	const [placeOutside, setPlaceOutside] = useState(false);

	const resolver = useMemo(
		() =>
			zodResolver(
				checkoutAddressSchema(
					launchCities.map((option) => option.key),
					method,
				),
			),
		[launchCities, method],
	);
	// Memoised because react-hook-form re-applies `errors` whenever its identity changes.
	const serverErrors = useMemo(
		() =>
			rejectedField
				? {
						[rejectedField]: {
							type: "server",
							message: ADDRESS_ERROR_KEYS[rejectedField],
						},
					}
				: undefined,
		[rejectedField],
	);
	const { control, formState, handleSubmit, setValue, watch } =
		useForm<CheckoutAddressValues>({
			resolver,
			defaultValues: addressDefaults(initial, user, servedCity),
			errors: serverErrors,
		});
	const error = (field: AddressField) => formState.errors[field]?.message;
	const city = watch("city");
	const district = watch("district");

	const submit = handleSubmit((values) =>
		onSubmit(toAddressInput(values), { label, save, isDefault }),
	);

	const labelInput = (
		<View style={{ gap: 6 }}>
			<Text style={[formStyles.label, { color: c.body }]}>
				{`${t("addresses.label")} (${t("common.optional")})`}
			</Text>
			<TextInput
				value={label}
				onChangeText={setLabel}
				maxLength={SAVED_ADDRESS_LABEL_MAX}
				placeholder={t("addresses.labelHint")}
				placeholderTextColor={c.muted}
				accessibilityLabel={t("addresses.label")}
				style={[
					formStyles.input,
					{ color: c.text, backgroundColor: c.input, borderColor: c.border },
				]}
			/>
		</View>
	);

	return (
		<View style={{ gap: 16 }}>
			{extra === "book" ? labelInput : null}
			<FormRow>
				<AddressTextField
					control={control}
					name="recipientName"
					label={t("checkout.recipientName")}
					autoComplete="name"
					error={error("recipientName")}
				/>
				<AddressTextField
					control={control}
					name="phone"
					label={t("checkout.phone")}
					hint={t("checkout.phoneHint")}
					placeholder={phoneExample()}
					keyboardType="phone-pad"
					autoComplete="tel"
					transform={phoneFromTyping}
					error={error("phone")}
				/>
			</FormRow>
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
				<Text style={[formStyles.hint, { color: c.warningText }]}>
					{t("addresses.placeOutside")}
				</Text>
			) : null}
			<Controller
				control={control}
				name="city"
				render={({ field }) => (
					<ChoiceChips
						label={t("checkout.city")}
						options={launchCities.map((option) => ({
							key: option.key,
							label: option.label,
							disabled: servedCity !== null && option.key !== servedCity,
						}))}
						value={field.value}
						onChange={(next) => {
							field.onChange(next);
							setValue("district", "");
						}}
						hint={servedCity ? t("checkout.cityLocked") : undefined}
						error={error("city")}
					/>
				)}
			/>
			{city ? (
				<Controller
					control={control}
					name="district"
					render={({ field }) => (
						<ChoiceChips
							label={t("checkout.district")}
							options={[
								...(DISTRICTS[city] ?? []),
								{
									key: otherDistrictOf(city),
									label: t("checkout.districtOtherOption"),
								},
							]}
							value={field.value}
							onChange={field.onChange}
							error={error("district")}
						/>
					)}
				/>
			) : null}
			{city && district === otherDistrictOf(city) ? (
				<AddressTextField
					control={control}
					name="districtOther"
					label={t("checkout.districtOther")}
					error={error("districtOther")}
				/>
			) : null}
			<AddressTextField
				control={control}
				name="landmark"
				label={
					method === "pickup"
						? `${t("checkout.landmark")} (${t("common.optional")})`
						: t("checkout.landmark")
				}
				hint={t("checkout.landmarkHelp")}
				maxLength={200}
				error={error("landmark")}
			/>
			<Controller
				control={control}
				name="gps"
				render={({ field }) => (
					<LocationField value={field.value} onChange={field.onChange} />
				)}
			/>
			<AddressTextField
				control={control}
				name="instructions"
				label={`${t("checkout.instructions")} (${t("common.optional")})`}
				multiline
				maxLength={300}
				error={error("instructions")}
			/>
			{extra === "book" ? (
				<View style={formStyles.row}>
					<Switch
						value={isDefault}
						onValueChange={setIsDefault}
						disabled={initialDefault}
						accessibilityLabel={t("addresses.makeDefault")}
					/>
					<Text style={[formStyles.label, { color: c.body, flex: 1 }]}>
						{t("addresses.makeDefault")}
					</Text>
				</View>
			) : null}
			{extra === "save" ? (
				<View
					style={{
						gap: 12,
						borderWidth: 1,
						borderColor: c.border,
						borderRadius: 14,
						padding: 12,
					}}
				>
					<View style={[formStyles.row, { minHeight: 44 }]}>
						<Switch
							value={save}
							onValueChange={setSave}
							accessibilityLabel={t("addresses.saveThisAddress")}
						/>
						<Text style={[formStyles.label, { color: c.text, flex: 1 }]}>
							{t("addresses.saveThisAddress")}
						</Text>
					</View>
					{save ? labelInput : null}
				</View>
			) : null}
			{formError ? (
				<Text style={formStyles.error} accessibilityLiveRegion="polite">
					{formError}
				</Text>
			) : null}
			<View style={{ flexDirection: "row", gap: 12 }}>
				{onCancel ? (
					<CheckoutButton
						label={t("addresses.cancel")}
						variant="outline"
						onPress={onCancel}
						style={{ flex: 1 }}
					/>
				) : null}
				<CheckoutButton
					label={submitLabel}
					onPress={submit}
					loading={pending}
					style={{ flex: 1 }}
				/>
			</View>
		</View>
	);
}
