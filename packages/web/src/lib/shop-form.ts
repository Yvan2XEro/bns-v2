import { z } from "zod";
import type { Place } from "../../../api/src/contracts/places";
import { E164_PATTERN } from "./phone-input";
import { HANDLE_MAX, HANDLE_MIN, isHandleFormatValid } from "./shop-handle";

export const SHOP_NAME_MIN = 2;
export const SHOP_NAME_MAX = 60;
export const SHOP_CATEGORIES_MAX = 5;
export const SHOP_DESCRIPTION_MAX = 1000;

/**
 * The create-shop form. Mirrors what `POST /api/shops` accepts; the server
 * stays the authority on reserved words, uniqueness and the phone gate, so
 * nothing here tries to predict those.
 */
export const createShopSchema = z.object({
	name: z.string().trim().min(SHOP_NAME_MIN).max(SHOP_NAME_MAX),
	handle: z
		.string()
		.min(HANDLE_MIN)
		.max(HANDLE_MAX)
		.refine(isHandleFormatValid),
	city: z.custom<Place | null>(),
	categories: z.array(z.string()).max(SHOP_CATEGORIES_MAX),
});

export type CreateShopValues = z.infer<typeof createShopSchema>;

/** The profile tab: name, description, city, categories and the two media fields. */
export const shopProfileSchema = z.object({
	name: z.string().trim().min(SHOP_NAME_MIN).max(SHOP_NAME_MAX),
	description: z.string().max(SHOP_DESCRIPTION_MAX),
	city: z.custom<Place | null>(),
	categories: z.array(z.string()).max(SHOP_CATEGORIES_MAX),
	logo: z.object({ id: z.string().nullable(), url: z.string().nullable() }),
	banner: z.object({ id: z.string().nullable(), url: z.string().nullable() }),
});

export type ShopProfileValues = z.infer<typeof shopProfileSchema>;

/** What `shops.location` stores for the place the owner picked. */
export function shopLocationOf(place: Place | null) {
	return {
		city: place?.name || null,
		region: place?.region || null,
		country: place ? (place.country ?? null) : null,
		countryCode: place ? (place.countryCode ?? null) : null,
	};
}

export function placeOfShopLocation(location: {
	city?: string | null;
	region?: string | null;
	country?: string | null;
	countryCode?: string | null;
}): Place | null {
	if (!location.city) return null;
	return {
		name: location.city,
		region: location.region ?? "",
		...(location.country ? { country: location.country } : {}),
		...(location.countryCode ? { countryCode: location.countryCode } : {}),
		source: "saved",
	};
}

/**
 * The contacts tab. Each field is optional; an empty string clears it — but
 * a non-empty one is rendered as a `tel:`/`wa.me` link for buyers
 * (`shop-contact-buttons.tsx`), so it must be exactly what `PhoneInput`
 * emits (E.164) or empty, never a free-form shape a link builder has to
 * guess at.
 */
export const shopContactsSchema = z.object({
	phone: z.union([z.literal(""), z.string().regex(E164_PATTERN)]),
	whatsapp: z.union([z.literal(""), z.string().regex(E164_PATTERN)]),
	email: z.union([z.literal(""), z.string().trim().email()]),
});

export type ShopContactsValues = z.infer<typeof shopContactsSchema>;

/**
 * `values.phone`/`values.whatsapp` clear a contact field by emitting `""`
 * (what `PhoneInput` reports for an empty control) — the server column is
 * nullable, not empty-string, so an empty control must reach it as `null`
 * and never as a stray `+` left over from a half-cleared field.
 */
export function toNullablePhone(value: string): string | null {
	return value.trim() || null;
}

/** The page-address tab. Owner-only; the server is the authority on the rest. */
export const changeHandleSchema = z.object({
	handle: z
		.string()
		.min(HANDLE_MIN)
		.max(HANDLE_MAX)
		.refine(isHandleFormatValid),
});

export type ChangeHandleValues = z.infer<typeof changeHandleSchema>;

/**
 * The close-shop tab. The confirmation phrase is the shop's own handle, so the
 * schema is built per shop rather than shared as a constant.
 */
export function closeShopSchema(handle: string) {
	return z.object({
		confirmation: z.string().refine((value) => value === handle),
	});
}

export type CloseShopValues = z.infer<ReturnType<typeof closeShopSchema>>;

/** Keeps the first five and last five characters: dial code and first digit, then the tail. */
export function maskPhone(phone: null | string): string {
	if (!phone) return "";
	return `${phone.slice(0, 5)}•• •• ${phone.slice(-5)}`;
}
