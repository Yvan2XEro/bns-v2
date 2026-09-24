// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listPublicVariants } from "../../src/services/catalogue";
import { fakePayload } from "./helpers/fakePayload";

/**
 * `listPublicVariants` is the buyer-facing twin of `GET /api/product-variants`:
 * it takes no caller identity at all, so — unlike the collection's own
 * `shopScopedRead`, which deliberately unions in a shop member's own draft and
 * archived rows for the seller's stock picker — it can never widen for a
 * signed-in shop owner browsing their own product's public listing page. Every
 * viewer of that page, owner included, sees the same catalogue.
 */
const seed = () =>
	fakePayload({
		products: [
			{ id: "p-1", shop: "s-1", title: "Live", status: "active" },
			{ id: "p-2", shop: "s-1", title: "Draft", status: "draft" },
		],
		"product-variants": [
			{
				id: "v-1",
				product: { id: "p-1", status: "active" },
				shop: "s-1",
				optionValues: { Couleur: "Noir" },
				price: 10000,
				cost: 6000,
				trackInventory: true,
				stockOnHand: 3,
				stockReserved: 1,
			},
			{
				id: "v-2",
				product: { id: "p-1", status: "active" },
				shop: "s-1",
				optionValues: { Couleur: "Blanc" },
				price: 12000,
				trackInventory: true,
				stockOnHand: 1,
				stockReserved: 1,
				archivedAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "v-3",
				product: { id: "p-1", status: "active" },
				shop: "s-1",
				optionValues: {},
				price: 9000,
				trackInventory: false,
			},
			{
				id: "v-4",
				product: { id: "p-2", status: "draft" },
				shop: "s-1",
				optionValues: {},
				price: 5000,
				trackInventory: true,
				stockOnHand: 5,
			},
		],
	});

describe("listPublicVariants", () => {
	it("returns only the live variants of a published product", async () => {
		const { docs } = await listPublicVariants(seed(), "p-1");
		expect(docs.map((d) => d.id)).toEqual(["v-1", "v-3"]);
	});

	it("never includes a draft product's variants, regardless of who owns it", async () => {
		const { docs } = await listPublicVariants(seed(), "p-2");
		expect(docs).toEqual([]);
	});

	it("carries a buyer-safe shape: no cost, no raw stock counters", async () => {
		const { docs } = await listPublicVariants(seed(), "p-1");
		const v1 = docs.find((d) => d.id === "v-1");
		expect(v1).toEqual({
			id: "v-1",
			optionValues: { Couleur: "Noir" },
			price: 10000,
			trackInventory: true,
			available: true,
		});
		expect(v1).not.toHaveProperty("cost");
		expect(v1).not.toHaveProperty("stockOnHand");
		expect(v1).not.toHaveProperty("stockReserved");
	});

	it("derives availability from stock on hand minus reservations", async () => {
		const { docs } = await listPublicVariants(seed(), "p-2");
		expect(docs).toEqual([]);

		const payload = seed();
		payload.store.products.push({
			id: "p-3",
			shop: "s-1",
			title: "OutOfStock",
			status: "active",
		});
		payload.store["product-variants"].push({
			id: "v-5",
			product: { id: "p-3", status: "active" },
			shop: "s-1",
			optionValues: {},
			price: 7000,
			trackInventory: true,
			stockOnHand: 1,
			stockReserved: 1,
		});
		const { docs: outOfStock } = await listPublicVariants(payload, "p-3");
		expect(outOfStock).toEqual([
			{
				id: "v-5",
				optionValues: {},
				price: 7000,
				trackInventory: true,
				available: false,
			},
		]);
	});

	it("is untracked-inventory means always available", async () => {
		const { docs } = await listPublicVariants(seed(), "p-1");
		expect(docs.find((d) => d.id === "v-3")?.available).toBe(true);
	});
});
