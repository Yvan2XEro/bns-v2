import { z } from "zod";
import type { AddressInput, DeliveryMethod } from "../types/order";

/**
 * The launch cities' districts, transcribed from
 * `packages/api/src/lib/launchCities.ts` (the app cannot import the API
 * package). `checkoutForm.test.ts` compares this table to the API's slug for
 * slug, and `packages/api/tests/int/checkout-form-parity.int.spec.ts` to web's.
 */
const districts = (city: string, pairs: Array<[string, string]>) =>
	pairs.map(([slug, label]) => ({ key: `${city}.${slug}`, label }));

export const DISTRICTS: Record<
	string,
	Array<{ key: string; label: string }>
> = {
	douala: districts("douala", [
		["akwa", "Akwa"],
		["bonanjo", "Bonanjo"],
		["bonapriso", "Bonapriso"],
		["bali", "Bali"],
		["deido", "Deïdo"],
		["bonaberi", "Bonabéri"],
		["bepanda", "Bépanda"],
		["makepe", "Makepe"],
		["bonamoussadi", "Bonamoussadi"],
		["kotto", "Kotto"],
		["logbessou", "Logbessou"],
		["logpom", "Logpom"],
		["ndokoti", "Ndokoti"],
		["new-bell", "New Bell"],
		["nyalla", "Nyalla"],
		["pk8-pk14", "PK8–PK14"],
		["yassa", "Yassa"],
		["village", "Village"],
		["japoma", "Japoma"],
		["bonadibong", "Bonadibong"],
	]),
	yaounde: districts("yaounde", [
		["bastos", "Bastos"],
		["centre-ville", "Centre-ville"],
		["mvog-mbi", "Mvog-Mbi"],
		["essos", "Essos"],
		["mokolo", "Mokolo"],
		["biyem-assi", "Biyem-Assi"],
		["mendong", "Mendong"],
		["nkolbisson", "Nkolbisson"],
		["ngousso", "Ngousso"],
		["omnisport", "Omnisport"],
		["emana", "Emana"],
		["etoudi", "Etoudi"],
		["nsimeyong", "Nsimeyong"],
		["odza", "Odza"],
		["mimboman", "Mimboman"],
		["ekounou", "Ekounou"],
		["melen", "Melen"],
		["nlongkak", "Nlongkak"],
		["mvan", "Mvan"],
		["efoulan", "Efoulan"],
	]),
};

export const otherDistrictOf = (city: string) => `${city}.other`;

function isDistrictOf(city: string, key: string): boolean {
	return (
		key === otherDistrictOf(city) ||
		(DISTRICTS[city] ?? []).some((d) => d.key === key)
	);
}

/** The label a district key reads as; the buyer's own text for `.other`. */
export function districtName(address: AddressInput): string {
	return (
		address.districtOther ??
		DISTRICTS[address.city]?.find((d) => d.key === address.district)?.label ??
		address.district
	);
}

/** A Cameroonian mobile: the delivery phone receives the confirmation SMS. */
export const CHECKOUT_PHONE_PATTERN = /^\+2376\d{8}$/;

/** Keeps what the buyer types close to E.164 without guessing a prefix. */
export function phoneFromTyping(text: string): string {
	return text.replace(/[\s-]/g, "");
}

const gpsSchema = z.object({
	lat: z.number(),
	lng: z.number(),
	accuracyMeters: z.number().optional(),
});

const baseSchema = z.object({
	recipientName: z.string(),
	phone: z.string(),
	city: z.string(),
	district: z.string(),
	districtOther: z.string(),
	landmark: z.string(),
	instructions: z.string(),
	gps: gpsSchema.optional(),
});

export type CheckoutAddressValues = z.infer<typeof baseSchema>;
export type AddressField = Exclude<keyof CheckoutAddressValues, "gps">;
export type GpsValue = z.infer<typeof gpsSchema>;

/** Each value is a full translation key; the field renders `t(message)`. */
export const ADDRESS_ERROR_KEYS = {
	recipientName: "checkout.errorRecipientName",
	phone: "checkout.errorPhone",
	city: "checkout.errorCity",
	district: "checkout.errorDistrict",
	districtOther: "checkout.errorDistrictOther",
	landmark: "checkout.errorLandmark",
	instructions: "checkout.errorInstructions",
} as const satisfies Record<AddressField, string>;

