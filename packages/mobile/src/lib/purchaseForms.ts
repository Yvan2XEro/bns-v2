import { z } from "zod";
import type { OrderView } from "../types/order";

/**
 * The buyer's purchase forms: one zod schema each, with translation keys as
 * messages so a screen renders `t(error.message)`.
 */

/**
 * The two values `cancelBuyerOrder` stores (`BUYER_CANCEL_REASONS` in the
 * API's `acceptance.ts`); it answers `order.reasonRequired` to anything else.
 */
export const BUYER_CANCEL_REASONS = [
	{
		value: "buyer_changed_mind",
		labelKey: "purchases.cancelReason_changedMind",
	},
	{
		value: "buyer_ordered_by_mistake",
		labelKey: "purchases.cancelReason_orderedByMistake",
	},
] as const;

export const cancelSchema = z.object({
	reason: z.enum(["buyer_changed_mind", "buyer_ordered_by_mistake"], {
		errorMap: () => ({ message: "purchases.cancelReasonRequired" }),
	}),
});
export type CancelValues = z.infer<typeof cancelSchema>;

export const confirmCodeSchema = z.object({
	code: z.string().regex(/^\d{6}$/, "purchases.confirmCodeInvalid"),
});
export type ConfirmCodeValues = z.infer<typeof confirmCodeSchema>;

export const contestSchema = z.object({
	note: z.string().trim().max(500),
});
export type ContestValues = z.infer<typeof contestSchema>;

export const reviewSchema = z.object({
	rating: z
		.number({
			errorMap: () => ({ message: "purchases.reviewRatingRequired" }),
		})
		.int()
		.min(1)
		.max(5),
	comment: z.string().trim().max(2000),
});
export type ReviewValues = z.infer<typeof reviewSchema>;

export const withdrawalSchema = z.object({
	items: z
		.array(
			z
				.object({
					orderItemId: z.string().min(1),
					quantity: z.number().int().min(0),
					max: z.number().int().min(1),
				})
				.refine((item) => item.quantity <= item.max, {
					path: ["quantity"],
				}),
		)
		.refine((items) => items.some((item) => item.quantity > 0), {
			message: "purchases.withdrawalNothingSelected",
		}),
	reasonText: z.string().trim().max(2000),
});
export type WithdrawalValues = z.infer<typeof withdrawalSchema>;

export function withdrawalDefaults(
	items: readonly Pick<OrderView["items"][number], "id" | "quantity">[],
): WithdrawalValues {
	return {
		items: items.map((item) => ({
			orderItemId: item.id,
			quantity: 0,
			max: item.quantity,
		})),
		reasonText: "",
	};
}

/** Only the lines with a quantity reach `POST /api/orders/{id}/withdrawal`. */
export function withdrawalPayload(values: WithdrawalValues) {
	return {
		items: values.items
			.filter((item) => item.quantity > 0)
			.map(({ orderItemId, quantity }) => ({ orderItemId, quantity })),
		reasonText: values.reasonText ? values.reasonText : null,
	};
}
