// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	applyMovement,
	listMovements,
	recordMovement,
	recordStockCount,
	stockSummary,
} from "../../src/services/stock";
import { fakePayload } from "./helpers/fakePayload";

const U1 = { id: "u-1" };

function seed(stockOnHand = 2) {
	return fakePayload({
		users: [
			{ id: "u-1", name: "Aïcha" },
			{ id: "u-2", name: "Stranger" },
		],
		shops: [
			{ id: "s-1", status: "active", owner: "u-1" },
			{ id: "s-2", status: "suspended", owner: "u-1" },
		],
		"shop-members": [
			{ id: "m-1", shop: "s-1", user: "u-1", role: "owner", status: "active" },
			{ id: "m-2", shop: "s-2", user: "u-1", role: "owner", status: "active" },
		],
		products: [
			{
				id: "p-1",
				shop: "s-1",
				title: "AirPods Pro",
				status: "draft",
				listing: null,
			},
			{
				id: "p-2",
				shop: "s-2",
				title: "Suspended item",
				status: "draft",
				listing: null,
			},
		],
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
				stockReserved: 0,
				lowStockThreshold: 1,
				archivedAt: null,
			},
			{
				id: "v-2",
				product: "p-2",
				shop: "s-2",
				optionValues: {},
				price: 1000,
				cost: 500,
				trackInventory: true,
				stockOnHand: 5,
				stockReserved: 0,
				lowStockThreshold: null,
				archivedAt: null,
			},
		],
		"stock-movements": [],
	});
}

const variant = (payload: ReturnType<typeof seed>) =>
	payload.store["product-variants"].find((v) => v.id === "v-1");