/**
 * The one mobile copy of `parseDeliveryAddress` in
 * `packages/api/src/services/checkout.ts`, rule for rule the same as web's
 * `checkout-form.ts`. `method` matters for the landmark alone: required for
 * `seller_delivery`, bounded whenever it is given.
 */
export function checkoutAddressSchema(
	cityKeys: readonly string[],
	method: DeliveryMethod,
) {
	return baseSchema.superRefine((v, ctx) => {
		const fail = (path: AddressField) =>
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: [path],
				message: ADDRESS_ERROR_KEYS[path],
			});
		const name = v.recipientName.trim();
		if (name.length < 2 || name.length > 60) fail("recipientName");
		if (!CHECKOUT_PHONE_PATTERN.test(v.phone)) fail("phone");
		if (!cityKeys.includes(v.city)) fail("city");
		if (!isDistrictOf(v.city, v.district)) fail("district");
		const other = v.districtOther.trim();
		if (
			v.district === otherDistrictOf(v.city) &&
			(other.length < 2 || other.length > 60)
		)
			fail("districtOther");
		const landmark = v.landmark.trim();
		if (
			(method !== "pickup" || landmark) &&
			(landmark.length < 5 || landmark.length > 200)
		)
			fail("landmark");
		if (v.instructions.length > 300) fail("instructions");
	});
}

/**
 * The form's starting values: what the buyer already entered, else their
 * account's name and phone, and the shop's city when it is a launch city —
 * delivery is same-city only, so that is the one city that can work.
 */
export function addressDefaults(
	initial: AddressInput | null,
	account: { name?: string | null; phone?: string | null } | null,
	servedCity: string | null,
): CheckoutAddressValues {
	return {
		recipientName: initial?.recipientName ?? account?.name ?? "",
		phone: initial?.phone ?? account?.phone ?? "",
		city: initial?.city ?? servedCity ?? "",
		district: initial?.district ?? "",
		districtOther: initial?.districtOther ?? "",
		landmark: initial?.landmark ?? "",
		instructions: initial?.instructions ?? "",
		gps: initial?.gps
			? {
					lat: initial.gps.lat,
					lng: initial.gps.lng,
					...(initial.gps.accuracyMeters !== undefined
						? { accuracyMeters: initial.gps.accuracyMeters }
						: {}),
				}
			: undefined,
	};
}

export function toAddressInput(values: CheckoutAddressValues): AddressInput {
	const isOther = values.district === otherDistrictOf(values.city);
	const landmark = values.landmark.trim();
	const instructions = values.instructions.trim();
	return {
		recipientName: values.recipientName.trim(),
		phone: values.phone,
		city: values.city,
		district: values.district,
		...(isOther ? { districtOther: values.districtOther.trim() } : {}),
		...(landmark ? { landmark } : {}),
		...(values.gps ? { gps: values.gps } : {}),
		...(instructions ? { instructions } : {}),
	};
}

/** A device fix as the address stores it; the accuracy is whole metres. */
export function gpsFromCoords(coords: {
	latitude: number;
	longitude: number;
	accuracy: number | null;
}): GpsValue {
	return {
		lat: coords.latitude,
		lng: coords.longitude,
		...(coords.accuracy !== null
			? { accuracyMeters: Math.round(coords.accuracy) }
			: {}),
	};
}

function isAddressField(value: string): value is AddressField {
	return Object.hasOwn(ADDRESS_ERROR_KEYS, value);
}

/**
 * `checkout.addressInvalid` carries `details.field` (`"delivery.landmark"`);
 * mobile's `ApiError` keeps the whole response body as `data`. Anything else
 * names no field and stays a form-level error.
 */
export function addressFieldOf(error: unknown): AddressField | null {
	if (!error || typeof error !== "object" || !("data" in error)) return null;
	const body = error.data;
	if (!body || typeof body !== "object" || !("details" in body)) return null;
	const details = body.details;
	if (!details || typeof details !== "object" || !("field" in details))
		return null;
	const path = details.field;
	if (typeof path !== "string") return null;
	const field = path.replace(/^delivery\./, "");
	return isAddressField(field) ? field : null;
}

export function googleMapsUrl(lat: number, lng: number): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** The SMS code: six digits, as `CONFIRMATION_CODE_LENGTH` issues it. */
export const confirmationCodeSchema = z.object({
	code: z
		.string()
		.trim()
		.regex(/^\d{6}$/, "checkout.errorCode"),
});

export type ConfirmationCodeValues = z.infer<typeof confirmationCodeSchema>;
