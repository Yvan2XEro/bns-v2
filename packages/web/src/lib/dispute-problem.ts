import { z } from "zod";
import type { Dispute } from "../../../api/src/payload-types";

export const disputeProblemSchema = z.object({
	reason: z.enum([
		"not_received",
		"not_as_described",
		"damaged",
		"counterfeit",
		"wrong_item",
		"seller_no_show",
		"cod_refused_abuse",
	]),
	subject: z.enum(["goods", "refund"]),
	description: z.string().trim().min(20).max(2000),
	requestedOutcome: z.enum([
		"full_refund",
		"partial_refund",
		"return_and_refund",
		"no_refund",
	]),
	requestedAmount: z.number().int().nonnegative().optional(),
	items: z
		.array(
			z.object({
				orderItemId: z.string().min(1),
				quantity: z.number().int().min(0),
			}),
		)
		.min(1)
		.refine((items) => items.some((item) => item.quantity > 0)),
});

export interface OpenDisputeFormInput {
	reason: NonNullable<Dispute["reason"]>;
	subject: NonNullable<Dispute["subject"]>;
	description: string;
	requestedOutcome: NonNullable<Dispute["requestedOutcome"]>;
	requestedAmount?: number;
	items: Array<{ orderItemId: string; quantity: number }>;
}

export function toOpenDisputePayload(input: OpenDisputeFormInput) {
	const { items, ...details } = input;
	return { ...details, items: items.filter((item) => item.quantity > 0) };
}
