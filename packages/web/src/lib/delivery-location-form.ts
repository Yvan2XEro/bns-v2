import { z } from "zod";
import type { ShopLocation } from "../../../api/src/payload-types";
import { DISTRICTS } from "./checkout-form";
import { ZONE_DAYS, type ZoneDay } from "./delivery-zone-form";

export type HoursRow = NonNullable<ShopLocation["openingHours"]>[number];

export interface HoursGridDay {
	day: ZoneDay;
	open: boolean;
	opens: string;
	closes: string;
}

export type HoursGrid = HoursGridDay[];

const DEFAULT_OPENS = "08:00";
const DEFAULT_CLOSES = "18:00";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function emptyHoursGrid(): HoursGrid {
	return ZONE_DAYS.map((day) => ({
		day,
		open: false,
		opens: DEFAULT_OPENS,
		closes: DEFAULT_CLOSES,
	}));
}

/** The seven-day grid the editor shows, from the stored rows (one row per open day). */
export function hoursToGrid(
	rows:
		| readonly Pick<HoursRow, "day" | "opens" | "closes">[]
		| null
		| undefined,
): HoursGrid {
	const byDay = new Map((rows ?? []).map((row) => [row.day, row]));
	return ZONE_DAYS.map((day) => {
		const row = byDay.get(day);
		return row
			? { day, open: true, opens: row.opens, closes: row.closes }
			: { day, open: false, opens: DEFAULT_OPENS, closes: DEFAULT_CLOSES };
	});
}

/** The stored rows: closed days vanish, open days keep the week's order. */
export function gridToHours(
	grid: HoursGrid,
): Array<{ day: ZoneDay; opens: string; closes: string }> {
	return grid
		.filter((entry) => entry.open)
		.map(({ day, opens, closes }) => ({ day, opens, closes }));
}

const integer = (min: number, max: number, message: string) =>
	z
		.string()
		.trim()
		.refine(
			(value) =>
				/^\d+$/.test(value) && Number(value) >= min && Number(value) <= max,
			message,
		);

const coordinate = (min: number, max: number) =>
	z
		.string()
		.trim()
		.refine(
			(value) =>
				value !== "" &&
				Number.isFinite(Number(value)) &&
				Number(value) >= min &&
				Number(value) <= max,
			"coordinateInvalid",
		);

export const locationFormSchema = z
	.object({
		name: z.string().trim().min(2, "nameLength").max(60, "nameLength"),
		city: z.string().min(1, "cityRequired"),
		district: z.string().min(1, "districtRequired"),
		address: z.string().trim().max(200, "tooLong"),
		landmark: z
			.string()
			.trim()
			.min(5, "landmarkLength")
			.max(200, "landmarkLength"),
		lat: coordinate(-90, 90),
		lng: coordinate(-180, 180),
		phone: z.string().trim().max(30, "tooLong"),
		openingHours: z.array(
			z.object({
				day: z.enum(ZONE_DAYS),
				open: z.boolean(),
				opens: z.string(),
				closes: z.string(),
			}),
		),
		openingHoursNote: z.string().trim().max(200, "tooLong"),
		pickupEnabled: z.boolean(),
		pickupFee: integer(0, 5000, "pickupFeeInvalid"),
		holdDays: integer(1, 14, "holdDaysInvalid"),
		preparationHours: integer(0, 72, "preparationInvalid"),
		isDispatchOrigin: z.boolean(),
		isDefaultOrigin: z.boolean(),
		active: z.boolean(),
	})
	.superRefine((value, ctx) => {
		const open = value.openingHours.filter((entry) => entry.open);
		if (
			open.some(
				(entry) =>
					!TIME.test(entry.opens) ||
					!TIME.test(entry.closes) ||
					entry.opens >= entry.closes,
			)
		) {
			ctx.addIssue({
				code: "custom",
				path: ["openingHours"],
				message: "hoursOrder",
			});
		}
		if (value.pickupEnabled && open.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["openingHours"],
				message: "hoursRequired",
			});
		}
		if (value.isDefaultOrigin && (!value.isDispatchOrigin || !value.active)) {
			ctx.addIssue({
				code: "custom",
				path: ["isDefaultOrigin"],
				message: "defaultNeedsOrigin",
			});
		}
		const known = new Set((DISTRICTS[value.city] ?? []).map((d) => d.key));
		if (value.district !== "" && !known.has(value.district)) {
			ctx.addIssue({
				code: "custom",
				path: ["district"],
				message: "districtUnknown",
			});
		}
	});

export type LocationFormValues = z.infer<typeof locationFormSchema>;

export function emptyLocationForm(city: string): LocationFormValues {
	return {
		name: "",
		city,
		district: "",
		address: "",
		landmark: "",
		lat: "",
		lng: "",
		phone: "",
		openingHours: emptyHoursGrid(),
		openingHoursNote: "",
		pickupEnabled: false,
		pickupFee: "0",
		holdDays: "7",
		preparationHours: "2",
		isDispatchOrigin: false,
		isDefaultOrigin: false,
		active: true,
	};
}

export function locationToForm(location: ShopLocation): LocationFormValues {
	return {
		name: location.name,
		city: location.city,
		district: location.district,
		address: location.address ?? "",
		landmark: location.landmark,
		lat: String(location.gps.lat),
		lng: String(location.gps.lng),
		phone: location.phone ?? "",
		openingHours: hoursToGrid(location.openingHours),
		openingHoursNote: location.openingHoursNote ?? "",
		pickupEnabled: location.pickupEnabled ?? false,
		pickupFee: String(location.pickupFee ?? 0),
		holdDays: String(location.holdDays ?? 7),
		preparationHours: String(location.preparationHours ?? 2),
		isDispatchOrigin: location.isDispatchOrigin ?? false,
		isDefaultOrigin: location.isDefaultOrigin ?? false,
		active: location.active ?? true,
	};
}

/** The request body of `POST …/locations` and `PATCH /locations/{id}`. */
export interface LocationInput {
	name: string;
	city: string;
	district: string;
	address: string | null;
	landmark: string;
	gps: { lat: number; lng: number };
	phone: string | null;
	openingHours: Array<{ day: ZoneDay; opens: string; closes: string }>;
	openingHoursNote: string | null;
	pickupEnabled: boolean;
	pickupFee: number;
	holdDays: number;
	preparationHours: number;
	isDispatchOrigin: boolean;
	isDefaultOrigin: boolean;
	active: boolean;
}

const orNull = (value: string) => value.trim() || null;

export function locationToInput(values: LocationFormValues): LocationInput {
	return {
		name: values.name.trim(),
		city: values.city,
		district: values.district,
		address: orNull(values.address),
		landmark: values.landmark.trim(),
		gps: { lat: Number(values.lat), lng: Number(values.lng) },
		phone: orNull(values.phone),
		openingHours: gridToHours(values.openingHours),
		openingHoursNote: orNull(values.openingHoursNote),
		pickupEnabled: values.pickupEnabled,
		pickupFee: Number(values.pickupFee),
		holdDays: Number(values.holdDays),
		preparationHours: Number(values.preparationHours),
		isDispatchOrigin: values.isDispatchOrigin,
		isDefaultOrigin: values.isDefaultOrigin,
		active: values.active,
	};
}

/** An external link, never an embedded map. */
export function mapsUrl(
	lat: string | number,
	lng: string | number,
): string | null {
	const latitude = Number(lat);
	const longitude = Number(lng);
	if (
		String(lat).trim() === "" ||
		String(lng).trim() === "" ||
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude)
	) {
		return null;
	}
	return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
