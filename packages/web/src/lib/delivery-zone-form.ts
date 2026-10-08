import { z } from "zod";
import type { Courier, DeliveryZone } from "../../../api/src/payload-types";
import { ERROR_CODES } from "./apiError";
import { DISTRICTS } from "./checkout-form";

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

export const ZONE_METHODS = ["seller_delivery", "courier"] as const;
export type ZoneMethod = (typeof ZONE_METHODS)[number];

/** The service's own bounds (`zoneInputSchema`), restated only to fail early on the field. */
export const MAX_ZONE_FEE = 50_000;
export const MAX_ETA_HOURS = 720;
export const MAX_ZONE_DISTRICTS = 25;

const money = (max?: number) =>
	z
		.string()
		.trim()
		.refine(
			(value) =>
				value === "" ||
				(/^\d+$/.test(value) && (max === undefined || Number(value) <= max)),
			"moneyInvalid",
		);

const hours = z
	.string()
	.trim()
	.refine(
		(value) =>
			/^\d+$/.test(value) &&
			Number(value) >= 1 &&
			Number(value) <= MAX_ETA_HOURS,
		"etaInvalid",
	);

/** Amounts stay strings so an empty "free above" survives as "no threshold". */
export const zoneFormSchema = z
	.object({
		name: z.string().trim().min(2, "nameLength").max(40, "nameLength"),
		city: z.string().min(1, "cityRequired"),
		districts: z.array(z.string()).max(MAX_ZONE_DISTRICTS, "tooManyDistricts"),
		method: z.enum(ZONE_METHODS),
		courier: z.string(),
		fee: money(MAX_ZONE_FEE).refine((value) => value !== "", "moneyInvalid"),
		freeAboveSubtotal: money(),
		minOrderSubtotal: money(),
		etaMinHours: hours,
		etaMaxHours: hours,
		cutoffTime: z
			.string()
			.refine(
				(value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
				"cutoffInvalid",
			),
		deliveryDays: z.array(z.enum(ZONE_DAYS)).min(1, "daysRequired"),
		codAllowed: z.boolean(),
		active: z.boolean(),
	})
	.superRefine((value, ctx) => {
		if (value.method === "courier" && value.courier === "") {
			ctx.addIssue({
				code: "custom",
				path: ["courier"],
				message: "courierRequired",
			});
		}
		if (
			Number(value.etaMinHours) > Number(value.etaMaxHours) &&
			value.etaMinHours !== "" &&
			value.etaMaxHours !== ""
		) {
			ctx.addIssue({
				code: "custom",
				path: ["etaMaxHours"],
				message: "etaOrder",
			});
		}
		const known = new Set((DISTRICTS[value.city] ?? []).map((d) => d.key));
		if (value.districts.some((key) => !known.has(key))) {
			ctx.addIssue({
				code: "custom",
				path: ["districts"],
				message: "districtUnknown",
			});
		}
	});

export type ZoneFormValues = z.infer<typeof zoneFormSchema>;

export function emptyZoneForm(city: string): ZoneFormValues {
	return {
		name: "",
		city,
		districts: [],
		method: "seller_delivery",
		courier: "",
		fee: "",
		freeAboveSubtotal: "",
		minOrderSubtotal: "",
		etaMinHours: "24",
		etaMaxHours: "48",
		cutoffTime: "",
		deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
		codAllowed: true,
		active: true,
	};
}

const text = (value: number | null | undefined) =>
	value === null || value === undefined ? "" : String(value);

export function zoneCourierId(zone: DeliveryZone): string {
	const courier = zone.courier;
	if (!courier) return "";
	return typeof courier === "string" ? courier : courier.id;
}

export function zoneToForm(zone: DeliveryZone): ZoneFormValues {
	return {
		name: zone.name,
		city: zone.city,
		districts: (zone.districts ?? []).flatMap((d) => (d.key ? [d.key] : [])),
		method: zone.method,
		courier: zoneCourierId(zone),
		fee: String(zone.fee),
		freeAboveSubtotal: text(zone.freeAboveSubtotal),
		minOrderSubtotal: text(zone.minOrderSubtotal),
		etaMinHours: String(zone.etaMinHours),
		etaMaxHours: String(zone.etaMaxHours),
		cutoffTime: zone.cutoffTime ?? "",
		deliveryDays: zone.deliveryDays,
		codAllowed: zone.codAllowed ?? true,
		active: zone.active ?? true,
	};
}

/** The request body of `POST …/delivery-zones` and `PATCH /delivery-zones/{id}`. */
export interface ZoneInput {
	name: string;
	scope: "same_city";
	city: string;
	districts: string[];
	method: ZoneMethod;
	courier: string | null;
	fee: number;
	freeAboveSubtotal: number | null;
	minOrderSubtotal: number | null;
	etaMinHours: number;
	etaMaxHours: number;
	cutoffTime: string | null;
	deliveryDays: ZoneDay[];
	codAllowed: boolean;
	active: boolean;
}

const optionalAmount = (value: string) =>
	value.trim() === "" ? null : Number(value);

export function zoneToInput(values: ZoneFormValues): ZoneInput {
	return {
		name: values.name.trim(),
		scope: "same_city",
		city: values.city,
		districts: values.districts,
		method: values.method,
		courier: values.method === "courier" ? values.courier : null,
		fee: Number(values.fee),
		freeAboveSubtotal: optionalAmount(values.freeAboveSubtotal),
		minOrderSubtotal: optionalAmount(values.minOrderSubtotal),
		etaMinHours: Number(values.etaMinHours),
		etaMaxHours: Number(values.etaMaxHours),
		cutoffTime: values.cutoffTime === "" ? null : values.cutoffTime,
		deliveryDays: values.deliveryDays,
		codAllowed: values.codAllowed,
		active: values.active,
	};
}

/** Zones grouped by city (stable city order), each group by the shop's own `sortOrder`. */
export function groupZonesByCity(
	zones: readonly DeliveryZone[],
): Array<{ city: string; zones: DeliveryZone[] }> {
	const groups = new Map<string, DeliveryZone[]>();
	for (const zone of zones) {
		const group = groups.get(zone.city) ?? [];
		group.push(zone);
		groups.set(zone.city, group);
	}
	return [...groups.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([city, rows]) => ({
			city,
			zones: [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
		}));
}

/**
 * The form field and message key a refused save belongs to. Overlap is a
 * server-side rule (it depends on the shop's other zones), so it surfaces on
 * the district picker via `setError` rather than being re-derived here.
 */
export function zoneServerError(
	code: string,
): { field: "districts" | "courier" | "city"; message: string } | null {
	if (code === ERROR_CODES.deliveryZoneOverlap) {
		return { field: "districts", message: "overlap" };
	}
	if (code === ERROR_CODES.courierCityNotServed) {
		return { field: "courier", message: "courierCityNotServed" };
	}
	if (code === ERROR_CODES.deliveryCityNotLaunched) {
		return { field: "city", message: "cityNotLaunched" };
	}
	return null;
}

export type CourierTariff = NonNullable<Courier["tariffs"]>[number];

/** Active couriers able to serve a same-city zone in `city`. */
export function couriersForCity(
	couriers: readonly Courier[],
	city: string,
): Courier[] {
	return couriers.filter(
		(courier) =>
			courier.status === "active" &&
			courier.scopes.includes("same_city") &&
			courier.cities.includes(city as Courier["cities"][number]),
	);
}

/**
 * The tariff row a courier would quote for the zone's districts, most
 * specific first (a district row beats the whole-city row), shown as a cost
 * hint next to the courier select. For a multi-district zone it is the
 * dearest matching row, because the hint must not promise less than the
 * courier may charge.
 */
export function courierCostHint(
	courier: Courier | undefined,
	city: string,
	districts: readonly string[],
): CourierTariff | null {
	if (!courier) return null;
	const rows = (courier.tariffs ?? []).filter((row) => row.city === city);
	const districtRows = rows.filter(
		(row) => row.district && districts.includes(row.district),
	);
	if (districtRows.length > 0) {
		return districtRows.reduce((dearest, row) =>
			row.amount > dearest.amount ? row : dearest,
		);
	}
	return rows.find((row) => !row.district) ?? null;
}

export type UnavailableReason =
	| "cod_not_allowed"
	| "below_minimum"
	| "not_served";

/**
 * `Checkout.deliveryUnavailable.*` is the one set of sentences for these
 * reasons; the test-an-address panel renders the route's `unavailable` rows
 * through it unchanged.
 */
export const UNAVAILABLE_HINT_KEYS: Record<UnavailableReason, string> = {
	cod_not_allowed: "deliveryUnavailable.cod_not_allowed",
	below_minimum: "deliveryUnavailable.below_minimum",
	not_served: "deliveryUnavailable.not_served",
};

export function unavailableHint(option: {
	reason: UnavailableReason;
	minOrderSubtotal?: number;
}): { key: string; amount: number } {
	return {
		key: UNAVAILABLE_HINT_KEYS[option.reason],
		amount: option.minOrderSubtotal ?? 0,
	};
}

/** A district key's display label, falling back to the key itself. */
export function districtName(key: string): string {
	const city = key.split(".")[0] ?? "";
	return DISTRICTS[city]?.find((d) => d.key === key)?.label ?? key;
}
