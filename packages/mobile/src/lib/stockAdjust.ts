import { z } from "zod";
import type { ManualMovementType } from "../types/api";

export const MANUAL_MOVEMENT_TYPES: ManualMovementType[] = [
	"receipt",
	"adjustment",
	"loss",
	"return",
];

export const STOCK_NOTE_MAX = 200;

/**
 * Whole non-negative numbers only, written out in full — no hex ("0x10"),
 * no exponent ("1e3"), no decimal. A typo must not silently become a
 * plausible-looking quantity, so anything that isn't exactly digits fails
 * to parse rather than being coerced.
 */
function parseCount(value: string): number | null {
	const trimmed = value.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const n = Number(trimmed);
	return Number.isSafeInteger(n) ? n : null;
}

/**
 * The sheet asks what a seller knows — "10 received", "2 broken", "I
 * counted 4" — and the API wants a signed quantity, so the translation
 * lives here. Every type but `adjustment` is entered as a quantity applied
 * with the sign its type implies; `adjustment` is entered as the counted
 * TOTAL and converted to the signed delta the API expects.
 */
export function movementFromForm(
	type: ManualMovementType,
	current: number,
	value: string,
): { quantity: number; stockAfter: number } | null {
	const n = parseCount(value);
	if (n === null) return null;

	const quantity =
		type === "adjustment" ? n - current : type === "loss" ? -n : n;
	if (quantity === 0) return null;

	const stockAfter = current + quantity;
	if (stockAfter < 0) return null;
	return { quantity, stockAfter };
}

/** Message keys resolved where the error renders; `negative` reuses the server's own wording. */
export const STOCK_ADJUST_ERROR_KEYS = {
	invalid: "stock.amountInvalid",
	noChange: "stock.noChange",
	negative: "apiErrors.stock.negative",
} as const;

/**
 * Only the client-side floor is validated here (a blank/invalid amount, no
 * actual change, or a result below zero). The ledger owns the real refusal
 * — a concurrent write or units already reserved — and its answer is shown
 * as it comes, never re-derived here.
 */
export function stockAdjustSchema(current: number) {
	return z
		.object({
			type: z.enum(["receipt", "adjustment", "loss", "return"]),
			amount: z.string(),
			unitCost: z.string(),
			note: z.string().max(STOCK_NOTE_MAX),
		})
		.superRefine((values, ctx) => {
			const n = parseCount(values.amount);
			if (n === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["amount"],
					message: STOCK_ADJUST_ERROR_KEYS.invalid,
				});
				return;
			}
			const result = movementFromForm(values.type, current, values.amount);
			if (!result) {
				const quantity =
					values.type === "adjustment"
						? n - current
						: values.type === "loss"
							? -n
							: n;
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["amount"],
					message:
						quantity === 0
							? STOCK_ADJUST_ERROR_KEYS.noChange
							: STOCK_ADJUST_ERROR_KEYS.negative,
				});
			}
			if (
				values.type === "receipt" &&
				values.unitCost.trim() !== "" &&
				parseCount(values.unitCost) === null
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["unitCost"],
					message: STOCK_ADJUST_ERROR_KEYS.invalid,
				});
			}
		});
}

export type StockAdjustFormValues = z.infer<
	ReturnType<typeof stockAdjustSchema>
>;

export const emptyStockAdjustForm: StockAdjustFormValues = {
	type: "receipt",
	amount: "",
	unitCost: "",
	note: "",
};
