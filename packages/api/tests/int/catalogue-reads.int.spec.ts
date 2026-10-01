// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getProductDetail, listCatalogue } from "../../src/services/catalogue";
import { getMyShop } from "../../src/services/shops";
import { fakePayload } from "./helpers/fakePayload";

const U1 = { id: "u-1" };

function seed() {
	return fakePayload({
		users: [
			{
				id: "u-1",
				name: "Aïcha",
				createdAt: "2024-03-01T00:00:00.000Z",
				rating: 4.8,
				totalReviews: 126,
			},
			{ id: "u-2", name: "Other" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwatech",
				name: "Akwa Tech",
				owner: "u-1",
				status: "active",
				level: 2,
				handleChangedAt: "2026-09-10T00:00:00.000Z",
				publishedListingCount: 1,
			},
		],
		"shop-members": [
			{ id: "m-1", shop: "s-1", user: "u-1", role: "owner", status: "active" },
			{ id: "m-2", shop: "s-1", user: "u-3", role: "staff", status: "active" },
		],
		products: [
			{
				id: "p-1",
				// Shaped like a depth-populated relation, the way a real Payload
				// read would return it: a leak here means the fix stopped shaping
				// the response and started handing the raw document back.
				shop: {
					id: "s-1",
					status: "active",
					suspendedNote: "Reported for counterfeit goods",
					suspendedBy: "u-mod",
				},
				title: "iPhone 13 Pro",
				status: "active",
				listing: "l-1",
				images: [{ image: { id: "m-1", url: "/m1.jpg" } }],
				updatedAt: "2026-09-15T10:00:00.000Z",
			},
			{
				id: "p-2",
				shop: "s-1",
				title: "AirPods Pro",
				status: "active",
				listing: null,
				images: [],
				updatedAt: "2026-09-14T10:00:00.000Z",
			},
			{
				id: "p-3",
				shop: "s-1",
				title: "Apple Watch SE",
				status: "draft",
				listing: null,
				images: [],
				updatedAt: "2026-09-13T10:00:00.000Z",
			},
		],
		"product-variants": [
			{
				id: "v-1",
				product: "p-1",
				shop: "s-1",
				optionValues: { Couleur: "Graphite" },
				sku: "AT-IP13P-GR",
				price: 285000,
				cost: 238000,
				trackInventory: true,
				stockOnHand: 4,
				stockReserved: 0,
				lowStockThreshold: 2,
			},
			{
				id: "v-2",
				product: "p-1",
				shop: "s-1",
				optionValues: { Couleur: "Or" },
				sku: "AT-IP13P-OR",
				price: 330000,
				cost: 276000,
				trackInventory: true,
				stockOnHand: 2,
				stockReserved: 0,
				lowStockThreshold: 1,
			},
			{
				id: "v-3",
				product: "p-2",
				shop: "s-1",
				optionValues: {},
				sku: "AT-APP2",
				price: 95000,
				cost: 78000,
				trackInventory: true,
				stockOnHand: 2,
				stockReserved: 0,
				lowStockThreshold: 3,
			},
			{
				id: "v-4",
				product: "p-3",
				shop: "s-1",
				optionValues: {},
				sku: null,
				price: 140000,
				trackInventory: true,
				stockOnHand: 0,
				stockReserved: 0,
				lowStockThreshold: null,
			},
		],
		listings: [
			{
				id: "l-1",
				status: "published",
				views: 184,
				shop: "s-1",
				product: "p-1",
				seller: "u-1",
			},
			{ id: "l-9", status: "published", seller: "u-1", shop: null },
			{ id: "l-10", status: "draft", seller: "u-1" },
			{ id: "l-11", status: "sold", seller: "u-1" },
		],
		favorites: [{ id: "f-1", listing: "l-1", user: "u-2" }],
		"stock-movements": [
			{
				id: "sm-1",
				variant: "v-1",
				product: "p-1",
				shop: "s-1",
				type: "receipt",
				quantity: 4,
				unitCost: 200000,
				stockAfter: 4,
				actor: "u-1",
				createdAt: "2026-09-12T09:15:00.000Z",
			},
		],
	});
}

const NOW = new Date("2026-09-15T12:00:00.000Z");

