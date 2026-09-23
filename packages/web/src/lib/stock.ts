import { z } from "zod";
import type { ClientMovementType } from "~/types";
import { parseAmount } from "./product-form";

export const MOVEMENT_TYPES: ClientMovementType[] = [
	"receipt",
	"adjustment",
	"loss",
	"return",
];

export const NOTE_MAX = 200;

/**
 * What the seller types is always a positive number; the sign comes from the
 * type. A correction is entered as the counted stock and sent as the
 * difference, which is how the API's signed `quantity` expects it.
 */
export function movementDelta(
	type: ClientMovementType,
	amount: number,
	current: number,
): number {
	switch (type) {
		case "receipt":
		case "return":
			return amount;
		case "loss":
			return -amount;
		case "adjustment":
			return amount - current;
	}
}

/** Message keys under the `Stock` namespace, resolved where the error renders. */
const AMOUNT_INVALID = "amountInvalid";
const NO_CHANGE = "noChange";
const NEGATIVE = "negative";

/**
 * The rules depend on the stock the picked variant has right now, so the schema
 * is built per variant. Only the client-side floor is checked here: the ledger
 * owns the real refusals (reserved units, a concurrent write) and its answer is
 * shown as it comes.
 */
export function movementFormSchema(stockOnHand: number) {
	return z
		.object({
			type: z.enum(["receipt", "adjustment", "loss", "return"]),
			amount: z.string(),
			unitCost: z.string(),
			note: z.string().max(NOTE_MAX),
		})
		.superRefine((values, ctx) => {
			const amount = parseAmount(values.amount);
			if (amount === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["amount"],
					message: AMOUNT_INVALID,
				});
				return;
			}
			const delta = movementDelta(values.type, amount, stockOnHand);
			if (delta === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["amount"],
					message: NO_CHANGE,
				});
			}
			if (stockOnHand + delta < 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["amount"],
					message: NEGATIVE,
				});
			}
			if (
				values.type === "receipt" &&
				values.unitCost.trim() !== "" &&
				parseAmount(values.unitCost) === null
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["unitCost"],
					message: AMOUNT_INVALID,
				});
			}
		});
}

export type MovementFormState = z.infer<ReturnType<typeof movementFormSchema>>;

export const emptyMovementForm: MovementFormState = {
	type: "receipt",
	amount: "",
	unitCost: "",
	note: "",
};
