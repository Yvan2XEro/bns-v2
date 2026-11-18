// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { notifyStockLow } = vi.hoisted(() => ({
	notifyStockLow: vi.fn(async () => undefined),
}));
vi.mock("../../src/services/shopNotifications", () => ({ notifyStockLow }));

import { withTransaction } from "../../src/lib/transactions";
import type { ProductVariant } from "../../src/payload-types";
import {
	movementExists,
	recordReturn,
	release,
	reserve,
	sell,
} from "../../src/services/stock";
import { fakePayload } from "./helpers/fakePayload";

function seed(stockOnHand = 5, stockReserved = 0) {
	return fakePayload({
		products: [{ id: "p-1", shop: "s-1", title: "AirPods Pro" }],
		"product-variants": [
			{
				id: "v-1",
				product: "p-1",
				shop: "s-1",
				optionValues: {},
				sku: "AT-APP2",
				price: 95000,
				cost: 78000,
				trackInventory: true,
				stockOnHand,
				stockReserved,
				lowStockThreshold: 1,
				archivedAt: null,
			},
			{
				id: "v-untracked",
				product: "p-1",
				shop: "s-1",
				optionValues: {},
				price: 1000,
				trackInventory: false,
				stockOnHand: 0,
				stockReserved: 0,
				archivedAt: null,
			},
		],
		"stock-movements": [],
	});
}

type Seeded = ReturnType<typeof seed>;

const variant = (payload: Seeded, id = "v-1") =>
	payload.store["product-variants"].find((v) => v.id === id);

/**
 * The fixture's rows are plain `Doc`s, like every other fake-payload test in
 * this suite; this is the one guard that narrows one to the `ProductVariant`
 * these functions require, instead of a second copy of that shape.
 */
function variantArg(payload: Seeded, id = "v-1"): ProductVariant {
	const doc = variant(payload, id);
	if (!doc || typeof doc.id !== "string") {
		throw new Error(`fixture variant ${id} not found`);
	}
	return doc as unknown as ProductVariant;
}

type Args = { quantity: number; orderId: string; orderRef: string | null };

/**
 * Every order-stock function needs a real `PayloadRequest`, which only
 * `withTransaction` produces; each call here gets its own transaction, the
 * same as a real order-lifecycle step would.
 */
function run<T>(
	payload: Seeded,
	fn: (req: Parameters<typeof reserve>[0]) => Promise<T>,
): Promise<T> {
	return withTransaction(payload, fn);
}

const doReserve = (payload: Seeded, variantId: string, args: Args) =>
	run(payload, (req) =>
		reserve(req, { variant: variantArg(payload, variantId), ...args }),
	);
const doRelease = (payload: Seeded, variantId: string, args: Args) =>
	run(payload, (req) =>
		release(req, { variant: variantArg(payload, variantId), ...args }),
	);
const doSell = (payload: Seeded, variantId: string, args: Args) =>
	run(payload, (req) =>
		sell(req, { variant: variantArg(payload, variantId), ...args }),
	);
const doReturn = (payload: Seeded, variantId: string, args: Args) =>
	run(payload, (req) =>
		recordReturn(req, { variant: variantArg(payload, variantId), ...args }),
	);

