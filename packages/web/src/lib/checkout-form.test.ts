import { describe, expect, test } from "bun:test";
import type { QuoteResponse } from "~/types/order";
import {
	LAUNCH_CITY_KEYS as API_LAUNCH_CITY_KEYS,
	districtKeysOf as apiDistrictKeysOf,
	districtLabel as apiDistrictLabel,
} from "../../../api/src/lib/launchCities";
import {
	addressFieldOf,
	type CheckoutAddressValues,
	type CheckoutState,
	canPlaceOrder,
	checkoutAddressSchema,
	checkoutReducer,
	confirmationOutcome,
	DISTRICTS,
	googleMapsUrl,
	initialCheckoutState,
	placeOrderBody,
	quoteDifferences,
	resendSecondsLeft,
	toAddressInput,
} from "./checkout-form";

const CITIES = ["douala", "yaounde"] as const;

const valid: CheckoutAddressValues = {
	recipientName: "Awa Ngono",
	phone: "+237699124408",
	city: "douala",
	district: "douala.akwa",
	districtOther: "",
	landmark: "En face de la pharmacie du Rond-point",
	instructions: "",
};

function issues(
	values: Partial<CheckoutAddressValues>,
	method: "seller_delivery" | "pickup" = "seller_delivery",
) {
	const result = checkoutAddressSchema(CITIES, method).safeParse({
		...valid,
		...values,
	});
	return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

describe("the address schema mirrors parseDeliveryAddress, both ways", () => {
	test("a complete seller_delivery address passes", () => {
		expect(issues({})).toEqual([]);
	});

	test("recipient: 2 characters pass", () => {
		expect(issues({ recipientName: "Al" })).toEqual([]);
	});
	test("recipient: 1 or 61 characters fail on recipientName", () => {
		expect(issues({ recipientName: "A" })).toEqual(["recipientName"]);
		expect(issues({ recipientName: "A".repeat(61) })).toEqual([
			"recipientName",
		]);
	});

	test("phone: a +2376 mobile passes", () => {
		expect(issues({ phone: "+237677000000" })).toEqual([]);
	});
	test("phone: a landline, a short number or a foreign number fails on phone", () => {
		expect(issues({ phone: "+237222123456" })).toEqual(["phone"]);
		expect(issues({ phone: "+23769912440" })).toEqual(["phone"]);
		expect(issues({ phone: "+33612345678" })).toEqual(["phone"]);
	});

	test("city: a launch city passes", () => {
		expect(issues({ city: "yaounde", district: "yaounde.bastos" })).toEqual([]);
	});
	test("city: a city outside the launch list fails on city", () => {
		expect(
			issues({ city: "bafoussam", district: "bafoussam.other" }),
		).toContain("city");
		// A launch city the settings switched off is not offered either.
		const onlyDouala = checkoutAddressSchema(["douala"], "seller_delivery");
		expect(
			onlyDouala.safeParse({
				...valid,
				city: "yaounde",
				district: "yaounde.bastos",
			}).success,
		).toBe(false);
	});

	test("district: a district of the chosen city passes", () => {
		expect(issues({ district: "douala.bonapriso" })).toEqual([]);
	});
	test("district: another city's district fails on district", () => {
		expect(issues({ district: "yaounde.bastos" })).toEqual(["district"]);
		expect(issues({ district: "" })).toEqual(["district"]);
	});

	test("other district: .other with a districtOther passes", () => {
		expect(
			issues({ district: "douala.other", districtOther: "Ndogbong" }),
		).toEqual([]);
	});
	test("other district: .other without districtOther fails on districtOther", () => {
		expect(issues({ district: "douala.other", districtOther: " " })).toEqual([
			"districtOther",
		]);
	});

	test("landmark: optional for pickup", () => {
		expect(issues({ landmark: "" }, "pickup")).toEqual([]);
	});
	test("landmark: required, 5 to 200, for seller_delivery", () => {
		expect(issues({ landmark: "" })).toEqual(["landmark"]);
		expect(issues({ landmark: "abcd" })).toEqual(["landmark"]);
		expect(issues({ landmark: "a".repeat(201) })).toEqual(["landmark"]);
		// A short landmark still fails for pickup: the server bounds it whenever it is given.
		expect(issues({ landmark: "abcd" }, "pickup")).toEqual(["landmark"]);
	});

	test("instructions: 300 characters pass", () => {
		expect(issues({ instructions: "a".repeat(300) })).toEqual([]);
	});
	test("instructions: 301 characters fail on instructions", () => {
		expect(issues({ instructions: "a".repeat(301) })).toEqual(["instructions"]);
	});
});

describe("the district table is the API's, slug for slug", () => {
	test("same cities, same district keys, same labels", () => {
		expect(Object.keys(DISTRICTS).sort()).toEqual(
			[...API_LAUNCH_CITY_KEYS].sort(),
		);
		for (const city of API_LAUNCH_CITY_KEYS) {
			const ours = DISTRICTS[city].map((d) => d.key);
			expect(ours).toEqual([...apiDistrictKeysOf(city)]);
			for (const d of DISTRICTS[city]) {
				expect(d.label).toBe(apiDistrictLabel(d.key) ?? "");
			}
		}
	});
});

describe("the form values become the API's AddressInput", () => {
	test("empty optionals are dropped, districtOther only for .other, gps kept", () => {
		expect(
			toAddressInput({
				...valid,
				recipientName: "  Awa Ngono ",
				districtOther: "ignored",
				instructions: "",
				gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12 },
			}),
		).toEqual({
			recipientName: "Awa Ngono",
			phone: "+237699124408",
			city: "douala",
			district: "douala.akwa",
			landmark: "En face de la pharmacie du Rond-point",
			gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12 },
		});
	});
});

