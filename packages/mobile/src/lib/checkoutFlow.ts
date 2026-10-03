import type {
	AddressInput,
	ConfirmationRequired,
	DeliveryOption,
	PaymentMethod,
	PlaceInput,
	QuoteResponse,
} from "../types/order";
import { ERROR_CODES } from "./apiError";
import type { AddressField } from "./checkoutForm";

/**
 * The three steps' shared state. Each step is its own route
 * (`app/checkout/address|delivery|review`), so the step itself is the route
 * and not a field here; `app/checkout/_layout.tsx` owns one reducer for all
 * three.
 */
export interface CheckoutState {
	address: AddressInput | null;
	option: DeliveryOption | null;
	/** COD unless the buyer picks protected payment at the review step; the flag decides whether that choice is even offered. */
	paymentMethod: PaymentMethod;
	quote: QuoteResponse | null;
	/** The summary the buyer saw before `checkout.quoteChanged`, for highlighting. */
	previousQuote: QuoteResponse | null;
	/** The pre-contract's reading language, independent of the app's. */
	contractLocale: "fr" | "en" | null;
	accepted: boolean;
	/** A field the server refused that the client had let through. */
	addressError: AddressField | null;
	idempotencyKey: string;
}

export type CheckoutAction =
	| { type: "addressSubmitted"; address: AddressInput }
	| { type: "addressRejected"; field: AddressField | null }
	| { type: "optionChosen"; option: DeliveryOption }
	| { type: "paymentMethodChosen"; method: PaymentMethod }
	| { type: "quoteLoaded"; quote: QuoteResponse }
	| { type: "quoteChanged"; quote: QuoteResponse; idempotencyKey: string }
	| { type: "contractLocale"; locale: "fr" | "en" }
	| { type: "accepted"; accepted: boolean };

export function initialCheckoutState(idempotencyKey: string): CheckoutState {
	return {
		address: null,
		option: null,
		paymentMethod: "cod",
		quote: null,
		previousQuote: null,
		contractLocale: null,
		accepted: false,
		addressError: null,
		idempotencyKey,
	};
}

export function checkoutReducer(
	state: CheckoutState,
	action: CheckoutAction,
): CheckoutState {
	switch (action.type) {
		case "addressSubmitted": {
			const sameCity = state.address?.city === action.address.city;
			return {
				...state,
				address: action.address,
				option: sameCity ? state.option : null,
				quote: null,
				previousQuote: null,
				accepted: false,
				addressError: null,
			};
		}
		case "addressRejected":
			return { ...state, addressError: action.field, accepted: false };
		case "optionChosen":
			return {
				...state,
				option: action.option,
				quote: null,
				previousQuote: null,
				accepted: false,
			};
		// A method change re-prices the order (the protection fee), so the quote
		// on screen is no longer the one that would be charged.
		case "paymentMethodChosen":
			return {
				...state,
				paymentMethod: action.method,
				quote: null,
				previousQuote: null,
				accepted: false,
			};
		case "quoteLoaded":
			return {
				...state,
				quote: action.quote,
				previousQuote: null,
				accepted: false,
			};
		// Art. 17: the buyer confirms the summary they are looking at, so a
		// changed one needs its own tick — and is a new attempt with its own key.
		case "quoteChanged":
			return {
				...state,
				quote: action.quote,
				previousQuote: state.quote,
				accepted: false,
				idempotencyKey: action.idempotencyKey,
			};
		case "contractLocale":
			return { ...state, contractLocale: action.locale };
		case "accepted":
			return { ...state, accepted: action.accepted };
	}
}

/**
 * Seller delivery needs a landmark a pickup address may have been accepted
 * without, so choosing it can send the buyer back to the address step.
 */
export function landmarkMissingFor(
	address: AddressInput,
	option: DeliveryOption,
): boolean {
	return option.method === "seller_delivery" && !address.landmark;
}

export function canPlaceOrder(state: CheckoutState): boolean {
	return state.quote !== null && state.accepted;
}

/** `line:{i}` for a line whose price or quantity moved, plus each amount that did. */
export function quoteDifferences(
	previous: QuoteResponse | null,
	next: QuoteResponse,
): Set<string> {
	const changed = new Set<string>();
	if (!previous) return changed;
	const a = previous.summary;
	const b = next.summary;
	b.lines.forEach((line, i) => {
		const before = a.lines[i];
		if (
			!before ||
			before.unitPrice !== line.unitPrice ||
			before.quantity !== line.quantity
		)
			changed.add(`line:${i}`);
	});
	for (const key of ["subtotal", "deliveryFee", "total"] as const) {
		if (a.amounts[key] !== b.amounts[key]) changed.add(key);
	}
	if (a.delivery.etaText !== b.delivery.etaText) changed.add("etaText");
	return changed;
}

/**
 * The placement body is the quote's own echo — the address and option the
 * server priced, not what the form holds now — plus its hash, the acceptance
 * and this attempt's idempotency key.
 */
export function placeOrderBody(
	state: CheckoutState,
	locale: "fr" | "en",
): PlaceInput | null {
	if (!canPlaceOrder(state) || !state.quote) return null;
	const { delivery, paymentMethod } = state.quote.summary;
	return {
		address: delivery.address,
		deliveryOptionId: delivery.optionId,
		paymentMethod,
		locale,
		quoteHash: state.quote.quoteHash,
		termsAccepted: true,
		idempotencyKey: state.idempotencyKey,
	};
}

/**
 * `checkout.methodUnavailable` (the method is not open for this market or
 * shop) and `payment.shopNotEligible` (the shop itself cannot take it) both
 * mean a mobile_money quote cannot be priced right now — COD is the only
 * designed way forward, so a quote request in either state falls back to it.
 */
export function codFallbackOnQuoteError(
	method: PaymentMethod,
	errorCode: string | null,
): boolean {
	return (
		method === "mobile_money" &&
		(errorCode === ERROR_CODES.checkoutMethodUnavailable ||
			errorCode === ERROR_CODES.paymentShopNotEligible)
	);
}

/**
 * One key per checkout attempt. Uniqueness per buyer is all the server needs
 * (it looks the key up among the caller's own orders), and Hermes does not
 * reliably expose `crypto.randomUUID`.
 */
export function newIdempotencyKey(random: () => number = Math.random): string {
	const hex = (count: number) =>
		Array.from({ length: count }, () =>
			Math.floor(random() * 16).toString(16),
		).join("");
	const variant = (8 + Math.floor(random() * 4)).toString(16);
	return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

export type ConfirmationOutcome = "confirmed" | "code" | "seller_call";

export function confirmationOutcome(
	required: ConfirmationRequired | null,
): ConfirmationOutcome {
	if (required === "sms_code") return "code";
	if (required === "seller_call") return "seller_call";
	return "confirmed";
}

export function isConfirmationRequired(
	value: unknown,
): value is ConfirmationRequired {
	return value === "none" || value === "sms_code" || value === "seller_call";
}

/** The API's `CONFIRMATION_RESEND_COOLDOWN_MS`; the server still refuses an early resend. */
const RESEND_COOLDOWN_MS = 60_000;

export function resendSecondsLeft(lastSentAt: Date, now: Date): number {
	const left = RESEND_COOLDOWN_MS - (now.getTime() - lastSentAt.getTime());
	return Math.max(0, Math.ceil(left / 1000));
}
