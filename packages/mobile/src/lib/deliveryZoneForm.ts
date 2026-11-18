import { z } from "zod";
import {
	districtKeysOf,
	districtLabel,
	isLaunchCityKey,
	LAUNCH_CITY_KEYS,
	type LaunchCityKey,
} from "../../../api/src/lib/launchCities";
import type { DeliveryZone } from "../../../api/src/payload-types";

export { districtKeysOf, districtLabel, LAUNCH_CITY_KEYS };

export const ZONE_METHODS = ["seller_delivery", "courier"] as const;
export const ZONE_DAYS = [
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
	"sun",
] as const;
export type ZoneDay = (typeof ZONE_DAYS)[number];
export type ZoneMethod = (typeof ZONE_METHODS)[number];

/** The bounds `zoneInputSchema` in the API's `services/delivery/zones.ts` enforces. */
export const MAX_ZONE_FEE = 50_000;
export const MAX_ETA_HOURS = 720;

const digits = (message: string) => z.string().trim().regex(/^\d+$/, message);
const optionalDigits = (message: string) =>
	z
		.string()
		.trim()
		.refine((value) => value === "" || /^\d+$/.test(value), message);

export const zoneFormSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, "deliverySettings.errors.name")
			.max(40, "deliverySettings.errors.name"),
		city: z.custom<LaunchCityKey>(isLaunchCityKey),
		districts: z.array(z.string()).max(25),
		method: z.enum(ZONE_METHODS),
		courier: z.string(),
		fee: digits("deliverySettings.errors.fee").refine(
			(value) => Number(value) <= MAX_ZONE_FEE,
			"deliverySettings.errors.fee",
		),
		freeAbove: optionalDigits("deliverySettings.errors.freeAbove"),
		minimum: optionalDigits("deliverySettings.errors.minimum"),
		etaMinHours: digits("deliverySettings.errors.eta"),
		etaMaxHours: digits("deliverySettings.errors.eta"),
		cutoffTime: z
			.string()
			.trim()
			.refine(
				(value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
				"deliverySettings.errors.cutoff",
			),
		deliveryDays: z
			.array(z.enum(ZONE_DAYS))
			.min(1, "deliverySettings.errors.days"),
		codAllowed: z.boolean(),
		active: z.boolean(),
	})
	.superRefine((value, ctx) => {
		const min = Number(value.etaMinHours);
		const max = Number(value.etaMaxHours);
		const inRange = (n: number) => n >= 1 && n <= MAX_ETA_HOURS;
		if (!inRange(min))
			ctx.addIssue({
				code: "custom",
				path: ["etaMinHours"],
				message: "deliverySettings.errors.eta",
			});
		if (!inRange(max))
			ctx.addIssue({
				code: "custom",
				path: ["etaMaxHours"],
				message: "deliverySettings.errors.eta",
			});
		if (inRange(min) && inRange(max) && min > max)
			ctx.addIssue({
				code: "custom",
				path: ["etaMaxHours"],
				message: "deliverySettings.errors.etaOrder",
			});
		if (value.method === "courier" && value.courier === "")
			ctx.addIssue({
				code: "custom",
				path: ["courier"],
				message: "deliverySettings.errors.courier",
			});
		const valid = districtKeysOf(value.city);
		if (
			value.districts.some(
				(key) => key !== `${value.city}.other` && !valid.includes(key),
			)
		)
			ctx.addIssue({
				code: "custom",
				path: ["districts"],
				message: "deliverySettings.errors.districts",
			});
	});

export type ZoneFormValues = z.infer<typeof zoneFormSchema>;

export function emptyZoneValues(
	city: LaunchCityKey = "douala",
): ZoneFormValues {
	return {
		name: "",
		city,
		districts: [],
		method: "seller_delivery",
		courier: "",
		fee: "0",
		freeAbove: "",
		minimum: "",
		etaMinHours: "24",
		etaMaxHours: "48",
		cutoffTime: "",
		deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
		codAllowed: true,
		active: true,
	};
}

export function zoneToFormValues(zone: DeliveryZone): ZoneFormValues {
	return {
		name: zone.name,
		city: zone.city,
		districts: (zone.districts ?? []).map((district) => district.key),
		method: zone.method,
		courier:
			typeof zone.courier === "object" && zone.courier
				? zone.courier.id
				: (zone.courier ?? ""),
		fee: String(zone.fee),
		freeAbove:
			zone.freeAboveSubtotal == null ? "" : String(zone.freeAboveSubtotal),
		minimum: zone.minOrderSubtotal == null ? "" : String(zone.minOrderSubtotal),
		etaMinHours: String(zone.etaMinHours),
		etaMaxHours: String(zone.etaMaxHours),
		cutoffTime: zone.cutoffTime ?? "",
		deliveryDays: zone.deliveryDays,
		codAllowed: zone.codAllowed ?? true,
		active: zone.active ?? true,
	};
}

/** The body of `POST /api/shops/{id}/delivery-zones` and `PATCH /api/delivery-zones/{id}`. */
export function toZoneInput(values: ZoneFormValues) {
	return {
		name: values.name.trim(),
		scope: "same_city" as const,
		city: values.city,
		districts: values.districts,
		method: values.method,
		courier: values.method === "courier" ? values.courier : null,
		fee: Number(values.fee),
		freeAboveSubtotal:
			values.freeAbove === "" ? null : Number(values.freeAbove),
		minOrderSubtotal: values.minimum === "" ? null : Number(values.minimum),
		etaMinHours: Number(values.etaMinHours),
		etaMaxHours: Number(values.etaMaxHours),
		cutoffTime: values.cutoffTime === "" ? null : values.cutoffTime,
		deliveryDays: values.deliveryDays,
		codAllowed: values.codAllowed,
		active: values.active,
	};
}

/** Server refusals that belong to one field; the rest surface as a banner. */
export function zoneErrorField(
	code: string | undefined,
): keyof ZoneFormValues | null {
	switch (code) {
		case "delivery.zoneOverlap":
			return "districts";
		case "courier.cityNotServed":
			return "courier";
		case "delivery.cityNotLaunched":
			return "city";
		default:
			return null;
	}
}

export function groupZonesByCity(zones: readonly DeliveryZone[]) {
	const groups = new Map<LaunchCityKey, DeliveryZone[]>();
	for (const zone of zones) {
		groups.set(zone.city, [...(groups.get(zone.city) ?? []), zone]);
	}
	return LAUNCH_CITY_KEYS.flatMap((city) => {
		const rows = groups.get(city);
		return rows ? [{ city, zones: rows }] : [];
	});
}