describe("checkout.addressInvalid's field path maps back to a form field", () => {
	test("delivery.landmark names landmark", () => {
		expect(addressFieldOf({ details: { field: "delivery.landmark" } })).toBe(
			"landmark",
		);
	});
	test("an unknown or absent path names nothing", () => {
		expect(addressFieldOf({ details: { field: "delivery.gps" } })).toBeNull();
		expect(addressFieldOf(new Error("x"))).toBeNull();
	});
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

function quote(overrides: {
	unitPrice?: number;
	deliveryFee?: number;
	etaText?: string;
}): QuoteResponse {
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
				address: toAddressInput(valid),
			},
		},
		preContract,
		confirmationRequired: "none",
		quoteHash: `h-${unitPrice}-${deliveryFee}`,
	};
}

const option = {
	optionId: "seller_delivery:douala",
	method: "seller_delivery" as const,
	fee: 2000,
	etaText: "24-48 h",
	codAllowed: true,
};

function reviewing(): CheckoutState {
	let state = initialCheckoutState("idem-1");
	state = checkoutReducer(state, {
		type: "addressSubmitted",
		address: toAddressInput(valid),
	});
	state = checkoutReducer(state, { type: "optionChosen", option });
	state = checkoutReducer(state, { type: "quoteLoaded", quote: quote({}) });
	return checkoutReducer(state, { type: "accepted", accepted: true });
}

describe("the three steps", () => {
	test("address, then delivery, then review", () => {
		let state = initialCheckoutState("idem-1");
		expect(state.step).toBe("address");
		state = checkoutReducer(state, {
			type: "addressSubmitted",
			address: toAddressInput(valid),
		});
		expect(state.step).toBe("delivery");
		state = checkoutReducer(state, { type: "optionChosen", option });
		expect(state.step).toBe("review");
		expect(state.option?.optionId).toBe("seller_delivery:douala");
	});

	test("changing city drops the option chosen for the old one", () => {
		let state = reviewing();
		state = checkoutReducer(state, {
			type: "addressSubmitted",
			address: { ...toAddressInput(valid), city: "yaounde" },
		});
		expect(state.option).toBeNull();
		expect(state.quote).toBeNull();
	});

	test("the order can be placed only once the box is ticked", () => {
		const ticked = reviewing();
		expect(canPlaceOrder(ticked)).toBe(true);
		expect(
			canPlaceOrder(
				checkoutReducer(ticked, { type: "accepted", accepted: false }),
			),
		).toBe(false);
	});

	test("the box starts unticked on the first quote", () => {
		let state = reviewing();
		state = checkoutReducer(state, { type: "quoteLoaded", quote: quote({}) });
		expect(state.accepted).toBe(false);
	});

	test("requires a fresh acceptance after a quote change", () => {
		const before = reviewing();
		expect(before.accepted).toBe(true);
		const after = checkoutReducer(before, {
			type: "quoteChanged",
			quote: quote({ deliveryFee: 3_500 }),
		});
		expect(after.accepted).toBe(false);
		expect(canPlaceOrder(after)).toBe(false);
		expect(after.quote?.quoteHash).toBe("h-10000-3500");
		expect(after.previousQuote?.quoteHash).toBe("h-10000-2000");
	});

	test("an address the server refused sends the buyer back to that field", () => {
		const state = checkoutReducer(reviewing(), {
			type: "addressRejected",
			field: "landmark",
		});
		expect(state.step).toBe("address");
		expect(state.addressError).toBe("landmark");
		expect(state.accepted).toBe(false);
	});
});

describe("the differences a quote change highlights", () => {
	test("a new fee names the fee and the total, nothing else", () => {
		expect(
			[...quoteDifferences(quote({}), quote({ deliveryFee: 3_500 }))].sort(),
		).toEqual(["deliveryFee", "total"]);
	});
	test("a new price names the line, the subtotal and the total", () => {
		expect(
			[...quoteDifferences(quote({}), quote({ unitPrice: 12_000 }))].sort(),
		).toEqual(["line:0", "subtotal", "total"]);
	});
	test("no previous quote highlights nothing", () => {
		expect(quoteDifferences(null, quote({})).size).toBe(0);
	});
});

describe("the placement body", () => {
	test("sends the quote's own echo, its hash, the acceptance and the idempotency key", () => {
		const body = placeOrderBody(reviewing(), "fr");
		expect(body).toEqual({
			address: quote({}).summary.delivery.address,
			deliveryOptionId: "seller_delivery:douala",
			paymentMethod: "cod",
			locale: "fr",
			quoteHash: "h-10000-2000",
			acceptTerms: true,
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
});

describe("the confirmation screen", () => {
	test("the three outcomes", () => {
		expect(confirmationOutcome("none")).toBe("confirmed");
		expect(confirmationOutcome("sms_code")).toBe("code");
		expect(confirmationOutcome("seller_call")).toBe("seller_call");
	});
	test("an unknown hint reads as nothing outstanding", () => {
		expect(confirmationOutcome(null)).toBe("confirmed");
	});
	test("the resend cooldown counts down 60 seconds from the last send", () => {
		const sent = new Date("2026-10-02T10:00:00Z");
		expect(resendSecondsLeft(sent, new Date("2026-10-02T10:00:00Z"))).toBe(60);
		expect(resendSecondsLeft(sent, new Date("2026-10-02T10:00:45Z"))).toBe(15);
		expect(resendSecondsLeft(sent, new Date("2026-10-02T10:01:30Z"))).toBe(0);
	});
	test("the map link points at the captured position", () => {
		expect(googleMapsUrl(4.05, 9.7)).toBe(
			"https://www.google.com/maps/search/?api=1&query=4.05%2C9.7",
		);
	});
});
