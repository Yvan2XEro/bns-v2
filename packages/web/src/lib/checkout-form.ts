import { z } from "zod";
import type { CheckoutPlaceInput } from "~/hooks/use-checkout";
import type {
	AddressInput,
	ConfirmationRequired,
	DeliveryMethod,
	DeliveryOption,
	PaymentMethod,
	QuoteResponse,
} from "~/types/order";

/**
 * The launch cities' districts, transcribed from
 * `packages/api/src/lib/launchCities.ts`. Transcribed rather than imported
 * because the web image ships only `payload-types.ts` from the API package;
 * `checkout-form.test.ts` compares this table to the API's slug for slug.
 */
const districts = (city: string, pairs: Array<[string, string]>) =>
	pairs.map(([slug, label]) => ({ key: `${city}.${slug}`, label }));

export const DISTRICTS: Record<
	string,
	Array<{ key: string; label: string }>
> = {
	douala: districts("douala", [
		["akwa", "Akwa"],
		["bonanjo", "Bonanjo"],
		["bonapriso", "Bonapriso"],
		["bali", "Bali"],
		["deido", "Deïdo"],
		["bonaberi", "Bonabéri"],
		["bepanda", "Bépanda"],
		["makepe", "Makepe"],
		["bonamoussadi", "Bonamoussadi"],
		["kotto", "Kotto"],
		["logbessou", "Logbessou"],
		["logpom", "Logpom"],
		["ndokoti", "Ndokoti"],
		["new-bell", "New Bell"],
		["nyalla", "Nyalla"],
		["pk8-pk14", "PK8–PK14"],
		["yassa", "Yassa"],
		["village", "Village"],
		["japoma", "Japoma"],
		["bonadibong", "Bonadibong"],
	]),
	yaounde: districts("yaounde", [
		["bastos", "Bastos"],
		["centre-ville", "Centre-ville"],
		["mvog-mbi", "Mvog-Mbi"],
		["essos", "Essos"],
		["mokolo", "Mokolo"],
		["biyem-assi", "Biyem-Assi"],
		["mendong", "Mendong"],
		["nkolbisson", "Nkolbisson"],
		["ngousso", "Ngousso"],
		["omnisport", "Omnisport"],
		["emana", "Emana"],
		["etoudi", "Etoudi"],
		["nsimeyong", "Nsimeyong"],
		["odza", "Odza"],
		["mimboman", "Mimboman"],
		["ekounou", "Ekounou"],
		["melen", "Melen"],
		["nlongkak", "Nlongkak"],
		["mvan", "Mvan"],
		["efoulan", "Efoulan"],
	]),
};

export const otherDistrictOf = (city: string) => `${city}.other`;

function isDistrictOf(city: string, key: string): boolean {
	return (
		key === otherDistrictOf(city) ||
		(DISTRICTS[city] ?? []).some((d) => d.key === key)
	);
}

/** A Cameroonian mobile: the delivery phone receives the confirmation SMS. */
export const CHECKOUT_PHONE_PATTERN = /^\+2376\d{8}$/;

/** Each value is a `Checkout` message key. */
export type AddressErrorKey =
	| "errorRecipientName"
	| "errorPhone"
	| "errorCity"
	| "errorDistrict"
	| "errorDistrictOther"
	| "errorLandmark"
	| "errorInstructions";

const gpsSchema = z.object({
	lat: z.number(),
	lng: z.number(),
	accuracyMeters: z.number().optional(),
});

const baseSchema = z.object({
	recipientName: z.string(),
	phone: z.string(),
	city: z.string(),
	district: z.string(),
	districtOther: z.string(),
	landmark: z.string(),
	instructions: z.string(),
	gps: gpsSchema.optional(),
});

export type CheckoutAddressValues = z.infer<typeof baseSchema>;
export type AddressField = Exclude<keyof CheckoutAddressValues, "gps">;

export const ADDRESS_ERROR_KEYS: Record<AddressField, AddressErrorKey> = {
	recipientName: "errorRecipientName",
	phone: "errorPhone",
	city: "errorCity",
	district: "errorDistrict",
	districtOther: "errorDistrictOther",
	landmark: "errorLandmark",
	instructions: "errorInstructions",
};

export function isAddressErrorKey(value: unknown): value is AddressErrorKey {
	return Object.values(ADDRESS_ERROR_KEYS).some((key) => key === value);
}

/**
 * The one client copy of `parseDeliveryAddress` in
 * `packages/api/src/services/checkout.ts`. `method` matters for the landmark
 * alone: required for `seller_delivery`, bounded whenever it is given.
 */