describe("getMyShop", () => {
	it("returns nulls for a user without a shop", async () => {
		expect(await getMyShop(seed(), { id: "u-2" }, NOW)).toEqual({
			shop: null,
			role: null,
			counts: null,
		});
	});

	it("summarises the caller's shop", async () => {
		const result = await getMyShop(seed(), U1, NOW);
		expect(result.role).toBe("owner");
		expect(result.shop).toMatchObject({
			handle: "akwatech",
			status: "active",
			nextHandleChangeAt: "2026-10-10T00:00:00.000Z",
			suspension: null,
		});
		expect(result.counts).toEqual({
			activeProducts: 2,
			draftProducts: 1,
			lowStockVariants: 1,
			lowStockSample: "AirPods Pro",
			personalListings: 2,
		});
	});

	it("ignores a closed shop", async () => {
		const payload = seed();
		payload.store.shops[0].status = "closed";
		expect((await getMyShop(payload, U1, NOW)).shop).toBeNull();
	});
});

describe("listCatalogue", () => {
	it("builds rows with price range and stock, newest first", async () => {
		const page = await listCatalogue(seed(), U1, "s-1", {});
		expect(page.counts).toEqual({
			all: 3,
			active: 2,
			draft: 1,
			archived: 0,
			low: 1,
			out: 1,
		});
		expect(page.docs[0]).toMatchObject({
			id: "p-1",
			variantCount: 2,
			priceMin: 285000,
			priceMax: 330000,
			stockOnHand: 6,
			available: 6,
			lowStock: false,
			outOfStock: false,
			sku: "AT-IP13P-GR",
			listingId: "l-1",
			listingStatus: "published",
			image: { url: "/m1.jpg" },
		});
	});

	it("filters by stock state, status and text", async () => {
		const payload = seed();
		expect(
			(await listCatalogue(payload, U1, "s-1", { stock: "low" })).docs.map(
				(r) => r.id,
			),
		).toEqual(["p-2"]);
		expect(
			(await listCatalogue(payload, U1, "s-1", { stock: "out" })).docs.map(
				(r) => r.id,
			),
		).toEqual(["p-3"]);
		expect(
			(await listCatalogue(payload, U1, "s-1", { status: "draft" })).docs.map(
				(r) => r.id,
			),
		).toEqual(["p-3"]);
		expect(
			(await listCatalogue(payload, U1, "s-1", { q: "app2" })).docs.map(
				(r) => r.id,
			),
		).toEqual(["p-2"]);
	});

	it("refuses non-members", async () => {
		await expect(
			listCatalogue(seed(), { id: "u-2" }, "s-1", {}),
		).rejects.toMatchObject({ code: "shop.notMember" });
	});
});

describe("getProductDetail", () => {
	it("returns variants with costs, listing stats and recent movements", async () => {
		const detail = await getProductDetail(seed(), U1, "p-1");
		expect(detail.variants.map((v) => v.cost)).toEqual([238000, 276000]);
		expect(detail.variants.map((v) => v.lowStockThreshold)).toEqual([2, 1]);
		expect(detail.listing).toEqual({
			id: "l-1",
			status: "published",
			views: 184,
			favorites: 1,
		});
		expect(detail.movements).toHaveLength(1);
		expect(detail.movements[0].unitCost).toBe(200000);
		expect(detail.role).toBe("owner");
	});

	it("reports an unknown product as not found", async () => {
		await expect(getProductDetail(seed(), U1, "nope")).rejects.toMatchObject({
			status: 404,
		});
	});

	it("hides cost and the low-stock threshold from a staff member", async () => {
		const detail = await getProductDetail(seed(), { id: "u-3" }, "p-1");
		expect(detail.role).toBe("staff");
		for (const variant of detail.variants) {
			expect(Object.hasOwn(variant, "cost")).toBe(false);
			expect(Object.hasOwn(variant, "lowStockThreshold")).toBe(false);
		}
	});

	it("hides the movements' unit cost from a staff member", async () => {
		const detail = await getProductDetail(seed(), { id: "u-3" }, "p-1");
		expect(detail.movements).toHaveLength(1);
		expect(detail.movements[0].unitCost).toBeNull();
	});

	it("never serves the shop's suspension details through the product", async () => {
		const detail = await getProductDetail(seed(), U1, "p-1");
		expect(detail.product).not.toHaveProperty("shop");
		expect(JSON.stringify(detail.product)).not.toContain(
			"Reported for counterfeit goods",
		);
		expect(JSON.stringify(detail.product)).not.toContain("u-mod");
	});

	it("refuses a non-member entirely", async () => {
		await expect(
			getProductDetail(seed(), { id: "u-2" }, "p-1"),
		).rejects.toMatchObject({ code: "shop.notMember" });
	});
});
