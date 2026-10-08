import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Text, View } from "react-native";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
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
						error={
							errorOf("districts") ??
							(serverField === "districts" ? serverCode : undefined)
						}
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
							<Text style={{ color: c.muted }}>
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
			{errorOf("courier") ? (
				<Text accessibilityRole="alert" style={{ color: c.danger }}>
					{t(errorOf("courier") ?? "")}
				</Text>
			) : null}
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
			<Controller
				control={control}
				name="cutoffTime"
				render={({ field }) => (
					<TextField
						label={t("deliverySettings.fieldCutoff")}
						value={field.value}
						onChange={field.onChange}
						placeholder="17:00"
						error={errorOf("cutoffTime")}
					/>
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
			{error && !serverField ? (
				<Text accessibilityRole="alert" style={{ color: c.danger }}>
					{resolveErrorMessage(error, t, t("deliverySettings.saveFailed"))}
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
