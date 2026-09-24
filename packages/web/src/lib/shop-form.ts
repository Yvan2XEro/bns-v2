import { z } from "zod";
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
	city: z.string().max(80),
	categories: z.array(z.string()).max(SHOP_CATEGORIES_MAX),
});

export type CreateShopValues = z.infer<typeof createShopSchema>;

/** The profile tab: name, description, city, categories and the two media fields. */
export const shopProfileSchema = z.object({
	name: z.string().trim().min(SHOP_NAME_MIN).max(SHOP_NAME_MAX),
	description: z.string().max(SHOP_DESCRIPTION_MAX),
	city: z.string(),
	region: z.string(),
	categories: z.array(z.string()).max(SHOP_CATEGORIES_MAX),
	logo: z.object({ id: z.string().nullable(), url: z.string().nullable() }),
	banner: z.object({ id: z.string().nullable(), url: z.string().nullable() }),
});

export type ShopProfileValues = z.infer<typeof shopProfileSchema>;

/** The contacts tab. Each field is optional; an empty string clears it. */
export const shopContactsSchema = z.object({
	phone: z.string(),
	whatsapp: z.string(),
	email: z.union([z.literal(""), z.string().trim().email()]),
});

export type ShopContactsValues = z.infer<typeof shopContactsSchema>;

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

/** "+237677504218" → "+2376•• •• 04218", as in the mockups. */
export function maskPhone(phone: null | string): string {
	if (!phone) return "";
	return `${phone.slice(0, 5)}•• •• ${phone.slice(-5)}`;
}
