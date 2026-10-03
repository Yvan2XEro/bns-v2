import { ERROR_CODES } from "./apiError";
import type { PaymentChannel, PaymentIntentStatus } from "./paymentStatus";

/**
 * Pure decisions behind the pay/pending screens (`app/checkout/[orderId]/
 * pay.tsx` and `pending.tsx`), mirroring web's `payment-flow.ts` (Task 24).
 * Neither package has a component-render harness, so every branch that
 * needs pinning lives here rather than inline in a screen.
 */

/** The server verifies a pending attempt at most every 20s
 * (`POLL_INTERVAL_SECONDS` in `checkoutPayment.ts`); the local notification
 * fires this long before `expiresAt`. */
export const NOTIFICATION_LEAD_MS = 60_000;

/** How long the "I didn't get the prompt" resend stays disabled, so a buyer
 * flicking back and forth cannot fire two USSD pushes to the same phone a
 * few seconds apart. */
export const RESEND_COOLDOWN_MS = 3 * 60_000;

/** The AppState listener's own debounce: two "active" events in quick
 * succession (a notification banner tap right after unlocking the phone,
 * for instance) must not turn into two requests. */
export const FOREGROUND_REFRESH_MIN_INTERVAL_MS = 5_000;

export const HOSTED_CHECKOUT_RETURN_SCHEME = "buynsellem://checkout";

// ─── Countdown ──────────────────────────────────────────────────────────────

/** `expiresAt` is authoritative (the earlier of attempt+30min and the
 * order's own window) — this only reads it, never recomputes it. */
export function secondsUntil(expiresAt: string, now: Date): number {
	const diff = Date.parse(expiresAt) - now.getTime();
	return Math.max(0, Math.ceil(diff / 1000));
}

/** `"4:05"`, never `"04:05"` — the spec's `{{time}}` sentences read a plain
 * minute count, not a padded clock. */
export function formatCountdown(totalSeconds: number): string {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function isPastExpiry(expiresAt: string, now: Date): boolean {
	return Date.parse(expiresAt) <= now.getTime();
}

// ─── AppState re-check ──────────────────────────────────────────────────────

/**
 * Whether a foreground event is worth a status refetch. The buyer leaves the
 * app to approve the USSD prompt, so coming back is the main signal the
 * screen gets outside its own poll — but without this gate, flicking between
 * apps during that approval would turn into a request per flick.
 */
export function shouldRefetchOnForeground(
	lastCheckedAt: number,
	now: number,
	minIntervalMs: number = FOREGROUND_REFRESH_MIN_INTERVAL_MS,
): boolean {
	return now - lastCheckedAt >= minIntervalMs;
}

// ─── Expiry reminder notification ──────────────────────────────────────────

/**
 * When to fire the "about to expire" local notification, in epoch ms, or
 * `null` when there is nothing left to warn about: the attempt is no longer
 * open, or there is less than a notification's worth of time left to warn
 * early about.
 */
export function reminderFireAt(
	expiresAt: string,
	status: PaymentIntentStatus,
	now: Date,
): number | null {
	if (status !== "created" && status !== "pending") return null;
	const fireAt = Date.parse(expiresAt) - NOTIFICATION_LEAD_MS;
	return fireAt > now.getTime() ? fireAt : null;
}

// ─── Resend cooldown ────────────────────────────────────────────────────────

export function resendSecondsLeft(lastAttemptAt: Date, now: Date): number {
	const left = RESEND_COOLDOWN_MS - (now.getTime() - lastAttemptAt.getTime());
	return Math.max(0, Math.ceil(left / 1000));
}

export function canResend(lastAttemptAt: Date, now: Date): boolean {
	return resendSecondsLeft(lastAttemptAt, now) === 0;
}

// ─── Pending screen phase ──────────────────────────────────────────────────

export type PendingPhase =
	| "checking"
	| "pending"
	| "succeeded"
	| "failed"
	| "expired"
	| "cancelled";

export interface PendingIntentLike {
	status: PaymentIntentStatus;
	expiresAt: string;
}

/**
 * `expiresAt` reaching zero on the buyer's own clock is not, by itself, the
 * order being cancelled — only the server's own status is ever shown as a
 * terminal outcome. A local countdown at zero with no server answer yet
 * reads as `"checking"`, the same state the screen opens in.
 */
export function pendingPhaseOf(
	view: {
		orderPaymentStatus: string;
		intent: PendingIntentLike | null;
	},
	now: Date,
): PendingPhase {
	if (view.orderPaymentStatus === "paid") return "succeeded";
	if (!view.intent) {
		return view.orderPaymentStatus === "unpaid" ? "cancelled" : "checking";
	}
	switch (view.intent.status) {
		case "succeeded":
			return "succeeded";
		case "failed":
			return "failed";
		case "expired":
			return "expired";
		case "cancelled":
			return "cancelled";
		case "created":
		case "pending":
			return isPastExpiry(view.intent.expiresAt, now) ? "checking" : "pending";
	}
}

// ─── COD fallback ───────────────────────────────────────────────────────────

/**
 * `payment.shopNotEligible` means the shop itself cannot take protected
 * payments any more — not that this order is unpayable — so the fallback
 * only ever applies when the order's own delivery method still allows
 * paying on delivery.
 */
export function codFallbackOffered(
	errorCode: string | null,
	codAllowed: boolean,
): boolean {
	return errorCode === ERROR_CODES.paymentShopNotEligible && codAllowed;
}

// ─── Hosted-checkout fallback (P0's boost idiom) ───────────────────────────

/** The deep link the hosted-checkout return (and nothing else) lands on. */
export function pendingReturnDeepLink(orderId: string): string {
	return `${HOSTED_CHECKOUT_RETURN_SCHEME}/${orderId}/pending`;
}

/**
 * Mirrors `buildCallbackUrl`'s idiom in the API's `boostPurchase.ts`:
 * append `appReturnUrl` as a query param on whatever hosted-checkout URL is
 * opened. Neither the provider's return route nor this app ever follows the
 * value — its presence alone tells the return route to hand the browser
 * back to the app instead of to web. No channel in the launch market
 * (`cm.mtn`/`cm.orange`) returns a hosted checkout URL today, so this is
 * forward-compatible plumbing for the day one does, not a live path.
 */
export function withAppReturnSignal(
	checkoutUrl: string,
	orderId: string,
): string {
	const url = new URL(checkoutUrl);
	url.searchParams.set("appReturnUrl", pendingReturnDeepLink(orderId));
	return url.toString();
}

export type { PaymentChannel };
