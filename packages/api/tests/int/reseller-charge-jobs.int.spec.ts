// @vitest-environment node
import { describe, expect, it } from "vitest";
import { markOverdueResellerChargesTask } from "../../src/jobs/markOverdueResellerCharges";
import configPromise from "../../src/payload.config";
import { markOverdueResellerCharges } from "../../src/services/purchaseOrders";
import { fakePayload } from "./helpers/fakePayload";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-04T12:00:00.000Z");

describe("markOverdueResellerCharges", () => {
	it("registers the nightly job on Payload's nightly queue", () => {
		expect(markOverdueResellerChargesTask).toMatchObject({
			slug: "markOverdueResellerCharges",
			schedule: [{ cron: "0 2 * * *", queue: "nightly" }],
		});
	});

	it("registers and drains the charge-expiry task from Payload config", async () => {
		const config = await configPromise;
		const task = (config.jobs?.tasks ?? []).find(
			(candidate) => candidate.slug === "markOverdueResellerCharges",
		);

		expect(task?.schedule).toEqual([{ cron: "0 2 * * *", queue: "nightly" }]);
		expect(config.jobs?.autoRun).toContainEqual({
			cron: "0 0 * * *",
			queue: "nightly",
			limit: 10,
		});
	});

	it("marks charges at 60 days once and adds only the reseller-ineligible hold", async () => {
		const payload = fakePayload({
			"reseller-charges": [
				{
					id: "due",
					resellerShop: "reseller",
					amount: 4_000,
					status: "open",
					createdAt: new Date(NOW.getTime() - 60 * DAY).toISOString(),
				},
				{
					id: "not-due",
					resellerShop: "reseller",
					amount: 2_000,
					status: "open",
					createdAt: new Date(NOW.getTime() - 60 * DAY + 1).toISOString(),
				},
			],
			listings: [
				{
					id: "resale-listing",
					shop: "reseller",
					product: "product-1",
					status: "published",
					resale: {
						supplierShop: "supplier",
						desiredStatus: "published",
						holds: ["price_below_minimum"],
					},
				},
				{
					id: "supplier-listing",
					shop: "supplier",
					product: "product-1",
					status: "published",
				},
				{
					id: "own-listing",
					shop: "reseller",
					product: "own-product",
					status: "published",
				},
			],
		});

		const first = await markOverdueResellerCharges(payload, NOW);
		const replay = await markOverdueResellerCharges(payload, NOW);

		expect(first).toEqual({ markedOverdue: 1 });
		expect(replay).toEqual({ markedOverdue: 0 });
		expect(
			payload.store["reseller-charges"].map((charge) => charge.status),
		).toEqual(["overdue", "open"]);
		expect(payload.store.listings[0]).toMatchObject({
			status: "draft",
			resale: {
				holds: ["price_below_minimum", "reseller_ineligible"],
			},
		});
		expect(payload.store.listings[2]).toMatchObject({
			status: "published",
			product: "own-product",
		});
	});
});
