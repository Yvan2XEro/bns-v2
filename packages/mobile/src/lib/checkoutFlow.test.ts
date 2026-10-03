import { describe, expect, test } from "bun:test";
import type { DeliveryOption, QuoteResponse } from "../types/order";
import {
	type CheckoutState,
	canPlaceOrder,
	checkoutReducer,
	codFallbackOnQuoteError,
	confirmationOutcome,
	initialCheckoutState,
	isConfirmationRequired,
	landmarkMissingFor,
	newIdempotencyKey,
	placeOrderBody,
	quoteDifferences,
	resendSecondsLeft,
} from "./checkoutFlow";
import { toAddressInput } from "./checkoutForm";

const address = toAddressInput({
	recipientName: "Awa Ngono",
	phone: "+237699124408",
	city: "douala",
	district: "douala.akwa",
	districtOther: "",
	landmark: "En face de la pharmacie du Rond-point",
	instructions: "",
});

const preContract: QuoteResponse["preContract"] = {
	termsVersion: "2026-09",
	locale: "fr",
	seller: {
		name: "Wax Akwa",
		handle: "wax-akwa",
		city: "douala",
		phone: null,
		rccm: null,
		niu: null,
	},
	platform: {
		legalName: "BuyNSellem",
		role: "hosting_platform",
		supportEmail: null,
		supportPhone: null,
	},
	items: [],
	amounts: {
		subtotal: 0,
		deliveryFee: 0,
		discount: 0,
		buyerProtectionFee: 0,
		total: 0,
		currency: "XAF",
	},
	terms: { fr: [], en: [] },
	withdrawal: {
		days: 15,
		howTo: { fr: "", en: "" },
		costs: { fr: "", en: "" },
	},
	salesTerms: { fr: "", en: "" },
	complaints: { fr: "", en: "" },
};

function quote(
	overrides: {
		unitPrice?: number;
		deliveryFee?: number;
		etaText?: string;
	} = {},
): QuoteResponse {
	const unitPrice = overrides.unitPrice ?? 10_000;
	const deliveryFee = overrides.deliveryFee ?? 2_000;
	return {
		summary: {
			lines: [
				{
					title: "Robe wax",
					variantLabel: "Taille: M",
					unitPrice,
					quantity: 2,
					lineSubtotal: unitPrice * 2,
					imageUrl: null,
				},
			],
			amounts: {
				subtotal: unitPrice * 2,
				deliveryFee,
				discount: 0,
				buyerProtectionFee: 0,
				total: unitPrice * 2 + deliveryFee,
				currency: "XAF",
			},
			paymentMethod: "cod",
			delivery: {
				method: "seller_delivery",
				optionId: "seller_delivery:douala",
				etaText: overrides.etaText ?? "24-48 h",
				address,
			},
		},
		preContract,
		confirmationRequired: "none",
		quoteHash: `h-${unitPrice}-${deliveryFee}`,
	};
}

const delivery: DeliveryOption = {
	optionId: "seller_delivery:douala",
	method: "seller_delivery",
	fee: 2000,
	etaText: "24-48 h",
	codAllowed: true,
};

function reviewing(): CheckoutState {
	let state = initialCheckoutState("idem-1");
	state = checkoutReducer(state, { type: "addressSubmitted", address });
	state = checkoutReducer(state, { type: "optionChosen", option: delivery });
	state = checkoutReducer(state, { type: "quoteLoaded", quote: quote() });
	return checkoutReducer(state, { type: "accepted", accepted: true });
}

describe("the three steps' state", () => {
	test("an address, then an option, then a quote", () => {
		const state = reviewing();
		expect(state.address?.district).toBe("douala.akwa");
		expect(state.option?.optionId).toBe("seller_delivery:douala");
		expect(state.quote?.quoteHash).toBe("h-10000-2000");
	});
	test("changing city drops the option chosen for the old one", () => {
		const state = checkoutReducer(reviewing(), {
			type: "addressSubmitted",
			address: { ...address, city: "yaounde", district: "yaounde.bastos" },
		});
		expect(state.option).toBeNull();
		expect(state.quote).toBeNull();
		expect(state.accepted).toBe(false);
	});
	test("an edit in the same city keeps the option but needs a new quote", () => {
		const state = checkoutReducer(reviewing(), {
			type: "addressSubmitted",
			address: { ...address, landmark: "Derrière la station Total" },
		});
		expect(state.option?.optionId).toBe("seller_delivery:douala");
		expect(state.quote).toBeNull();
	});
	test("an address the server refused names the field and unticks the box", () => {
		const state = checkoutReducer(reviewing(), {
			type: "addressRejected",
			field: "landmark",
		});
		expect(state.addressError).toBe("landmark");
		expect(state.accepted).toBe(false);
	});
	test("seller delivery needs a landmark a pickup address may lack", () => {
		const bare = { ...address, landmark: undefined };
		expect(landmarkMissingFor(bare, delivery)).toBe(true);
		expect(landmarkMissingFor(address, delivery)).toBe(false);
		expect(
			landmarkMissingFor(bare, {
				...delivery,
				optionId: "pickup:shop-1",
				method: "pickup",
			}),
		).toBe(false);
	});
});

