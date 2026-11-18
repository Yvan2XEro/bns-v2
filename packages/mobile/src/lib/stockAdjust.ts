import { z } from "zod";
import type { ManualMovementType, MovementRow } from "../types/api";

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
	belowReserved: "stock.belowReserved",
} as const;

/**
 * What the amount holds after the type changes: a correction is the counted
 * stock, so it starts from the stock on hand; any other type starts empty.
 */
export function amountAfterTypeChange(
	next: ManualMovementType,
	current: number,
): string {
	return next === "adjustment" ? String(current) : "";
}

/**
 * The ledger's floor is checked while typing: a blank/invalid amount, no
 * actual change, a result below zero, or — taking units away — below what
 * orders hold (`reserved`). The ledger still owns the last word (a
 * concurrent write) and its answer is shown as it comes.
 */
export function stockAdjustSchema(current: number, reserved = 0) {
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
			if (result && result.quantity < 0 && result.stockAfter < reserved) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["amount"],
					message: STOCK_ADJUST_ERROR_KEYS.belowReserved,
				});
			}
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

/**
 * What a movement does to the units a buyer can still order. A reservation's
 * signed `quantity` counts reserved units going up, so read as-is it shows
 * "+1" for a unit that just became unavailable; a release is the reverse.
 */
export function availableDelta(
	row: Pick<MovementRow, "type" | "quantity">,
): number {
	return row.type === "reservation" || row.type === "release"
		? -row.quantity
		: row.quantity;
}

/** "+3" or "−2" (true minus sign), as the history prints a delta. */
export function signedDelta(value: number): string {
	return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}
