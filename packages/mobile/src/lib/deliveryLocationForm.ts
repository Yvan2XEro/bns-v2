import { z } from "zod";
import {
	isLaunchCityKey,
	type LaunchCityKey,
} from "../../../api/src/lib/launchCities";
import type { ShopLocation } from "../../../api/src/payload-types";
import { ZONE_DAYS, type ZoneDay } from "./deliveryZoneForm";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const hoursRow = z.object({
	day: z.enum(ZONE_DAYS),
	opens: z.string().regex(TIME, "deliverySettings.errors.hours"),
	closes: z.string().regex(TIME, "deliverySettings.errors.hours"),
});

const optionalInt = (max: number, message: string) =>
	z
		.string()
		.trim()
		.refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= max), message);

const coordinate = (limit: number) =>
	z
		.string()
		.trim()
		.refine((v) => {
			const n = Number(v);
			return v !== "" && Number.isFinite(n) && Math.abs(n) <= limit;
		}, "deliverySettings.errors.gps");

export const locationFormSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, "deliverySettings.errors.name")
			.max(60, "deliverySettings.errors.name"),
		city: z.custom<LaunchCityKey>(isLaunchCityKey),
		district: z
			.string()
			.trim()
			.min(2, "deliverySettings.errors.district")
			.max(100, "deliverySettings.errors.district"),
		address: z.string().trim().max(200),
		landmark: z
			.string()
			.trim()
			.min(5, "deliverySettings.errors.landmark")
			.max(200, "deliverySettings.errors.landmark"),
		lat: coordinate(90),
		lng: coordinate(180),
		phone: z.string().trim().max(30),
		openingHours: z.array(hoursRow),
		pickupEnabled: z.boolean(),
		pickupFee: optionalInt(5000, "deliverySettings.errors.pickupFee"),
		holdDays: z
			.string()
			.trim()
			.refine(
				(v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 14,
				"deliverySettings.errors.holdDays",
			),
		isDispatchOrigin: z.boolean(),
		isDefaultOrigin: z.boolean(),
		active: z.boolean(),
	})
	.superRefine((value, ctx) => {
		if (value.openingHours.some((row) => row.opens >= row.closes))
			ctx.addIssue({
				code: "custom",
				path: ["openingHours"],
				message: "deliverySettings.errors.hoursOrder",
			});
		if (value.pickupEnabled && value.openingHours.length === 0)
			ctx.addIssue({
				code: "custom",
				path: ["openingHours"],
				message: "deliverySettings.errors.hoursRequired",
			});
		if (value.isDefaultOrigin && (!value.isDispatchOrigin || !value.active))
			ctx.addIssue({
				code: "custom",
				path: ["isDefaultOrigin"],
				message: "deliverySettings.errors.defaultOrigin",
			});
	});

export type LocationFormValues = z.infer<typeof locationFormSchema>;
export type HoursRow = LocationFormValues["openingHours"][number];

export function emptyLocationValues(
	city: LaunchCityKey = "douala",
): LocationFormValues {
	return {
		name: "",
		city,
		district: "",
		address: "",
		landmark: "",
		lat: "",
		lng: "",
		phone: "",
		openingHours: [],
		pickupEnabled: false,
		pickupFee: "0",
		holdDays: "7",
		isDispatchOrigin: true,
		isDefaultOrigin: false,
		active: true,
	};
}

export function locationToFormValues(
	location: ShopLocation,
): LocationFormValues {
	return {
		name: location.name,
		city: location.city,
		district: location.district,
		address: location.address ?? "",
		landmark: location.landmark,
		lat: String(location.gps.lat),
		lng: String(location.gps.lng),
		phone: location.phone ?? "",
		openingHours: (location.openingHours ?? []).map(
			({ day, opens, closes }) => ({ day, opens, closes }),
		),
		pickupEnabled: location.pickupEnabled ?? false,
		pickupFee: String(location.pickupFee ?? 0),
		holdDays: String(location.holdDays ?? 7),
		isDispatchOrigin: location.isDispatchOrigin ?? false,
		isDefaultOrigin: location.isDefaultOrigin ?? false,
		active: location.active ?? true,
	};
}

/** Rows come back in the week's order whatever order the seller added them. */
export function sortedHours(rows: readonly HoursRow[]): HoursRow[] {
	const rank = (day: ZoneDay) => ZONE_DAYS.indexOf(day);
	return [...rows].sort(
		(a, b) => rank(a.day) - rank(b.day) || a.opens.localeCompare(b.opens),
	);
}

/** Adds a day with the previous row's hours, or a plain 08:00-18:00 shop day. */
export function addHoursRow(
	rows: readonly HoursRow[],
	day: ZoneDay,
): HoursRow[] {
	if (rows.some((row) => row.day === day)) return [...rows];
	const last = rows.at(-1);
	return sortedHours([
		...rows,
		{ day, opens: last?.opens ?? "08:00", closes: last?.closes ?? "18:00" },
	]);
}

export function toLocationInput(values: LocationFormValues) {
	return {
		name: values.name.trim(),
		city: values.city,
		district: values.district.trim(),
		address: values.address.trim() || null,
		landmark: values.landmark.trim(),
		gps: { lat: Number(values.lat), lng: Number(values.lng) },
		phone: values.phone.trim() || null,
		openingHours: sortedHours(values.openingHours),
		pickupEnabled: values.pickupEnabled,
		pickupFee: Number(values.pickupFee || "0"),
		holdDays: Number(values.holdDays),
		isDispatchOrigin: values.isDispatchOrigin,
		isDefaultOrigin: values.isDefaultOrigin,
		active: values.active,
	};
}
