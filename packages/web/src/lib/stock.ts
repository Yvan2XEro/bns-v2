import { z } from "zod";
import type { ClientMovementType, MovementType } from "~/types";
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
const BELOW_RESERVED = "belowReserved";

/** The two counters a movement is checked against. */
export interface StockLevels {
	stockOnHand: number;
	/** Units orders hold: the shelf may not go below them. */
	stockReserved: number;
}

/**
 * The rules depend on the stock the picked variant has right now, so the schema
 * is built per variant. It applies the ledger's own floor — what orders hold —
 * so the seller learns it while typing; the ledger still owns the last word (a
 * concurrent write) and its answer is shown as it comes.
 */
export function movementFormSchema({
	stockOnHand,
	stockReserved,
}: StockLevels) {
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
			} else if (delta < 0 && stockOnHand + delta < stockReserved) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["amount"],
					message: BELOW_RESERVED,
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

/**
 * What the amount field holds after the type changes: a correction is the
 * counted stock, so it starts from the stock on hand; leaving a correction
 * empties it, since "10 counted" is not "10 received".
 */
export function amountAfterTypeChange(
	from: ClientMovementType,
	to: ClientMovementType,
	amount: string,
	stockOnHand: number,
): string {
	if (to === "adjustment")
		return from === "adjustment" ? amount : String(stockOnHand);
	return from === "adjustment" ? "" : amount;
}

export const emptyMovementForm: MovementFormState = {
	type: "receipt",
	amount: "",
	unitCost: "",
	note: "",
};

/**
 * What a movement does to the units a buyer can still order. A reservation's
 * signed `quantity` counts the reserved units going up, so read as-is it shows
 * "+1" for a unit that just became unavailable; a release is the reverse.
 */
export function availableDelta(row: {
	type: MovementType;
	quantity: number;
}): number {
	return row.type === "reservation" || row.type === "release"
		? -row.quantity
		: row.quantity;
}

/** "+3" or "−2" (true minus sign), as the history prints a delta. */
export function signedDelta(value: number): string {
	return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

export type MovementTone =
	| "success"
	| "info"
	| "warning"
	| "danger"
	| "neutral";

/** The pill colour of each movement type in the history. */
export const MOVEMENT_TONES: Record<MovementType, MovementTone> = {
	receipt: "success",
	return: "info",
	adjustment: "info",
	loss: "danger",
	sale: "neutral",
	reservation: "warning",
	release: "neutral",
};

/**
 * The history's type filters: "all", the types a member records, and the
 * reservations orders write — a reservation and its release read as one
 * story, so they filter together.
 */
export const MOVEMENT_FILTERS = {
	all: undefined,
	receipt: "receipt",
	reservation: "reservation,release",
	adjustment: "adjustment",
	loss: "loss",
	return: "return",
} as const;
export type MovementFilter = keyof typeof MOVEMENT_FILTERS;

export interface HistoryFilters {
	type: MovementFilter;
	/** One variant of the product, or null for all of them. */
	variant: string | null;
	page: number;
}

/** The product history's filters, read from its search params. */
export function historyFiltersOf(
	params: Pick<URLSearchParams, "get">,
	variantIds: string[],
): HistoryFilters {
	const type = params.get("type") ?? "all";
	const variant = params.get("variant");
	const page = Number.parseInt(params.get("page") ?? "1", 10);
	return {
		type: type in MOVEMENT_FILTERS ? (type as MovementFilter) : "all",
		variant: variant && variantIds.includes(variant) ? variant : null,
		page: Number.isFinite(page) && page > 1 ? page : 1,
	};
}

/** The search params for `filters`, defaults left out. */
export function historySearch(filters: HistoryFilters): string {
	const params = new URLSearchParams();
	if (filters.type !== "all") params.set("type", filters.type);
	if (filters.variant) params.set("variant", filters.variant);
	if (filters.page > 1) params.set("page", String(filters.page));
	const search = params.toString();
	return search ? `?${search}` : "";
}

export interface ReceiptLine {
	variantId: string;
	quantity: number;
	unitCost: number | null;
}

/**
 * One arrival across several variants: a line per variant with a quantity.
 * A blank quantity is a variant that did not arrive; anything else must be a
 * positive whole number, and a cost, when typed, a plain amount.
 */
export function receiptLines(
	quantities: Record<string, string>,
	costs: Record<string, string>,
): { lines: ReceiptLine[]; invalid: string[] } {
	const lines: ReceiptLine[] = [];
	const invalid: string[] = [];
	for (const [variantId, raw] of Object.entries(quantities)) {
		if (raw.trim() === "") continue;
		const quantity = parseAmount(raw);
		const rawCost = costs[variantId]?.trim() ?? "";
		const unitCost = rawCost === "" ? null : parseAmount(rawCost);
		if (!quantity || (rawCost !== "" && unitCost === null)) {
			invalid.push(variantId);
			continue;
		}
		lines.push({ variantId, quantity, unitCost });
	}
	return { lines, invalid };
}
