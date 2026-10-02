import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { AddressTextField } from "@/src/components/checkout/AddressTextField";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { CheckoutGate } from "@/src/components/checkout/CheckoutGate";
import { CheckoutHeader } from "@/src/components/checkout/CheckoutHeader";
import { useCheckoutFlow } from "@/src/components/checkout/CheckoutProvider";
import { ChoiceChips } from "@/src/components/checkout/ChoiceChips";
import { LocationField } from "@/src/components/checkout/LocationField";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useCart } from "@/src/hooks/useCart";
import { useAuth } from "@/src/lib/auth";
import {
	ADDRESS_ERROR_KEYS,
	addressDefaults,
	type CheckoutAddressValues,
	checkoutAddressSchema,
	DISTRICTS,
	otherDistrictOf,
	phoneFromTyping,
	toAddressInput,
} from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";

export default function CheckoutAddressScreen() {
	const c = useShopTheme();
	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<CheckoutHeader current={1} />
			<CheckoutGate>
				<AddressForm />
			</CheckoutGate>
		</SafeAreaView>
	);
}

function AddressForm() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const { launchCities } = useAppConfig();
	const cart = useCart();
	const { state, dispatch } = useCheckoutFlow();
	const shopCity = cart.data?.shop?.city ?? null;
	const servedCity = launchCities.some((city) => city.key === shopCity)
		? shopCity
		: null;
	const method = state.option?.method ?? "seller_delivery";
	const rejected = state.addressError;

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
	// The server refused a field the client let through: show it there. Memoised
	// because react-hook-form re-applies `errors` whenever its identity changes.
	const serverErrors = useMemo(
		() =>
			rejected
				? {
						[rejected]: {
							type: "server",
							message: ADDRESS_ERROR_KEYS[rejected],
						},
					}
				: undefined,
		[rejected],
	);
	const { control, formState, handleSubmit, setValue, watch } =
		useForm<CheckoutAddressValues>({
			resolver,
			defaultValues: addressDefaults(state.address, user, servedCity),
			errors: serverErrors,
		});
	const error = (field: keyof typeof ADDRESS_ERROR_KEYS) =>
		formState.errors[field]?.message;
	const city = watch("city");
	const district = watch("district");

	const submit = handleSubmit((values) => {
		dispatch({ type: "addressSubmitted", address: toAddressInput(values) });
		router.push("/checkout/delivery");
	});

	return (
		<KeyboardAwareScrollView
			contentContainerStyle={{ padding: 16, gap: 16 }}
			keyboardShouldPersistTaps="handled"
		>
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
				placeholder="+2376XXXXXXXX"
				keyboardType="phone-pad"
				autoComplete="tel"
				transform={phoneFromTyping}
				error={error("phone")}
			/>
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
			<CheckoutButton label={t("checkout.continue")} onPress={submit} />
		</KeyboardAwareScrollView>
	);
}
