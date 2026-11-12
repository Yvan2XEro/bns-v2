import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { FormRow } from "@/src/components/layout/FormRow";
import { formStyles } from "@/src/components/seller/formStyles";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { dangerInk } from "@/src/components/shop/ink";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useActiveCouriers } from "@/src/hooks/useDeliverySettings";
import { ApiError } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	districtKeysOf,
	districtLabel,
	LAUNCH_CITY_KEYS,
	ZONE_DAYS,
	ZONE_METHODS,
	type ZoneFormValues,
	zoneErrorField,
	zoneFormSchema,
} from "@/src/lib/deliveryZoneForm";
import { useTranslation } from "@/src/lib/i18n";
import { ChipField, ChoiceField, TextField, ToggleField } from "./FormFields";

/** Usual same-day cutoffs: one tap fills HH:MM, so "17h" never reaches the check. */
const CUTOFF_PRESETS = ["12:00", "14:00", "16:00", "17:00", "18:00"] as const;

function toggled<T>(list: readonly T[], item: T): T[] {
	return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function ZoneForm({
	initial,
	pending,
	error,
	onSubmit,
}: {
	initial: ZoneFormValues;
	pending: boolean;
	error: unknown;
	onSubmit: (values: ZoneFormValues) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { couriersEnabled } = useAppConfig();
	const form = useForm<ZoneFormValues>({
		resolver: zodResolver(zoneFormSchema),
		defaultValues: initial,
	});
	const { control, watch, setValue, formState } = form;
	const city = watch("city");
	const method = watch("method");
	const couriers = useActiveCouriers(
		city,
		couriersEnabled && method === "courier",
	);
	const errorOf = (name: keyof ZoneFormValues) =>
		formState.errors[name]?.message;
	const serverCode = error instanceof ApiError ? error.code : undefined;
	const serverField = zoneErrorField(serverCode);
	// One translated message for any refusal. A field-bound code is shown under
	// its field; every other error falls back to the banner above Save.
	const serverMessage = error
		? resolveErrorMessage(error, t, t("deliverySettings.saveFailed"))
		: undefined;
	const serverErrorOf = (name: keyof ZoneFormValues) =>
		serverField === name ? serverMessage : undefined;
	const methods = couriersEnabled
		? ZONE_METHODS
		: (["seller_delivery"] as const);

	return (
		<View style={{ gap: 14 }}>
			<Controller
				control={control}
				name="name"
				render={({ field }) => (
					<TextField
						label={t("deliverySettings.fieldName")}
						value={field.value}
						onChange={field.onChange}
						error={errorOf("name")}
					/>
				)}
			/>
			<ChoiceField
				label={t("deliverySettings.fieldCity")}
				options={LAUNCH_CITY_KEYS}
				value={city}
				onChange={(next) => {
					setValue("city", next);
					setValue("districts", []);
					setValue("courier", "");
				}}
				labelOf={(key) => (key === "douala" ? "Douala" : "Yaoundé")}
				serverError={serverErrorOf("city")}
			/>
			<Controller
				control={control}
				name="districts"
				render={({ field }) => (
					<ChipField
						label={t("deliverySettings.fieldDistricts")}
						options={districtKeysOf(city)}
						selected={field.value}
						onToggle={(key) => field.onChange(toggled(field.value, key))}
						labelOf={(key) => districtLabel(key) ?? key}
						error={errorOf("districts")}
						serverError={serverErrorOf("districts")}
					/>
				)}
			/>
			<ChoiceField
				label={t("deliverySettings.fieldMethod")}
				options={methods}
				value={method}
				onChange={(next) => setValue("method", next)}
				labelOf={(key) =>
					key === "courier"
						? t("deliverySettings.methodCourier")
						: t("deliverySettings.methodSeller")
				}
			/>
			{method === "courier" ? (
				<Controller
					control={control}
					name="courier"
					render={({ field }) =>
						couriers.data && couriers.data.length === 0 ? (
							<Text style={{ fontFamily: Fonts.body, color: c.muted }}>
								{t("deliverySettings.noCourier")}
							</Text>
						) : (
							<ChoiceField
								label={t("deliverySettings.fieldCourier")}
								options={(couriers.data ?? []).map((courier) => courier.id)}
								value={field.value}
								onChange={field.onChange}
								labelOf={(id) =>
									couriers.data?.find((x) => x.id === id)?.name ?? id
								}
							/>
						)
					}
				/>
			) : null}
			{errorOf("courier") || serverErrorOf("courier") ? (
				<Text
					accessibilityRole="alert"
					style={{ fontFamily: Fonts.body, color: dangerInk(c) }}
				>
					{errorOf("courier")
						? t(errorOf("courier") ?? "")
						: serverErrorOf("courier")}
				</Text>
			) : null}
			<FormRow>
				{(["fee", "freeAbove", "minimum"] as const).map((name) => (
					<Controller
						key={name}
						control={control}
						name={name}
						render={({ field }) => (
							<TextField
								label={t(
									name === "fee"
										? "deliverySettings.fieldFee"
										: name === "freeAbove"
											? "deliverySettings.fieldFreeAbove"
											: "deliverySettings.fieldMinimum",
								)}
								value={field.value}
								onChange={field.onChange}
								keyboardType="number-pad"
								error={errorOf(name)}
							/>
						)}
					/>
				))}
			</FormRow>
			<FormRow>
				{(["etaMinHours", "etaMaxHours"] as const).map((name) => (
					<Controller
						key={name}
						control={control}
						name={name}
						render={({ field }) => (
							<TextField
								label={t(
									name === "etaMinHours"
										? "deliverySettings.fieldEtaMin"
										: "deliverySettings.fieldEtaMax",
								)}
								value={field.value}
								onChange={field.onChange}
								keyboardType="number-pad"
								error={errorOf(name)}
							/>
						)}
					/>
				))}
			</FormRow>
			<Controller
				control={control}
				name="cutoffTime"
				render={({ field }) => (
					<View style={{ gap: 8 }}>
						<TextField
							label={t("deliverySettings.fieldCutoff")}
							value={field.value}
							onChange={field.onChange}
							placeholder="17:00"
							error={errorOf("cutoffTime")}
						/>
						<View style={formStyles.chips}>
							{CUTOFF_PRESETS.map((time) => {
								const on = field.value === time;
								return (
									<Pressable
										key={time}
										onPress={() => field.onChange(on ? "" : time)}
										accessibilityRole="radio"
										accessibilityState={{ checked: on }}
										accessibilityLabel={time}
										style={[
											formStyles.chip,
											{
												borderColor: on ? c.primary : c.border,
												backgroundColor: on ? c.primarySoft : c.card,
											},
										]}
									>
										<Text
											style={[
												formStyles.chipText,
												{ color: on ? c.link : c.body },
											]}
										>
											{time}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</View>
				)}
			/>
			<Controller
				control={control}
				name="deliveryDays"
				render={({ field }) => (
					<ChipField
						label={t("deliverySettings.fieldDays")}
						options={ZONE_DAYS}
						selected={field.value}
						onToggle={(day) => field.onChange(toggled(field.value, day))}
						labelOf={(day) => t(`deliverySettings.days.${day}`)}
						error={errorOf("deliveryDays")}
					/>
				)}
			/>
			<Controller
				control={control}
				name="codAllowed"
				render={({ field }) => (
					<ToggleField
						label={t("deliverySettings.fieldCod")}
						value={field.value}
						onChange={field.onChange}
					/>
				)}
			/>
			<Controller
				control={control}
				name="active"
				render={({ field }) => (
					<ToggleField
						label={t("deliverySettings.fieldActive")}
						value={field.value}
						onChange={field.onChange}
					/>
				)}
			/>
			{serverMessage && !serverField ? (
				<Text
					accessibilityRole="alert"
					style={{ fontFamily: Fonts.body, color: dangerInk(c) }}
				>
					{serverMessage}
				</Text>
			) : null}
			<SheetButton
				label={
					pending ? t("deliverySettings.saving") : t("deliverySettings.save")
				}
				pending={pending}
				onPress={form.handleSubmit(onSubmit)}
			/>
		</View>
	);
}
