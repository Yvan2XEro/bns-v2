import { describe, expect, test } from "bun:test";
import type { OrderView } from "~/types/order";
import { cmMarket } from "../test/market-fixture";
import { addressValuesFromOrder, reusableAddress } from "./checkout-prefill";
import { marketPhoneRule } from "./market-phone";

const CM_PHONE = marketPhoneRule(cmMarket()).pattern;
const CITIES = ["douala", "yaounde"];

function delivery(
	overrides: Partial<OrderView["delivery"]> = {},
): OrderView["delivery"] {
	return {
		method: "seller_delivery",
		recipientName: "Grâce Ewane",
		phone: "+237699421507",
		phoneMasked: false,
		city: "douala",
		district: "douala.bonapriso",
		districtOther: null,
		landmark: "Rue Joss, face à la pharmacie",
		gps: { lat: 4.03, lng: 9.69, accuracyMeters: null },
		instructions: null,
		etaText: "sous 24 h",
		fee: 2000,
		pickupPoint: null,
		...overrides,
	};
}

const rules = (servedCity: string | null = "douala") => ({
	cityKeys: CITIES,
	servedCity,
	phonePattern: CM_PHONE,
});

describe("addressValuesFromOrder", () => {
	test("maps the stored delivery onto the form's values", () => {
		expect(addressValuesFromOrder(delivery())).toEqual({
			recipientName: "Grâce Ewane",
			phone: "+237699421507",
			city: "douala",
			district: "douala.bonapriso",
			districtOther: "",
			landmark: "Rue Joss, face à la pharmacie",
			instructions: "",
			gps: { lat: 4.03, lng: 9.69 },
		});
	});

	test("drops a masked phone rather than prefilling it", () => {
		expect(
			addressValuesFromOrder(
				delivery({ phone: "+237 6•• ••", phoneMasked: true }),
			).phone,
		).toBe("");
	});
});

describe("reusableAddress", () => {
	test("reuses a complete address in the shop's city", () => {
		expect(
			reusableAddress(addressValuesFromOrder(delivery()), rules()),
		).toEqual({
			recipientName: "Grâce Ewane",
			phone: "+237699421507",
			city: "douala",
			district: "douala.bonapriso",
			landmark: "Rue Joss, face à la pharmacie",
			gps: { lat: 4.03, lng: 9.69 },
		});
	});

	test("refuses an address in another city than the shop's", () => {
		expect(
			reusableAddress(addressValuesFromOrder(delivery()), rules("yaounde")),
		).toBeNull();
	});

	test("accepts any served city when the shop is outside the served ones", () => {
		expect(
			reusableAddress(addressValuesFromOrder(delivery()), rules(null)),
		).not.toBeNull();
	});

	test("refuses a pickup order's address that has no landmark", () => {
		expect(
			reusableAddress(
				addressValuesFromOrder(delivery({ method: "pickup", landmark: null })),
				rules(),
			),
		).toBeNull();
	});

	test("refuses an address whose phone no longer passes", () => {
		expect(
			reusableAddress(
				addressValuesFromOrder(delivery({ phone: "12345" })),
				rules(),
			),
		).toBeNull();
	});
});
