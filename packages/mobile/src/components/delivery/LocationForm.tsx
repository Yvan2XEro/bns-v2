import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FormRow } from "@/src/components/layout/FormRow";
import {
	FieldError,
	SheetButton,
} from "@/src/components/sellerOrders/FormBits";
import { dangerInk } from "@/src/components/shop/ink";
import { useShopTheme } from "@/src/components/shop/theme";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { googleMapsUrl } from "@/src/lib/checkoutForm";
import {
	addHoursRow,
	type LocationFormValues,
	locationFormSchema,
} from "@/src/lib/deliveryLocationForm";
import { LAUNCH_CITY_KEYS, ZONE_DAYS } from "@/src/lib/deliveryZoneForm";
import { useTranslation } from "@/src/lib/i18n";
import { ChoiceField, TextField, ToggleField } from "./FormFields";

/** A GPS fix indoors can take half a minute; past this, ask to retry outside. */
const LOCATE_TIMEOUT_MS = 20_000;

export function LocationForm({
	initial,
	pending,
	error,
	onSubmit,
}: {
	initial: LocationFormValues;
	pending: boolean;
	error: unknown;
	onSubmit: (values: LocationFormValues) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const form = useForm<LocationFormValues>({
		resolver: zodResolver(locationFormSchema),
		defaultValues: initial,
	});
	const { control, watch, setValue, formState } = form;
	// "denied" is a refused permission; "unavailable" is a GPS that found
	// nothing in time (often indoors), which needs a different next step.
	const [positionIssue, setPositionIssue] = useState<
		"denied" | "unavailable" | null
	>(null);
	const [locating, setLocating] = useState(false);
	const hours = watch("openingHours");
	const lat = watch("lat");
	const lng = watch("lng");
	const errorOf = (name: keyof LocationFormValues) => {
		const message = formState.errors[name]?.message;
		return typeof message === "string" ? message : undefined;
	};

	const locate = async () => {
		if (locating) return;
		setLocating(true);
		try {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") {
				setPositionIssue("denied");
				return;
			}
			const position = await Promise.race([
				Location.getCurrentPositionAsync({
					accuracy: Location.Accuracy.Balanced,
				}),
				new Promise<null>((resolve) =>
					setTimeout(() => resolve(null), LOCATE_TIMEOUT_MS),
				),
			]);
			if (!position) {
				setPositionIssue("unavailable");
				return;
			}
			setPositionIssue(null);
			setValue("lat", String(position.coords.latitude), {
				shouldValidate: true,
			});
			setValue("lng", String(position.coords.longitude), {
				shouldValidate: true,
			});
		} catch {
			setPositionIssue("unavailable");
		} finally {
			setLocating(false);
		}
	};

	const text = (
		name:
			| "name"
			| "district"
			| "address"
			| "landmark"
			| "phone"
			| "pickupFee"
			| "holdDays",
		labelKey: string,
		keyboardType?: "number-pad" | "phone-pad",
	) => (
		<Controller
			control={control}
			name={name}
			render={({ field }) => (
				<TextField
					label={t(labelKey)}
					value={field.value}
					onChange={field.onChange}
					keyboardType={keyboardType}
					error={errorOf(name)}
				/>
			)}
		/>
	);
	const toggle = (
		name: "pickupEnabled" | "isDispatchOrigin" | "isDefaultOrigin" | "active",
		labelKey: string,
	) => (
		<Controller
			control={control}
			name={name}
			render={({ field }) => (
				<ToggleField
					label={t(labelKey)}
					value={field.value}
					onChange={field.onChange}
				/>
			)}
		/>
	);

	return (
		<View style={{ gap: 14 }}>
			{text("name", "deliverySettings.fieldLocName")}
			<ChoiceField
				label={t("deliverySettings.fieldCity")}
				options={LAUNCH_CITY_KEYS}
				value={watch("city")}
				onChange={(next) => setValue("city", next)}
				labelOf={(key) => (key === "douala" ? "Douala" : "Yaoundé")}
			/>
			{text("district", "deliverySettings.fieldDistrict")}
			{text("address", "deliverySettings.fieldAddress")}
			{text("landmark", "deliverySettings.fieldLandmark")}
			<Pressable
				onPress={() => void locate()}
				disabled={locating}
				accessibilityRole="button"
				accessibilityLabel={t("deliverySettings.useMyPosition")}
				accessibilityState={{ busy: locating, disabled: locating }}
				style={{
					minHeight: 48,
					flexDirection: "row",
					alignItems: "center",
					gap: 8,
				}}
			>
				{locating ? (
					<ActivityIndicator size="small" color={c.link} />
				) : (
					<Ionicons name="locate-outline" size={18} color={c.link} />
				)}
				<Text style={{ color: c.link }}>
					{locating
						? t("deliverySettings.locating")
						: t("deliverySettings.useMyPosition")}
				</Text>
			</Pressable>
			{positionIssue ? (
				<FieldError
					message={
						positionIssue === "denied"
							? t("deliverySettings.positionDenied")
							: t("deliverySettings.positionUnavailable")
					}
				/>
			) : null}
			<FormRow>
				<Controller
					control={control}
					name="lat"
					render={({ field }) => (
						<TextField
							label={t("deliverySettings.fieldLat")}
							value={field.value}
							onChange={field.onChange}
							keyboardType="decimal-pad"
							error={errorOf("lat")}
						/>
					)}
				/>
				<Controller
					control={control}
					name="lng"
					render={({ field }) => (
						<TextField
							label={t("deliverySettings.fieldLng")}
							value={field.value}
							onChange={field.onChange}
							keyboardType="decimal-pad"
							error={errorOf("lng")}
						/>
					)}
				/>
			</FormRow>
			{lat !== "" &&
			lng !== "" &&
			Number.isFinite(Number(lat)) &&
			Number.isFinite(Number(lng)) ? (
				<Pressable
					onPress={() =>
						void Linking.openURL(googleMapsUrl(Number(lat), Number(lng)))
					}
					accessibilityRole="link"
					accessibilityLabel={t("deliverySettings.openInMaps")}
					style={{ minHeight: 48, justifyContent: "center" }}
				>
					<Text style={{ color: c.link }}>
						{t("deliverySettings.openInMaps")}
					</Text>
				</Pressable>
			) : null}
			{text("phone", "deliverySettings.fieldPhone", "phone-pad")}
			{toggle("pickupEnabled", "deliverySettings.fieldPickupEnabled")}
			{text("pickupFee", "deliverySettings.fieldPickupFee", "number-pad")}
			{text("holdDays", "deliverySettings.fieldHoldDays", "number-pad")}
			<Text style={{ color: c.body }}>{t("deliverySettings.fieldHours")}</Text>
			{hours.map((row, index) => (
				<View
					key={row.day}
					style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}
				>
					<Text style={{ width: 40, color: c.text }}>
						{t(`deliverySettings.days.${row.day}`)}
					</Text>
					<View style={{ flex: 1 }}>
						<TextField
							label="HH:MM"
							value={row.opens}
							onChange={(opens) =>
								setValue(`openingHours.${index}.opens`, opens, {
									shouldValidate: true,
								})
							}
						/>
					</View>
					<View style={{ flex: 1 }}>
						<TextField
							label="HH:MM"
							value={row.closes}
							onChange={(closes) =>
								setValue(`openingHours.${index}.closes`, closes, {
									shouldValidate: true,
								})
							}
						/>
					</View>
					<Pressable
						onPress={() =>
							setValue(
								"openingHours",
								hours.filter((_, i) => i !== index),
								{ shouldValidate: true },
							)
						}
						accessibilityRole="button"
						accessibilityLabel={t("deliverySettings.removeRow")}
						style={{
							minHeight: 48,
							minWidth: 48,
							justifyContent: "center",
							alignItems: "center",
						}}
					>
						<Ionicons
							name="close-circle-outline"
							size={22}
							color={dangerInk(c)}
						/>
					</Pressable>
				</View>
			))}
			<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
				{ZONE_DAYS.filter((day) => !hours.some((row) => row.day === day)).map(
					(day) => (
						<Pressable
							key={day}
							onPress={() =>
								setValue("openingHours", addHoursRow(hours, day), {
									shouldValidate: true,
								})
							}
							accessibilityRole="button"
							accessibilityLabel={t("deliverySettings.addDay", {
								day: t(`deliverySettings.days.${day}`),
							})}
							style={{
								minHeight: 48,
								minWidth: 44,
								justifyContent: "center",
								paddingHorizontal: 10,
								borderWidth: 1,
								borderRadius: 12,
								borderColor: c.border,
							}}
						>
							<Text style={{ color: c.link }}>
								+ {t(`deliverySettings.days.${day}`)}
							</Text>
						</Pressable>
					),
				)}
			</View>
			<FieldError
				message={
					errorOf("openingHours") ? t(errorOf("openingHours") ?? "") : undefined
				}
			/>
			{toggle("isDispatchOrigin", "deliverySettings.fieldDispatch")}
			{toggle("isDefaultOrigin", "deliverySettings.fieldDefaultOrigin")}
			<FieldError
				message={
					errorOf("isDefaultOrigin")
						? t(errorOf("isDefaultOrigin") ?? "")
						: undefined
				}
			/>
			{toggle("active", "deliverySettings.fieldActive")}
			{error ? (
				<Text accessibilityRole="alert" style={{ color: dangerInk(c) }}>
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