describe("reserve", () => {
	// Isolates ORDER_MOVEMENTS.reserve's `onHand: 0` coefficient: a reserve
	// that touched stockOnHand would fail this.
	it("moves stockReserved and leaves stockOnHand alone", async () => {
		const payload = seed(5, 1);
		const result = await doReserve(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: "BNS-1",
		});
		expect(result?.variant.stockOnHand).toBe(5);
		expect(result?.variant.stockReserved).toBe(3);
		expect(result?.movement).toMatchObject({
			type: "reservation",
			quantity: 2,
			stockAfter: 5,
			reservedAfter: 3,
			order: "o-1",
			orderRef: "BNS-1",
		});
		expect(variant(payload)?.stockReserved).toBe(3);
		expect(variant(payload)?.stockOnHand).toBe(5);
	});

	// Isolates the reservation CAS condition in `orderMovementConditions`.
	it("refuses when available is less than the quantity", async () => {
		const payload = seed(2, 2);
		await expect(
			doReserve(payload, "v-1", {
				quantity: 1,
				orderId: "o-1",
				orderRef: null,
			}),
		).rejects.toMatchObject({ code: "stock.insufficient" });
		expect(variant(payload)?.stockReserved).toBe(2);
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});

	// Isolates the atomic conditional update: without it, both racers would
	// read the same stale snapshot and both would succeed.
	it("on the last unit, run twice concurrently, succeeds once", async () => {
		const payload = seed(1, 0);
		const results = await Promise.allSettled([
			doReserve(payload, "v-1", {
				quantity: 1,
				orderId: "o-1",
				orderRef: null,
			}),
			doReserve(payload, "v-1", {
				quantity: 1,
				orderId: "o-2",
				orderRef: null,
			}),
		]);
		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
			code: "stock.insufficient",
		});
		expect(variant(payload)?.stockReserved).toBe(1);
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});

	// Isolates the untracked-variant short-circuit, shared by all four
	// functions.
	it("does nothing for an untracked variant", async () => {
		const payload = seed();
		const result = await doReserve(payload, "v-untracked", {
			quantity: 1,
			orderId: "o-1",
			orderRef: null,
		});
		expect(result).toBeNull();
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});

	// Isolates the `movementExists` idempotency gate: stock is left generous
	// enough that, without the gate, a second call would still pass the CAS
	// condition and double-reserve.
	it("a replayed call writes no second movement", async () => {
		const payload = seed(10, 0);
		const first = await doReserve(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: null,
		});
		expect(first?.variant.stockReserved).toBe(2);
		const second = await doReserve(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: null,
		});
		expect(second).toBeNull();
		expect(variant(payload)?.stockReserved).toBe(2);
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});

	it("movementExists reports the gate it guards", async () => {
		const payload = seed();
		expect(
			await run(payload, (req) =>
				movementExists(req, {
					orderId: "o-1",
					variantId: "v-1",
					type: "reservation",
				}),
			),
		).toBe(false);
		await doReserve(payload, "v-1", {
			quantity: 1,
			orderId: "o-1",
			orderRef: null,
		});
		expect(
			await run(payload, (req) =>
				movementExists(req, {
					orderId: "o-1",
					variantId: "v-1",
					type: "reservation",
				}),
			),
		).toBe(true);
	});

	// Isolates the onCommit queuing added for the reservation's crossing
	// check: the notification must land after the transaction's body has
	// finished running, never inside it.
	it("crossing the low-stock threshold queues the stock-low notification after commit, not during", async () => {
		const payload = seed(5, 3); // available = 2, threshold = 1
		const order: string[] = [];
		notifyStockLow.mockImplementationOnce(async () => {
			order.push("notified");
		});

		await withTransaction(payload, async (req) => {
			order.push("body-start");
			const result = await reserve(req, {
				variant: variantArg(payload, "v-1"),
				quantity: 1,
				orderId: "o-1",
				orderRef: null,
			});
			order.push("body-end");
			return result;
		});

		expect(order).toEqual(["body-start", "body-end", "notified"]);
		expect(notifyStockLow).toHaveBeenCalledTimes(1);
	});
});

describe("release", () => {
	// Isolates the release condition: `stockReserved >= quantity`.
	it("returns the units to availability and refuses to go below zero", async () => {
		const payload = seed(5, 2);
		const ok = await doRelease(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: null,
		});
		expect(ok?.variant.stockReserved).toBe(0);
		expect(ok?.movement).toMatchObject({ type: "release", quantity: -2 });

		const refused = await doRelease(payload, "v-1", {
			quantity: 1,
			orderId: "o-2",
			orderRef: null,
		});
		expect(refused).toBeNull();
		expect(payload.logger.error).toHaveBeenCalledTimes(1);
		expect(variant(payload)?.stockReserved).toBe(0);
	});

	it("does nothing for an untracked variant", async () => {
		const payload = seed();
		const result = await doRelease(payload, "v-untracked", {
			quantity: 1,
			orderId: "o-1",
			orderRef: null,
		});
		expect(result).toBeNull();
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});

	it("a replayed call writes no second movement", async () => {
		const payload = seed(10, 8);
		const first = await doRelease(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: null,
		});
		expect(first?.variant.stockReserved).toBe(6);
		const second = await doRelease(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: null,
		});
		expect(second).toBeNull();
		expect(variant(payload)?.stockReserved).toBe(6);
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});
});

