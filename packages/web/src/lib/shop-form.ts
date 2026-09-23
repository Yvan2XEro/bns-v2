import { z } from "zod";
import { HANDLE_MAX, HANDLE_MIN, isHandleFormatValid } from "./shop-handle";

export const SHOP_NAME_MIN = 2;
export const SHOP_NAME_MAX = 60;
export const SHOP_CATEGORIES_MAX = 5;

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

/** "+237677504218" → "+2376•• •• 04218", as in the mockups. */
export function maskPhone(phone: null | string): string {
	if (!phone) return "";
	return `${phone.slice(0, 5)}•• •• ${phone.slice(-5)}`;
}
