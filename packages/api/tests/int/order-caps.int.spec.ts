// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkCaps, confirmationPathFor } from "../../src/lib/orderCaps";
import { BUYER_CAPS } from "../../src/lib/orderSettings";
import { codCaps, codCapsWithStanding } from "../../src/lib/shopCapabilities";

const shop = codCaps(1);
if (!shop) throw new Error("level 1 has caps");

const input = (patch: Partial<Parameters<typeof checkCaps>[0]> = {}) => ({
	orderTotal: 50_000,
	openOrders: 0,
	dailyOrders: 0,
	shop,
	buyer: BUYER_CAPS.regular,
	...patch,
});

describe("COD standing caps", () => {
	it("halves only the daily shop cap when standing effects apply", () => {
		expect(codCapsWithStanding(shop, true)).toEqual({
			maxOrderTotal: 150_000,
			maxDailyOrders: 10,
			maxOpenOrders: 30,
		});
		expect(codCapsWithStanding(shop, false)).toEqual(shop);
	});
});

describe("checkCaps", () => {
	it("passes inside both sets of limits", () => {
		expect(checkCaps(input())).toBeNull();
	});

	it("names the buyer when the buyer limit is the stricter one", () => {
		// 150 000 shop, 200 000 buyer: a 160 000 order breaches the shop's.
		expect(checkCaps(input({ orderTotal: 160_000 }))).toEqual({
			scope: "shop",
			limit: "orderTotal",
		});
		// A `new` buyer is capped at 75 000, below the shop's 150 000.
		expect(
			checkCaps(input({ orderTotal: 100_000, buyer: BUYER_CAPS.new })),
		).toEqual({
			scope: "buyer",
			limit: "orderTotal",
		});
	});

	it("treats the limits as inclusive maxima", () => {
		expect(checkCaps(input({ orderTotal: 150_000 }))).toBeNull();
		expect(checkCaps(input({ orderTotal: 150_001 }))).toEqual({
			scope: "shop",
			limit: "orderTotal",
		});
	});

	it("counts open and daily orders separately", () => {
		expect(
			checkCaps(input({ openOrders: 3, buyer: BUYER_CAPS.regular })),
		).toEqual({
			scope: "buyer",
			limit: "openOrders",
		});
		expect(checkCaps(input({ dailyOrders: 20 }))).toEqual({
			scope: "shop",
			limit: "dailyOrders",
		});
	});

	it("lets a trusted buyer be bounded by the shop alone", () => {
		expect(
			checkCaps(input({ orderTotal: 149_000, buyer: BUYER_CAPS.trusted })),
		).toBeNull();
		expect(
			checkCaps(input({ orderTotal: 151_000, buyer: BUYER_CAPS.trusted })),
		).toEqual({
			scope: "shop",
			limit: "orderTotal",
		});
	});
});

describe("confirmationPathFor", () => {
	it("auto-confirms only a regular or trusted buyer on their own verified phone", () => {
		expect(
			confirmationPathFor({
				tier: "trusted",
				deliveryPhoneIsVerifiedAccountPhone: true,
			}),
		).toBe("none");
		expect(
			confirmationPathFor({
				tier: "regular",
				deliveryPhoneIsVerifiedAccountPhone: true,
			}),
		).toBe("none");
	});

	it("still asks a brand-new buyer for a code on their own verified phone", () => {
		// Ruling 1 in Conflicts: the placement algorithm wins over the caps
		// table's "unless", because a new buyer's commitment is what the code
		// tests, not their ownership of the number.
		expect(
			confirmationPathFor({
				tier: "new",
				deliveryPhoneIsVerifiedAccountPhone: true,
			}),
		).toBe("sms_code");
	});

	it("asks for a code on someone else's number", () => {
		for (const tier of ["new", "regular", "trusted"] as const) {
			expect(
				confirmationPathFor({
					tier,
					deliveryPhoneIsVerifiedAccountPhone: false,
				}),
			).toBe("sms_code");
		}
	});

	it("always demands a seller call for a watched buyer", () => {
		expect(
			confirmationPathFor({
				tier: "watch",
				deliveryPhoneIsVerifiedAccountPhone: true,
			}),
		).toBe("seller_call");
		expect(
			confirmationPathFor({
				tier: "watch",
				deliveryPhoneIsVerifiedAccountPhone: false,
			}),
		).toBe("seller_call");
	});
});
