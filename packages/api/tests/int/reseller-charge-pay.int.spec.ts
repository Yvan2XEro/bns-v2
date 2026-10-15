// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const createPayment = vi.fn();
vi.mock("../../src/lib/payments", () => ({
	getProvider: () => ({ createPayment }),
}));

import { payResellerCharge } from "../../src/services/purchaseOrders";
import {
	type Doc,
	type FakePayload,
	fakePayload,
	rwMarketRow,
} from "./helpers/fakePayload";

const OWNER = { id: "u-owner", email: "owner@example.com", name: "Aicha" };

function world(charge: Doc = {}, intents: Doc[] = [], shop: Doc = {}) {
	return fakePayload(
		{
			shops: [
				{
					id: "shop-1",
					owner: "u-owner",
					status: "active",
					location: { city: "douala" },
					...shop,
				},
			],
			"shop-members": [
				{
					id: "member-1",
					shop: "shop-1",
					user: "u-owner",
					role: "owner",
					status: "active",
				},
			],
			"reseller-charges": [
				{
					id: "charge-1",
					resellerShop: "shop-1",
					type: "clawback",
					amount: 3_578,
					status: "overdue",
					paymentIntents: [],
					...charge,
				},
			],
			"payment-intents": intents,
		},
		{ uniques: { "payment-intents": [["idempotencyKey"]] } },
	);
}

const intentsOf = (payload: FakePayload) => payload.store["payment-intents"];

beforeEach(() => {
	createPayment.mockReset();
	createPayment.mockResolvedValue({
		checkoutUrl: "https://pay.test/resale",
		providerReference: "trx.resale",
	});
});

describe("payResellerCharge", () => {
	it("creates a payment intent for the exact overdue charge and returns checkout", async () => {
		const payload = world();

		const result = await payResellerCharge(payload, OWNER, "charge-1");

		expect(result).toEqual({ checkoutUrl: "https://pay.test/resale" });
		expect(intentsOf(payload)).toMatchObject([
			{
				purpose: "reseller_charge",
				targetType: "reseller-charge",
				targetId: "charge-1",
				customer: "u-owner",
				amount: 3_578,
				currency: "XAF",
				status: "pending",
			},
		]);
		expect(payload.store["reseller-charges"][0].paymentIntents).toEqual([
			intentsOf(payload)[0].id,
		]);
	});

	it("charges in the currency of the reseller shop's market", async () => {
		const payload = world({}, [], { location: { city: "kigali" } });
		payload.store.markets.push(rwMarketRow());
		payload.store["market-cities"].push({
			id: "rw:kigali",
			market: "market-rw",
			key: "kigali",
			label: "Kigali",
			defaultDeliveryFee: 1200,
			districts: [],
			active: true,
			sortOrder: 0,
		});

		await payResellerCharge(payload, OWNER, "charge-1");

		expect(intentsOf(payload)[0]).toMatchObject({ currency: "RWF" });
		expect(createPayment).toHaveBeenCalledWith(
			expect.objectContaining({ currency: "RWF" }),
		);
	});

	it("reuses a live pending checkout rather than charging twice", async () => {
		const payload = world({}, [
			{
				id: "intent-live",
				purpose: "reseller_charge",
				targetType: "reseller-charge",
				targetId: "charge-1",
				status: "pending",
				checkoutUrl: "https://pay.test/live",
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
				idempotencyKey: "reseller-charge:charge-1:1",
			},
		]);

		const result = await payResellerCharge(payload, OWNER, "charge-1");

		expect(result).toEqual({ checkoutUrl: "https://pay.test/live" });
		expect(intentsOf(payload)).toHaveLength(1);
		expect(createPayment).not.toHaveBeenCalled();
	});

	it("refuses a paid charge without creating another intent", async () => {
		const payload = world({ status: "paid" });

		await expect(
			payResellerCharge(payload, OWNER, "charge-1"),
		).rejects.toMatchObject({ status: 409 });
		expect(intentsOf(payload)).toHaveLength(0);
	});
});
