import { z } from "zod";

/**
 * The order dialogs' forms. Each reason list is the API's own vocabulary,
 * transcribed because the web package cannot import the API's module; the
 * routes refuse anything outside it, and `seller-orders.test.ts` pins both
 * the lists and their labels.
 */

/**
 * The API's `SELLER_END_REASONS` (`services/orders/acceptance.ts`), which
 * both `decline` and `seller-cancel` parse; anything else answers
 * `order.reasonRequired`.
 */
export const SELLER_END_REASONS = [
	"seller_out_of_stock",
	"seller_cannot_deliver",
	"seller_buyer_unreachable",
	"seller_other",
] as const;
export type SellerEndReason = (typeof SELLER_END_REASONS)[number];

/** `seller_other` is refused by the API without a note. */
export const NOTE_REQUIRED_REASON: SellerEndReason = "seller_other";

/** The decline and seller-cancel dialog's form. */
export const sellerEndSchema = z
	.object({
		reason: z.enum(SELLER_END_REASONS),
		note: z.string().trim().max(500),
	})
	.superRefine((value, ctx) => {
		if (value.reason === NOTE_REQUIRED_REASON && value.note === "") {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"] });
		}
	});
export type SellerEndValues = z.infer<typeof sellerEndSchema>;

/** The API's `ORDER_DELIVERY_FAILURE_REASONS`, labelled by `OrderStatus.failure_*`. */
export const DELIVERY_FAILURE_REASONS = [
	"refused",
	"unreachable",
	"absent",
	"address_not_found",
	"timeout",
	"other",
] as const;
export type DeliveryFailureReason = (typeof DELIVERY_FAILURE_REASONS)[number];

export const deliveryFailureSchema = z.object({
	reason: z.enum(DELIVERY_FAILURE_REASONS),
	note: z.string().trim().max(500),
});
export type DeliveryFailureValues = z.infer<typeof deliveryFailureSchema>;

export const declareDeliveredSchema = z.object({
	note: z.string().trim().max(500),
});
export type DeclareDeliveredValues = z.infer<typeof declareDeliveredSchema>;

/** The handover code is four digits (`lib/orderCodes.ts`). */
export const handoverSchema = z.object({
	code: z
		.string()
		.trim()
		.regex(/^\d{4}$/),
});
export type HandoverValues = z.infer<typeof handoverSchema>;

/** An empty note is sent as no note: the API refuses an empty string. */
export function optionalNote(note: string): string | undefined {
	const trimmed = note.trim();
	return trimmed === "" ? undefined : trimmed;
}