export function checkoutAddressSchema(
	cityKeys: readonly string[],
	method: DeliveryMethod,
) {
	return baseSchema.superRefine((v, ctx) => {
		const fail = (path: AddressField, message: AddressErrorKey) =>
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
		const name = v.recipientName.trim();
		if (name.length < 2 || name.length > 60)
			fail("recipientName", "errorRecipientName");
		if (!CHECKOUT_PHONE_PATTERN.test(v.phone)) fail("phone", "errorPhone");
		if (!cityKeys.includes(v.city)) fail("city", "errorCity");
		if (!isDistrictOf(v.city, v.district)) fail("district", "errorDistrict");
		const other = v.districtOther.trim();
		if (
			v.district === otherDistrictOf(v.city) &&
			(other.length < 2 || other.length > 60)
		)
			fail("districtOther", "errorDistrictOther");
		const landmark = v.landmark.trim();
		if (
			(method !== "pickup" || landmark) &&
			(landmark.length < 5 || landmark.length > 200)
		)
			fail("landmark", "errorLandmark");
		if (v.instructions.length > 300) fail("instructions", "errorInstructions");
	});
}

export function toAddressInput(values: CheckoutAddressValues): AddressInput {
	const isOther = values.district === otherDistrictOf(values.city);
	const landmark = values.landmark.trim();
	const instructions = values.instructions.trim();
	return {
		recipientName: values.recipientName.trim(),
		phone: values.phone,
		city: values.city,
		district: values.district,
		...(isOther ? { districtOther: values.districtOther.trim() } : {}),
		...(landmark ? { landmark } : {}),
		...(values.gps ? { gps: values.gps } : {}),
		...(instructions ? { instructions } : {}),
	};
}

function isAddressField(value: string): value is AddressField {
	return Object.hasOwn(ADDRESS_ERROR_KEYS, value);
}

/**
 * `checkout.addressInvalid` carries `details.field` (`"delivery.landmark"`).
 * Read defensively: the shared transport may not forward `details`, and then
 * the error stays a form-level one.
 */
export function addressFieldOf(error: unknown): AddressField | null {
	if (!error || typeof error !== "object" || !("details" in error)) return null;
	const details = error.details;
	if (!details || typeof details !== "object" || !("field" in details))
		return null;
	const path = details.field;
	if (typeof path !== "string") return null;
	const field = path.replace(/^delivery\./, "");
	return isAddressField(field) ? field : null;
}

export type CheckoutStep = "address" | "delivery" | "review";

export interface CheckoutState {
	step: CheckoutStep;
	address: AddressInput | null;
	option: DeliveryOption | null;
	/** COD unless the buyer picks protected payment at the review step; the flag decides whether that choice is even offered. */
	paymentMethod: PaymentMethod;
	quote: QuoteResponse | null;
	/** The summary the buyer saw before `checkout.quoteChanged`, for highlighting. */
	previousQuote: QuoteResponse | null;
	/** The pre-contract's reading language, independent of the page's. */
	contractLocale: "fr" | "en" | null;
	accepted: boolean;
	addressError: AddressField | null;
	idempotencyKey: string;
}

export type CheckoutAction =
	| { type: "goTo"; step: CheckoutStep }
	| { type: "addressSubmitted"; address: AddressInput }
	| { type: "addressRejected"; field: AddressField | null }
	| { type: "optionChosen"; option: DeliveryOption }
	| { type: "paymentMethodChosen"; method: PaymentMethod }
	| { type: "quoteLoaded"; quote: QuoteResponse }
	| { type: "quoteChanged"; quote: QuoteResponse }
	| { type: "contractLocale"; locale: "fr" | "en" }
	| { type: "accepted"; accepted: boolean };

export function initialCheckoutState(idempotencyKey: string): CheckoutState {
	return {
		step: "address",
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
		case "goTo":
			return { ...state, step: action.step };
		case "addressSubmitted": {
			const sameCity = state.address?.city === action.address.city;
			return {
				...state,
				step: "delivery",
				address: action.address,
				option: sameCity ? state.option : null,
				quote: null,
				previousQuote: null,
				accepted: false,
				addressError: null,
			};
		}
		case "addressRejected":
			return {
				...state,
				step: "address",
				addressError: action.field,
				accepted: false,
			};
		case "optionChosen":
			return {
				...state,
				step: "review",
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
		// changed one needs its own tick.
		case "quoteChanged":
			return {
				...state,
				quote: action.quote,
				previousQuote: state.quote,
				accepted: false,
			};
		case "contractLocale":
			return { ...state, contractLocale: action.locale };
		case "accepted":
			return { ...state, accepted: action.accepted };
	}
}

export function canPlaceOrder(state: CheckoutState): boolean {
	return state.step === "review" && state.quote !== null && state.accepted;
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

/** Exactly `CheckoutPlaceInput`: the hook's type is the route's input. */
export type PlaceOrderBody = CheckoutPlaceInput;

export function placeOrderBody(
	state: CheckoutState,
	locale: "fr" | "en",
): PlaceOrderBody | null {
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

/** The SMS code: six digits, as `CONFIRMATION_CODE_LENGTH` issues it. */
export const confirmationCodeSchema = z.object({
	code: z
		.string()
		.trim()
		.regex(/^\d{6}$/, "errorCode"),
});

export type ConfirmationCodeValues = z.infer<typeof confirmationCodeSchema>;

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

export function googleMapsUrl(lat: number, lng: number): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}
