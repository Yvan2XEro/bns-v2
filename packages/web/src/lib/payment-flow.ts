/**
 * Pure decisions for the buyer's protected-payment screens
 * (`/checkout/[orderId]/pay` and `/checkout/[orderId]/pending`): countdowns,
 * the polling cadence, and what "retry", "resend" and "use another operator"
 * do to the next attempt. Nothing here calls the network — the two screens
 * own the TanStack Query hooks (`use-checkout.ts`) and call these functions
 * with the clock and the server's own answers.
 */

import { z } from "zod";
import { CHECKOUT_PHONE_PATTERN } from "./checkout-form";
import {
	PAYMENT_CHANNEL_LABELS,
	type PaymentChannel,
	type PaymentFailureCode,
	type PaymentIntentStatus,
} from "./payment-status";

/** Mirrors `CHECKOUT_MAX_ATTEMPTS` in `packages/api/src/services/checkoutPayment.ts`. */
export const CHECKOUT_MAX_ATTEMPTS = 3;

/**
 * Mirrors `ATTEMPT_IN_PROGRESS_MS`: the server refuses a new attempt while
 * the current `created`/`pending` intent is younger than this
 * (`payment.attemptInProgress`). "I didn't receive the prompt" waits it out
 * client-side rather than letting the buyer hit that refusal.
 */
export const ATTEMPT_IN_PROGRESS_MS = 3 * 60_000;

const TERMINAL_STATUSES: ReadonlySet<PaymentIntentStatus> = new Set([
	"succeeded",
	"failed",
	"cancelled",
	"expired",
]);

/** `created` and `pending` are still open; every other status is final. */
export function isTerminalStatus(status: PaymentIntentStatus): boolean {
	return TERMINAL_STATUSES.has(status);
}

/**
 * `GET /api/orders/{id}/payment`'s polling cadence: 3 s for the first 60 s of
 * polling, then 10 s. `elapsedMs` is measured from when the screen started
 * polling, not from the intent's own creation time, which the response never
 * carries.
 */
export function pollIntervalMs(elapsedMs: number): number {
	return elapsedMs < 60_000 ? 3_000 : 10_000;
}

/** Seconds left until `expiresAt`, floored at 0 — never negative on screen. */
export function secondsUntil(expiresAt: string, now: number): number {
	const deadline = Date.parse(expiresAt);
	if (!Number.isFinite(deadline)) return 0;
	const remaining = deadline - now;
	return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/** A missing or unparsable deadline reads as already past, never as open-ended. */
export function isPastDeadline(expiresAt: string, now: number): boolean {
	const deadline = Date.parse(expiresAt);
	return Number.isFinite(deadline) ? now >= deadline : true;
}

/** `"1:05"`, `"0:09"` — `pending_expiresIn`'s `{time}`. */
export function formatCountdown(totalSeconds: number): string {
	const safe = Math.max(0, totalSeconds);
	const minutes = Math.floor(safe / 60);
	const seconds = safe % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Seconds left before "I didn't receive the prompt" may fire a fresh
 * attempt. `pendingSince` is the moment the screen first saw the current
 * intent as `pending` — the client's own clock, since the server never
 * states when an intent entered that status.
 */
export function resendWaitSeconds(pendingSince: number, now: number): number {
	const left = pendingSince + ATTEMPT_IN_PROGRESS_MS - now;
	return left > 0 ? Math.ceil(left / 1000) : 0;
}

export function canResend(pendingSince: number, now: number): boolean {
	return resendWaitSeconds(pendingSince, now) === 0;
}

/** Which section of the pending screen a status maps to. */
export type PayScreenStep = "pending" | "paid" | "failed" | "expired";

/**
 * `cancelled` and `expired` render the same "the time to pay has run out"
 * messaging (`expired_title`/`expired_body`): from the buyer's side, an
 * intent the server gave up on and one that ran past its own clock are the
 * same fact, and the order was cancelled either way.
 */
export function stepFor(status: PaymentIntentStatus): PayScreenStep {
	switch (status) {
		case "created":
		case "pending":
			return "pending";
		case "succeeded":
			return "paid";
		case "failed":
			return "failed";
		case "cancelled":
		case "expired":
			return "expired";
	}
}

export interface AttemptRequest {
	channel: PaymentChannel;
	phone: string;
	idempotencyKey: string;
}

/**
 * "Try again" and "I didn't receive the prompt" both start a new attempt
 * with the SAME channel and phone but a FRESH `Idempotency-Key` — replaying
 * the old key would return the stale (failed, or still-pending) intent
 * instead of opening attempt N+1. `idempotencyKey` is supplied by the
 * caller (`crypto.randomUUID()`), never generated here, so this stays pure.
 */
export function freshAttempt(
	previous: Pick<AttemptRequest, "channel" | "phone">,
	idempotencyKey: string,
): AttemptRequest {
	return {
		channel: previous.channel,
		phone: previous.phone,
		idempotencyKey,
	};
}

// ─── The operator-choice form (channel + phone) ──────────────────────────────

export interface AttemptFormState {
	channel: PaymentChannel | null;
	phone: string;
}

export type AttemptFormAction =
	| { type: "channelChosen"; channel: PaymentChannel }
	| { type: "phoneChanged"; phone: string }
	/** "Use another number or operator": only the operator is forgotten. */
	| { type: "operatorReset" };

export function attemptFormReducer(
	state: AttemptFormState,
	action: AttemptFormAction,
): AttemptFormState {
	switch (action.type) {
		case "channelChosen":
			return { ...state, channel: action.channel };
		case "phoneChanged":
			return { ...state, phone: action.phone };
		case "operatorReset":
			return { ...state, channel: null };
	}
}

export const PAYMENT_CHANNELS = Object.keys(
	PAYMENT_CHANNEL_LABELS,
) as PaymentChannel[];

export const payAttemptSchema = z.object({
	channel: z.enum(PAYMENT_CHANNELS as [PaymentChannel, ...PaymentChannel[]]),
	phone: z.string().regex(CHECKOUT_PHONE_PATTERN),
});

export type PayAttemptValues = z.infer<typeof payAttemptSchema>;

// ─── The failed screen ────────────────────────────────────────────────────────

export type FailedAction = "retry" | "changeOperator" | "payOnDelivery";

/**
 * `payment.shopNotEligible` disables the form with a COD fallback "when the
 * order allows" it; the caller supplies that fact (`orderAllowsCod`) since
 * nothing here can see the order.
 */
export function codFallbackAllowed(
	errorCode: string | null,
	orderAllowsCod: boolean,
): boolean {
	if (!orderAllowsCod) return false;
	return (
		errorCode === "payment.shopNotEligible" ||
		errorCode === "payment.tooManyAttempts"
	);
}

/**
 * The failed screen's buttons, in display order. Spent attempts drop "Try
 * again" and "Use another number or operator" — there is nothing left to
 * retry — and leave only the COD fallback, when one is offered.
 */
export function failedActions(
	attemptsLeft: number,
	codFallback: boolean,
): FailedAction[] {
	const actions: FailedAction[] = [];
	if (attemptsLeft > 0) actions.push("retry", "changeOperator");
	if (codFallback) actions.push("payOnDelivery");
	return actions;
}

export type { PaymentChannel, PaymentFailureCode, PaymentIntentStatus };
