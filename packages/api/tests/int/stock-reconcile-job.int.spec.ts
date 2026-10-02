// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	reconcileStockCaches,
	reconcileStockCachesTask,
} from "../../src/jobs/reconcileStockCaches";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

function variant(overrides: Doc = {}): Doc {
	return {
		id: "v-1",
		product: "p-1",
		shop: "s-1",
		sku: "AKW-001",
		trackInventory: true,
		stockOnHand: 7,
		stockReserved: 2,
		archivedAt: null,
		...overrides,
	};
}

/** Two movements, newest last: the ledger ran 12 -> 7. */
function ledger(): Doc[] {
	return [
		{
			id: "m-1",
			variant: "v-1",
			product: "p-1",
			shop: "s-1",
			type: "receipt",
			quantity: 12,
			stockAfter: 12,
			reservedAfter: 0,
			createdAt: "2026-09-25T08:00:00.000Z",
		},
		{
			id: "m-2",
			variant: "v-1",
			product: "p-1",
			shop: "s-1",
			type: "sale",
			quantity: -5,
			stockAfter: 7,
			reservedAfter: 2,
			createdAt: "2026-09-26T08:00:00.000Z",
		},
	];
}

function world(variants: Doc[], movements: Doc[] = ledger()) {
	return fakePayload({
		"product-variants": variants,
		"stock-movements": movements,
	});
}

const variantsOf = (p: FakePayload) => p.store["product-variants"];

describe("reconcileStockCaches", () => {
	it("reports no drift and logs nothing when the cache matches the ledger head", async () => {
		const payload = world([
			variant(),
			// Neither of these has anything to reconcile: an untracked variant has
			// no authoritative count and an archived one is out of the catalogue.
			variant({ id: "v-untracked", trackInventory: false, stockOnHand: 99 }),
			variant({ id: "v-archived", archivedAt: "2026-01-01T00:00:00.000Z" }),
		]);

		const result = await reconcileStockCaches(payload);

		expect(result).toEqual({ checked: 1, corrected: [], unexplained: [] });
		expect(variantsOf(payload)[0].stockOnHand).toBe(7);
		expect(payload.writes).toEqual([]);
		expect(payload.logger.warn).not.toHaveBeenCalled();
		expect(payload.logger.error).not.toHaveBeenCalled();
	});

	it("corrects and logs a cache exactly one movement behind the ledger", async () => {
		// 12 is the ledger's own previous checkpoint: m-2 was written but never
		// applied to the cache, and the ledger names which movement that was.
		const payload = world([variant({ stockOnHand: 12 })]);

		const result = await reconcileStockCaches(payload);

		expect(result.checked).toBe(1);
		expect(result.unexplained).toEqual([]);
		expect(result.corrected).toEqual([
			{
				variantId: "v-1",
				productId: "p-1",
				sku: "AKW-001",
				cached: 12,
				ledger: 7,
				delta: 5,
				available: 10,
				movementId: "m-2",
			},
		]);
		expect(variantsOf(payload)[0].stockOnHand).toBe(7);
		expect(payload.logger.warn).toHaveBeenCalled();
	});

	it("reports the drift it finds and does not silently correct a variant whose ledger disagrees by more than one movement", async () => {
		// 40 matches no checkpoint the ledger ever recorded, so no single missed
		// movement explains it. Rewriting it to 7 would destroy the only
		// evidence of whatever produced the 33 units.
		const payload = world([variant({ stockOnHand: 40 })]);

		const result = await reconcileStockCaches(payload);

		expect(result.checked).toBe(1);
		expect(result.corrected).toEqual([]);
		expect(result.unexplained).toEqual([
			{
				variantId: "v-1",
				productId: "p-1",
				sku: "AKW-001",
				cached: 40,
				ledger: 7,
				delta: 33,
				available: 38,
				movementId: "m-2",
			},
		]);
		// The cached figure is exactly what it was, and nothing was written.
		expect(variantsOf(payload)[0].stockOnHand).toBe(40);
		expect(variantsOf(payload)[0].stockReserved).toBe(2);
		expect(payload.writes).toEqual([]);
		// The alert carries the drift, so a human can act on it.
		expect(payload.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				variantId: "v-1",
				cached: 40,
				ledger: 7,
				delta: 33,
			}),
			expect.stringContaining("left for a human"),
		);
	});

	it("leaves a variant with an empty ledger alone", async () => {
		// Initial stock can be set when the variant is created, without a
		// movement. There is no authority to compare against, so there is no
		// drift to report.
		const payload = world([variant({ stockOnHand: 5 })], []);

		const result = await reconcileStockCaches(payload);

		expect(result).toEqual({ checked: 1, corrected: [], unexplained: [] });
		expect(variantsOf(payload)[0].stockOnHand).toBe(5);
	});

	it("runs nightly on the nightly queue", () => {
		expect(reconcileStockCachesTask.slug).toBe("reconcileStockCaches");
		expect(reconcileStockCachesTask.schedule).toEqual([
			{ cron: "0 2 * * *", queue: "nightly" },
		]);
	});
});
