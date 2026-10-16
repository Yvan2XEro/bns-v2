// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Shop } from "../../src/payload-types";
import { appliedRates } from "../../src/services/sellerPayments";
import { cmMarketRow, type Doc, fakePayload } from "./helpers/fakePayload";

const SHOP = {
	id: "s-1",
	location: { city: "douala", countryCode: "CM" },
} as unknown as Shop;

function seed(extra: Record<string, Doc[]> = {}, orders: Doc = {}) {
	return fakePayload(
		{ categories: [{ id: "c-1", name: "Phones" }], ...extra },
		{
			globals: {
				"app-settings": {
					orders: { defaultCommissionRateBps: 700, ...orders },
				},
			},
		},
	);
}

describe("appliedRates (W33)", () => {
	it("reads the commission each order recorded and the market's VAT", async () => {
		const rates = await appliedRates(seed(), SHOP, [
			{ commission: { rateBps: 800 } },
			{ commission: { rateBps: 800 } },
			{ commission: {} },
		]);
		expect(rates).toEqual({ commissionBps: 800, vatBps: 1925 });
	});

	it("names no commission rate when the orders were charged at several", async () => {
		const rates = await appliedRates(seed(), SHOP, [
			{ commission: { rateBps: 800 } },
			{ commission: { rateBps: 1000 } },
		]);
		expect(rates.commissionBps).toBeNull();
	});

	it("falls back to the configured default before any accrual", async () => {
		expect((await appliedRates(seed(), SHOP, [])).commissionBps).toBe(700);
	});

	it("promises no default when a category carries its own rate", async () => {
		const payload = seed({
			categories: [{ id: "c-2", name: "Wax", commissionRateBps: 1200 }],
		});
		expect((await appliedRates(payload, SHOP, [])).commissionBps).toBeNull();
	});

	it("takes the VAT from the shop's market, never a constant", async () => {
		const payload = seed({ markets: [{ ...cmMarketRow(), vatRateBps: 1800 }] });
		expect((await appliedRates(payload, SHOP, [])).vatBps).toBe(1800);
	});

	it("falls back to the order settings' VAT when the market is unknown", async () => {
		const shop = {
			id: "s-1",
			location: { city: "nowhere" },
		} as unknown as Shop;
		const rates = await appliedRates(seed({}, { vatRateBps: 1500 }), shop, []);
		expect(rates.vatBps).toBe(1500);
	});
});
