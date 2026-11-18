// @vitest-environment node
import { describe, expect, it } from "vitest";
import { adjustResellerCommission } from "../../src/services/purchaseOrders";
import { withTransaction } from "../../src/lib/transactions";
import { fakePayload } from "./helpers/fakePayload";

describe("reseller commission adjustments", () => {
	it("reduces an unpaid commission and creates a supplier charge for the excess once", async () => {
		const payload = fakePayload({
			"purchase-orders": [
				{
					id: "po-1",
					resellerShop: "reseller",
					supplierShop: "supplier",
					resellerCommission: 2000,
				},
			],
			"reseller-commissions": [
				{
					id: "commission-1",
					purchaseOrder: "po-1",
					resellerShop: "reseller",
					supplierShop: "supplier",
					order: "order-1",
					amount: 1000,
					status: "payable",
					holdReasons: [],
				},
			],
		});

		for (let attempt = 0; attempt < 2; attempt += 1) {
			await withTransaction(payload, (req) =>
				adjustResellerCommission(req, "po-1", -1500, {
					source: "dispute",
					sourceId: "dispute-1",
				}),
			);
		}

		expect(payload.store["reseller-commissions"][0]).toMatchObject({
			amount: 0,
			status: "cancelled",
			cancelReason: "refunded",
		});
		expect(payload.store["reseller-charges"]).toHaveLength(1);
		expect(payload.store["reseller-charges"][0]).toMatchObject({
			resellerShop: "reseller",
			supplierShop: "supplier",
			purchaseOrder: "po-1",
			type: "clawback",
			amount: 500,
			status: "open",
		});
		expect(payload.store["purchase-orders"][0]?.resellerCommission).toBe(1000);
	});

	it("turns an already-paid commission reduction into a charge without changing the payout snapshot", async () => {
		const payload = fakePayload({
			"purchase-orders": [
				{
					id: "po-2",
					resellerShop: "reseller",
					supplierShop: "supplier",
					resellerCommission: 2400,
				},
			],
			"reseller-commissions": [
				{
					id: "commission-2",
					purchaseOrder: "po-2",
					resellerShop: "reseller",
					supplierShop: "supplier",
					order: "order-2",
					amount: 2400,
					status: "paid",
					holdReasons: [],
				},
			],
		});

		await withTransaction(payload, (req) =>
			adjustResellerCommission(req, "po-2", -700, {
				source: "dispute",
				sourceId: "dispute-2",
			}),
		);

		expect(payload.store["reseller-commissions"][0]).toMatchObject({
			amount: 2400,
			status: "paid",
		});
		expect(payload.store["reseller-charges"][0]).toMatchObject({
			type: "clawback",
			amount: 700,
		});
	});
});
