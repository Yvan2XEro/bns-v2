import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { type Control, Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, type TextInputProps, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { ChoiceChips } from "@/src/components/checkout/ChoiceChips";
import { LocationField } from "@/src/components/checkout/LocationField";
import { FormRow } from "@/src/components/layout/FormRow";
import { FormButton } from "@/src/components/settings/FormButton";
import { FormField } from "@/src/components/settings/FormField";
import {
	GroupedSection,
	GroupedSwitchRow,
	useGroupedColors,
} from "@/src/components/settings/Grouped";
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

/**
 * One text field of the address, drawn as the account forms draw theirs.
 * The error is a translation key from the schema or the server.
 */
function AddressInputField({
	control,
	name,
	label,
	hint,
	error,
	transform,
	...input
}: {
	control: Control<CheckoutAddressValues>;
	name: AddressField;
	label: string;
	hint?: string;
	error?: string;
	transform?: (text: string) => string;
} & Pick<
	TextInputProps,
	"keyboardType" | "autoComplete" | "multiline" | "placeholder" | "maxLength"
>) {
	const { t } = useTranslation();
	return (
		<Controller
			control={control}
			name={name}
			render={({ field }) => (
				<FormField
					{...input}
					label={label}
					hint={hint}
					value={field.value}
					onChangeText={(text) =>
						field.onChange(transform ? transform(text) : text)
					}
					onBlur={field.onBlur}
					error={error ? t(error, { example: phoneExample() }) : null}
				/>
			)}
		/>
	);
}

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
	const c = useGroupedColors();
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
		<FormField
			label={`${t("addresses.label")} (${t("common.optional")})`}
			value={label}
			onChangeText={setLabel}
			maxLength={SAVED_ADDRESS_LABEL_MAX}
			placeholder={t("addresses.labelHint")}
			autoCapitalize="sentences"
		/>
	);

	return (
		<View style={styles.form}>
			{extra === "book" ? labelInput : null}
			<FormRow>
				<AddressInputField
					control={control}
					name="recipientName"
					label={t("checkout.recipientName")}
					autoComplete="name"
					error={error("recipientName")}
				/>
				<AddressInputField
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
				<Text
					style={[styles.note, { color: c.warningText }]}
					accessibilityLiveRegion="polite"
				>
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
				<AddressInputField
					control={control}
					name="districtOther"
					label={t("checkout.districtOther")}
					error={error("districtOther")}
				/>
			) : null}
			<AddressInputField
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
			<AddressInputField
				control={control}
				name="instructions"
				label={`${t("checkout.instructions")} (${t("common.optional")})`}
				multiline
				maxLength={300}
				error={error("instructions")}
			/>
			{extra === "book" ? (
				<GroupedSection>
					<GroupedSwitchRow
						icon="star-outline"
						iconTone="brand"
						label={t("addresses.makeDefault")}
						value={isDefault}
						onValueChange={setIsDefault}
						disabled={initialDefault}
					/>
				</GroupedSection>
			) : null}
			{extra === "save" ? (
				<View style={styles.saveBlock}>
					<GroupedSection>
						<GroupedSwitchRow
							icon="bookmark-outline"
							iconTone="brand"
							label={t("addresses.saveThisAddress")}
							value={save}
							onValueChange={setSave}
						/>
					</GroupedSection>
					{save ? labelInput : null}
				</View>
			) : null}
			{formError ? (
				<Text
					style={[
						styles.note,
						{ color: c.isDark ? c.dangerText : c.destructive },
					]}
					accessibilityLiveRegion="polite"
				>
					{formError}
				</Text>
			) : null}
			<View style={styles.buttons}>
				{onCancel ? (
					<FormButton
						label={t("addresses.cancel")}
						variant="secondary"
						onPress={onCancel}
						style={styles.button}
					/>
				) : null}
				<FormButton
					label={submitLabel}
					onPress={submit}
					loading={pending}
					style={styles.button}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	form: { gap: 20 },
	saveBlock: { gap: 16 },
	note: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	buttons: { flexDirection: "row", gap: 12, marginTop: 4 },
	button: { flex: 1 },
});