describe("recordMovement", () => {
	it("records a receipt and updates the cached stock", async () => {
		const payload = seed();
		const result = await recordMovement(payload, U1, "v-1", {
			type: "receipt",
			quantity: 10,
			unitCost: 78000,
			note: "Arrivage",
		});

		expect(variant(payload)?.stockOnHand).toBe(12);
		expect(result.movement).toMatchObject({
			type: "receipt",
			quantity: 10,
			stockAfter: 12,
			unitCost: 78000,
			note: "Arrivage",
			actor: { id: "u-1", name: "Aïcha" },
			product: { id: "p-1", title: "AirPods Pro" },
		});
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});

	it("refuses a movement that would go below zero", async () => {
		const payload = seed();
		await expect(
			recordMovement(payload, U1, "v-1", { type: "loss", quantity: -3 }),
		).rejects.toMatchObject({ code: "stock.negative", status: 409 });
		expect(variant(payload)?.stockOnHand).toBe(2);
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});

	it("rolls the stock back when the movement cannot be written", async () => {
		const payload = seed();
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "stock-movements";
		await expect(
			recordMovement(payload, U1, "v-1", { type: "receipt", quantity: 5 }),
		).rejects.toThrow();
		expect(variant(payload)?.stockOnHand).toBe(2);
	});

	it("does not oversell under concurrent losses", async () => {
		const payload = seed(1);
		const results = await Promise.allSettled([
			recordMovement(payload, U1, "v-1", { type: "loss", quantity: -1 }),
			recordMovement(payload, U1, "v-1", { type: "loss", quantity: -1 }),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
		expect(variant(payload)?.stockOnHand).toBe(0);
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});

	it("does not lose concurrent receipts", async () => {
		const payload = seed(2);
		await Promise.all([
			recordMovement(payload, U1, "v-1", { type: "receipt", quantity: 5 }),
			recordMovement(payload, U1, "v-1", { type: "receipt", quantity: 5 }),
		]);
		expect(variant(payload)?.stockOnHand).toBe(12);
		expect(
			payload.store["stock-movements"]
				.map((m) => m.stockAfter)
				.sort((a, b) => a - b),
		).toEqual([7, 12]);
	});

	it("reports the low-stock crossing once", async () => {
		const payload = seed(2);
		expect(
			(await recordMovement(payload, U1, "v-1", { type: "loss", quantity: -1 }))
				.crossedLowStock,
		).toBe(true);
		expect(
			(await recordMovement(payload, U1, "v-1", { type: "loss", quantity: -1 }))
				.crossedLowStock,
		).toBe(false);
		await recordMovement(payload, U1, "v-1", { type: "receipt", quantity: 5 });
		expect(
			(
				await recordMovement(payload, U1, "v-1", {
					type: "adjustment",
					quantity: -4,
				})
			).crossedLowStock,
		).toBe(true);
	});

	it("validates the sign for each type", async () => {
		const payload = seed();
		await expect(
			recordMovement(payload, U1, "v-1", { type: "receipt", quantity: -1 }),
		).rejects.toMatchObject({ code: "generic.validation" });
		await expect(
			recordMovement(payload, U1, "v-1", { type: "loss", quantity: 1 }),
		).rejects.toMatchObject({ code: "generic.validation" });
		await expect(
			recordMovement(payload, U1, "v-1", { type: "adjustment", quantity: 0 }),
		).rejects.toMatchObject({ code: "generic.validation" });
		await expect(
			recordMovement(payload, U1, "v-1", { type: "sale", quantity: -1 }),
		).rejects.toMatchObject({ code: "generic.validation" });
		await expect(
			recordMovement(payload, U1, "v-1", { type: "receipt", quantity: 1.5 }),
		).rejects.toMatchObject({ code: "generic.validation" });
		await expect(
			recordMovement(payload, U1, "v-1", {
				type: "loss",
				quantity: -1,
				unitCost: 500,
			}),
		).rejects.toMatchObject({ code: "generic.validation" });
	});

	it("refuses non-members and suspended shops", async () => {
		await expect(
			recordMovement(seed(), { id: "u-2" }, "v-1", {
				type: "receipt",
				quantity: 1,
			}),
		).rejects.toMatchObject({ code: "shop.notMember" });
		await expect(
			recordMovement(seed(), U1, "v-2", { type: "receipt", quantity: 1 }),
		).rejects.toMatchObject({ code: "shop.inactive" });
	});

	it("turns tracking on for an untracked variant", async () => {
		const payload = seed(0);
		variant(payload)!.trackInventory = false;
		await recordMovement(payload, U1, "v-1", { type: "receipt", quantity: 3 });
		expect(variant(payload)?.trackInventory).toBe(true);
	});
});

describe("recordStockCount", () => {
	it("refuses the loser of two concurrent counts instead of doubling", async () => {
		const payload = seed(2);
		const results = await Promise.allSettled([
			recordStockCount(payload, U1, "s-1", {
				counts: [{ variantId: "v-1", counted: 5 }],
			}),
			recordStockCount(payload, U1, "s-1", {
				counts: [{ variantId: "v-1", counted: 5 }],
			}),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(results.find((r) => r.status === "rejected")?.reason).toMatchObject({
			code: "stock.countStale",
			status: 409,
		});
		expect(variant(payload)?.stockOnHand).toBe(5);
		expect(payload.store["stock-movements"]).toHaveLength(1);
		expect(payload.store["stock-movements"][0]).toMatchObject({
			quantity: 3,
			stockAfter: 5,
		});
	});

	it("writes one adjustment per difference and skips matches", async () => {
		const payload = seed(2);
		const { results } = await recordStockCount(payload, U1, "s-1", {
			counts: [{ variantId: "v-1", counted: 3 }],
			note: "Inventaire du 15 septembre",
		});
		expect(results).toEqual([{ variantId: "v-1", delta: 1, stockAfter: 3 }]);
		expect(payload.store["stock-movements"][0]).toMatchObject({
			type: "adjustment",
			quantity: 1,
			note: "Inventaire du 15 septembre",
		});

		const again = await recordStockCount(payload, U1, "s-1", {
			counts: [{ variantId: "v-1", counted: 3 }],
		});
		expect(again.results[0].delta).toBe(0);
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});

	it("refuses a variant from another shop", async () => {
		await expect(
			recordStockCount(seed(), U1, "s-1", {
				counts: [{ variantId: "v-2", counted: 1 }],
			}),
		).rejects.toMatchObject({ code: "generic.validation" });
	});
});

describe("reads", () => {
	it("lists movements newest first with labels", async () => {
		const payload = seed();
		await recordMovement(payload, U1, "v-1", { type: "receipt", quantity: 1 });
		await recordMovement(payload, U1, "v-1", { type: "loss", quantity: -1 });
		const page = await listMovements(payload, U1, "s-1", { type: "loss" });
		expect(page.docs).toHaveLength(1);
		expect(page.docs[0]).toMatchObject({
			type: "loss",
			variant: { id: "v-1", sku: "AT-APP2" },
		});
	});

	it("summarises cost value and alerts", async () => {
		const summary = await stockSummary(seed(1), U1, "s-1");
		expect(summary).toMatchObject({
			costValue: 78000,
			unitsOnHand: 1,
			unitsReserved: 0,
			trackedVariants: 1,
		});
		expect(summary.lowStock).toEqual([
			{
				variantId: "v-1",
				productId: "p-1",
				productTitle: "AirPods Pro",
				label: "",
				available: 1,
				threshold: 1,
			},
		]);
		expect(summary.outOfStock).toEqual([]);
	});
});

describe("reserved stock", () => {
	it("refuses a loss that would eat into reserved units", async () => {
		const payload = seed(3);
		variant(payload)!.stockReserved = 3;
		await expect(
			recordMovement(payload, U1, "v-1", { type: "loss", quantity: -3 }),
		).rejects.toMatchObject({ code: "stock.insufficient", status: 409 });
		expect(variant(payload)?.stockOnHand).toBe(3);
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});

	it("still allows a loss taken from the unreserved part", async () => {
		const payload = seed(5);
		variant(payload)!.stockReserved = 3;
		await recordMovement(payload, U1, "v-1", { type: "loss", quantity: -2 });
		expect(variant(payload)?.stockOnHand).toBe(3);
	});

	it("refuses a loss when units are reserved between the read and the write", async () => {
		const payload = seed(3);
		const updateOne = payload.db.updateOne;
		// An order reserves the whole shelf in the window the movement was decided in.
		payload.db.updateOne = async (args) => {
			variant(payload)!.stockReserved = 3;
			return updateOne(args);
		};
		await expect(
			recordMovement(payload, U1, "v-1", { type: "loss", quantity: -3 }),
		).rejects.toMatchObject({ code: "stock.insufficient" });
		expect(variant(payload)?.stockOnHand).toBe(3);
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});

	it("refuses a count that would drop below what is reserved", async () => {
		const payload = seed(4);
		variant(payload)!.stockReserved = 4;
		await expect(
			recordStockCount(payload, U1, "s-1", {
				counts: [{ variantId: "v-1", counted: 0 }],
			}),
		).rejects.toMatchObject({ code: "stock.insufficient" });
		expect(variant(payload)?.stockOnHand).toBe(4);
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});
});

describe("applyMovement", () => {
	const reqOf = (payload: ReturnType<typeof seed>) => ({
		payload,
		context: {},
		user: null,
	});

	it("refuses movement types that do not move on-hand stock", async () => {
		const payload = seed();
		const row = variant(payload)!;
		await expect(
			applyMovement(reqOf(payload), {
				variant: row,
				type: "reservation",
				quantity: -1,
				actorId: "u-1",
			}),
		).rejects.toMatchObject({ code: "generic.validation" });
		await expect(
			applyMovement(reqOf(payload), {
				variant: row,
				type: "release",
				quantity: 1,
				actorId: "u-1",
			}),
		).rejects.toMatchObject({ code: "generic.validation" });
		expect(variant(payload)?.stockOnHand).toBe(2);
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});

	it("reports a variant that disappeared under the conditional write", async () => {
		const payload = seed();
		const updateOne = payload.db.updateOne;
		payload.db.updateOne = async (args) => {
			payload.store["product-variants"] = payload.store[
				"product-variants"
			].filter((v) => v.id !== "v-1");
			return updateOne(args);
		};
		await expect(
			recordMovement(payload, U1, "v-1", { type: "receipt", quantity: 1 }),
		).rejects.toMatchObject({ code: "generic.notFound", status: 404 });
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});
});