describe("acceptance", () => {
	test("the order can be placed only once the box is ticked", () => {
		const ticked = reviewing();
		expect(canPlaceOrder(ticked)).toBe(true);
		expect(
			canPlaceOrder(
				checkoutReducer(ticked, { type: "accepted", accepted: false }),
			),
		).toBe(false);
	});
	test("the box starts unticked on a fresh quote", () => {
		const state = checkoutReducer(reviewing(), {
			type: "quoteLoaded",
			quote: quote(),
		});
		expect(state.accepted).toBe(false);
	});
	test("a changed quote needs a fresh acceptance and keeps the old one to compare", () => {
		const after = checkoutReducer(reviewing(), {
			type: "quoteChanged",
			quote: quote({ deliveryFee: 3_500 }),
			idempotencyKey: "idem-2",
		});
		expect(after.accepted).toBe(false);
		expect(after.idempotencyKey).toBe("idem-2");
		expect(
			placeOrderBody(
				checkoutReducer(after, { type: "accepted", accepted: true }),
				"fr",
			)?.idempotencyKey,
		).toBe("idem-2");
		expect(canPlaceOrder(after)).toBe(false);
		expect(after.quote?.quoteHash).toBe("h-10000-3500");
		expect(after.previousQuote?.quoteHash).toBe("h-10000-2000");
	});
});

describe("the differences a quote change highlights", () => {
	test("a new fee names the fee and the total, nothing else", () => {
		expect(
			[...quoteDifferences(quote(), quote({ deliveryFee: 3_500 }))].sort(),
		).toEqual(["deliveryFee", "total"]);
	});
	test("a new price names the line, the subtotal and the total", () => {
		expect(
			[...quoteDifferences(quote(), quote({ unitPrice: 12_000 }))].sort(),
		).toEqual(["line:0", "subtotal", "total"]);
	});
	test("a new delay names the delay", () => {
		expect([
			...quoteDifferences(quote(), quote({ etaText: "48-72 h" })),
		]).toEqual(["etaText"]);
	});
	test("no previous quote highlights nothing", () => {
		expect(quoteDifferences(null, quote()).size).toBe(0);
	});
});

describe("the placement body is the route's input", () => {
	test("the quote's own echo, its hash, termsAccepted and the idempotency key", () => {
		expect(placeOrderBody(reviewing(), "en")).toEqual({
			address,
			deliveryOptionId: "seller_delivery:douala",
			paymentMethod: "cod",
			locale: "en",
			quoteHash: "h-10000-2000",
			termsAccepted: true,
			idempotencyKey: "idem-1",
		});
	});
	test("no body without a ticked box", () => {
		expect(
			placeOrderBody(
				checkoutReducer(reviewing(), { type: "accepted", accepted: false }),
				"fr",
			),
		).toBeNull();
	});
	test("an idempotency key is a v4-shaped UUID and differs per attempt", () => {
		const key = newIdempotencyKey();
		expect(key).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(new Set([key, newIdempotencyKey(), newIdempotencyKey()]).size).toBe(
			3,
		);
	});
});

describe("the payment method (Task 29)", () => {
	test("starts on COD and a change drops the quote for a fresh price", () => {
		const state = checkoutReducer(reviewing(), {
			type: "paymentMethodChosen",
			method: "mobile_money",
		});
		expect(state.paymentMethod).toBe("mobile_money");
		expect(state.quote).toBeNull();
		expect(state.accepted).toBe(false);
	});
	test("a quote places with the method it was priced under", () => {
		// Server-priced values (B-1): a mobile_money quote carries the real
		// fee and total, not the cod quote's fee-less ones.
		const mobileMoneyQuote = quote();
		mobileMoneyQuote.summary.paymentMethod = "mobile_money";
		mobileMoneyQuote.summary.amounts.buyerProtectionFee = 660;
		mobileMoneyQuote.summary.amounts.total = 22_660;
		let state = checkoutReducer(reviewing(), {
			type: "paymentMethodChosen",
			method: "mobile_money",
		});
		state = checkoutReducer(state, {
			type: "quoteLoaded",
			quote: mobileMoneyQuote,
		});
		state = checkoutReducer(state, { type: "accepted", accepted: true });
		expect(placeOrderBody(state, "fr")?.paymentMethod).toBe("mobile_money");
		expect(state.quote?.summary.amounts).toEqual({
			subtotal: 20_000,
			deliveryFee: 2_000,
			discount: 0,
			buyerProtectionFee: 660,
			total: 22_660,
			currency: "XAF",
		});
	});
});

describe("the COD fallback a refused mobile_money quote triggers (Task 29)", () => {
	test("offered only for mobile_money, on the two refusal codes", () => {
		expect(
			codFallbackOnQuoteError("mobile_money", "checkout.methodUnavailable"),
		).toBe(true);
		expect(
			codFallbackOnQuoteError("mobile_money", "payment.shopNotEligible"),
		).toBe(true);
	});
	test("never offered for COD itself, or for an unrelated refusal", () => {
		expect(codFallbackOnQuoteError("cod", "checkout.methodUnavailable")).toBe(
			false,
		);
		expect(
			codFallbackOnQuoteError("mobile_money", "checkout.quoteChanged"),
		).toBe(false);
		expect(codFallbackOnQuoteError("mobile_money", null)).toBe(false);
	});
});

describe("the confirmation screen", () => {
	test("the three outcomes", () => {
		expect(confirmationOutcome("none")).toBe("confirmed");
		expect(confirmationOutcome("sms_code")).toBe("code");
		expect(confirmationOutcome("seller_call")).toBe("seller_call");
	});
	test("an unknown hint reads as nothing outstanding", () => {
		expect(confirmationOutcome(null)).toBe("confirmed");
		expect(isConfirmationRequired("sms_code")).toBe(true);
		expect(isConfirmationRequired("sms")).toBe(false);
	});
	test("the resend cooldown counts down 60 seconds from the last send", () => {
		const sent = new Date("2026-10-02T10:00:00Z");
		expect(resendSecondsLeft(sent, new Date("2026-10-02T10:00:00Z"))).toBe(60);
		expect(resendSecondsLeft(sent, new Date("2026-10-02T10:00:45Z"))).toBe(15);
		expect(resendSecondsLeft(sent, new Date("2026-10-02T10:01:30Z"))).toBe(0);
	});
});