describe("sell", () => {
	// Isolates sell's dual condition: both counters must hold `quantity`.
	it("decrements both counters and requires both conditions", async () => {
		const payload = seed(5, 3);
		const ok = await doSell(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: "BNS-1",
		});
		expect(ok?.variant.stockOnHand).toBe(3);
		expect(ok?.variant.stockReserved).toBe(1);
		expect(ok?.movement).toMatchObject({
			type: "sale",
			quantity: -2,
			stockAfter: 3,
			reservedAfter: 1,
		});

		// Reserved now holds only 1: a sale of 2 fails on the reserved leg even
		// though on-hand alone would allow it.
		const refused = await doSell(payload, "v-1", {
			quantity: 2,
			orderId: "o-2",
			orderRef: null,
		});
		expect(refused).toBeNull();
		expect(variant(payload)?.stockOnHand).toBe(3);
		expect(variant(payload)?.stockReserved).toBe(1);
	});

	// Review Focus 4: a failed sell must alert, never throw, because the
	// delivery already physically happened.
	it("logs and alerts instead of throwing when its condition fails", async () => {
		const payload = seed(5, 0); // stockReserved tampered to 0
		await expect(
			doSell(payload, "v-1", {
				quantity: 1,
				orderId: "o-1",
				orderRef: null,
			}),
		).resolves.toBeNull();
		expect(payload.logger.error).toHaveBeenCalledTimes(1);
		expect(payload.store["stock-movements"]).toHaveLength(0);
		expect(variant(payload)?.stockOnHand).toBe(5);
	});

	it("does nothing for an untracked variant", async () => {
		const payload = seed();
		const result = await doSell(payload, "v-untracked", {
			quantity: 1,
			orderId: "o-1",
			orderRef: null,
		});
		expect(result).toBeNull();
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});

	it("a replayed call writes no second movement", async () => {
		const payload = seed(10, 5);
		const first = await doSell(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: null,
		});
		expect(first?.variant.stockOnHand).toBe(8);
		const second = await doSell(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: null,
		});
		expect(second).toBeNull();
		expect(variant(payload)?.stockOnHand).toBe(8);
		expect(variant(payload)?.stockReserved).toBe(3);
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});
});

describe("recordReturn", () => {
	// Isolates recordReturn's unconditional branch: goods physically came
	// back, so nothing may refuse it.
	it("increments on-hand with no condition", async () => {
		const payload = seed(0, 0);
		const result = await doReturn(payload, "v-1", {
			quantity: 3,
			orderId: "o-1",
			orderRef: null,
		});
		expect(result?.variant.stockOnHand).toBe(3);
		expect(result?.variant.stockReserved).toBe(0);
		expect(result?.movement).toMatchObject({
			type: "return",
			quantity: 3,
			stockAfter: 3,
		});
	});

	it("does nothing for an untracked variant", async () => {
		const payload = seed();
		const result = await doReturn(payload, "v-untracked", {
			quantity: 1,
			orderId: "o-1",
			orderRef: null,
		});
		expect(result).toBeNull();
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});

	it("a replayed call writes no second movement", async () => {
		const payload = seed(0, 0);
		const first = await doReturn(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: null,
		});
		expect(first?.variant.stockOnHand).toBe(2);
		const second = await doReturn(payload, "v-1", {
			quantity: 2,
			orderId: "o-1",
			orderRef: null,
		});
		expect(second).toBeNull();
		expect(variant(payload)?.stockOnHand).toBe(2);
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});
});
