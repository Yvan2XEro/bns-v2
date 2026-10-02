import { z } from "zod";
import type { HandoverFailureData, OrderHandoverView } from "../types/order";
import { ERROR_CODES } from "./apiError";

/** The handover code is four digits (`lib/orderCodes.ts` in the API). */
export const HANDOVER_CODE_LENGTH = 4;

export type KeypadKey =
	| "0"
	| "1"
	| "2"
	| "3"
	| "4"
	| "5"
	| "6"
	| "7"
	| "8"
	| "9"
	| "delete";

/** `null` is the empty cell left of the zero. */
export const KEYPAD_ROWS: readonly (readonly (KeypadKey | null)[])[] = [
	["1", "2", "3"],
	["4", "5", "6"],
	["7", "8", "9"],
	[null, "0", "delete"],
];

export function pressKey(code: string, key: KeypadKey): string {
	if (key === "delete") return code.slice(0, -1);
	return code.length >= HANDOVER_CODE_LENGTH ? code : code + key;
}

export const handoverCodeSchema = z.object({
	code: z.string().regex(/^\d{4}$/, "sellerOrders.handoverCodeFormat"),
});
export type HandoverCodeValues = z.infer<typeof handoverCodeSchema>;

export interface HandoverFailure {
	wrong: boolean;
	locked: boolean;
	/** `null` when the body did not say. */
	attemptsLeft: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readDetails(data: unknown): HandoverFailureData {
	if (!isRecord(data) || !isRecord(data.details)) return {};
	const { handover, attemptsLeft } = data.details;
	return {
		handover:
			isRecord(handover) && typeof handover.locked === "boolean"
				? { locked: handover.locked }
				: undefined,
		attemptsLeft: typeof attemptsLeft === "number" ? attemptsLeft : undefined,
	};
}

/**
 * The handover route's answer to a wrong or exhausted code, read from the
 * thrown `ApiError` — its `data` is the whole body, and the lock flag and
 * the remaining attempts sit under `details`. `null` for any other failure,
 * which the screen reports through `resolveErrorMessage` instead.
 */
export function readHandoverFailure(error: unknown): HandoverFailure | null {
	if (!isRecord(error)) return null;
	const wrong = error.code === ERROR_CODES.orderHandoverCodeInvalid;
	const lockCode = error.code === ERROR_CODES.orderHandoverLocked;
	if (!wrong && !lockCode) return null;
	const details = readDetails(error.data);
	return {
		wrong,
		locked: lockCode || details.handover?.locked === true,
		attemptsLeft: details.attemptsLeft ?? null,
	};
}

/**
 * Once the code is locked the seller still has two ways to close the
 * delivery: the buyer confirms receipt in their own app, or the seller
 * declares it — the weaker proof, which opens the buyer's 48-hour contest.
 */
export type HandoverFallback = "buyer_confirmation" | "seller_declaration";

export const FALLBACK_KEYS: Record<
	HandoverFallback,
	{ title: string; body: string }
> = {
	buyer_confirmation: {
		title: "sellerOrders.fallbackBuyerTitle",
		body: "sellerOrders.fallbackBuyerBody",
	},
	seller_declaration: {
		title: "sellerOrders.fallbackDeclareTitle",
		body: "sellerOrders.declareWarning",
	},
};

export type HandoverScreenState =
	| { kind: "keypad"; attemptsLeft: number; wrong: boolean }
	| { kind: "locked"; fallbacks: HandoverFallback[] };

/**
 * `order.handover` is the standing answer; a failed POST's body is the
 * fresher one until the order is refetched. Either saying "locked" — or the
 * budget reaching zero — replaces the keypad with the fallbacks.
 */
export function handoverScreenState(
	handover: OrderHandoverView,
	failure: HandoverFailure | null,
	canDeclare: boolean,
): HandoverScreenState {
	const attemptsLeft = failure?.attemptsLeft ?? handover.attemptsLeft;
	const locked =
		handover.locked || failure?.locked === true || attemptsLeft <= 0;
	if (locked) {
		return {
			kind: "locked",
			fallbacks: canDeclare
				? ["buyer_confirmation", "seller_declaration"]
				: ["buyer_confirmation"],
		};
	}
	return { kind: "keypad", attemptsLeft, wrong: failure?.wrong ?? false };
}
