// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	cityKey,
	medianHours,
	minRetailPriceChangedAt,
	reachableWindow,
} from "../../src/contracts/resale";
import { listResaleCatalogue } from "../../src/services/resaleCatalogue";
import {
	decideResaleLink,
	listResaleLinks,
} from "../../src/services/resaleLinks";
import {
	refreshSupplierResaleStats,
	responseDurationMs,
	shipDurationMs,
} from "../../src/services/resaleMaintenance";
import { listResoldListings } from "../../src/services/resaleResold";
import { fakePayload } from "./helpers/fakePayload";

const HOUR = 3_600_000;
const NOW = new Date("2026-10-16T12:00:00.000Z");

describe("resale stats rules", () => {
	it("takes the median in hours and stays silent below three observations", () => {
		expect(medianHours([])).toBeNull();
		expect(medianHours([HOUR, 2 * HOUR])).toBeNull();
		expect(medianHours([30 * HOUR, 10 * HOUR, 19 * HOUR])).toBe(19);
		expect(medianHours([10 * HOUR, 20 * HOUR, 30 * HOUR, 40 * HOUR])).toBe(25);
		expect(medianHours([-HOUR, Number.NaN, HOUR, 2 * HOUR])).toBeNull();
	});

	it("matches cities whatever the case or accents", () => {
		expect(cityKey(" Douala ")).toBe(cityKey("douala"));
		expect(cityKey("Yaoundé")).toBe(cityKey("yaounde"));
		expect(cityKey(null)).toBe("");
	});

	it("moves the minimum's date only when the minimum changes", () => {
		const previous = {
			minRetailPrice: 3000,
			minRetailPriceChangedAt: "2026-09-14T08:00:00.000Z",
		};
		expect(minRetailPriceChangedAt(previous, 3000, NOW)).toBe(
			"2026-09-14T08:00:00.000Z",
		);
		expect(minRetailPriceChangedAt(previous, 3500, NOW)).toBe(
			NOW.toISOString(),
		);
		expect(minRetailPriceChangedAt({ minRetailPrice: 3000 }, 3000, NOW)).toBe(
			null,
		);
		expect(minRetailPriceChangedAt({}, 3000, NOW)).toBe(NOW.toISOString());
	});

	it("spans the earliest opening and latest closing, ignoring broken rows", () => {
		expect(reachableWindow([])).toBeNull();
		expect(
			reachableWindow([
				{ opens: "09:00", closes: "17:00" },
				{ opens: "08:00", closes: "12:00" },
				{ opens: "14:00", closes: "18:00" },
				{ opens: "19:00", closes: "07:00" },
				{ opens: "8h", closes: "20:00" },
			]),
		).toEqual({ from: "08:00", to: "18:00" });
	});

	it("measures shipping from creation to the first shipped entry", () => {
		expect(
			shipDurationMs({
				createdAt: "2026-10-01T08:00:00.000Z",
				statusHistory: [
					{
						status: "accepted",
						source: "test",
						at: "2026-10-01T09:00:00.000Z",
					},
					{
						status: "shipped",
						source: "test",
						at: "2026-10-02T03:00:00.000Z",
					},
				],
			}),
		).toBe(19 * HOUR);
		expect(
			shipDurationMs({
				createdAt: "2026-10-01T08:00:00.000Z",
				statusHistory: [],
			}),
		).toBeNull();
	});

	it("measures response time from the latest request", () => {
		expect(
			responseDurationMs({
				createdAt: "2026-08-01T08:00:00.000Z",
				resellerTermsAcceptedAt: "2026-10-01T08:00:00.000Z",
				respondedAt: "2026-10-03T08:00:00.000Z",
			}),
		).toBe(48 * HOUR);
		expect(
			responseDurationMs({
				createdAt: "2026-10-01T08:00:00.000Z",
				respondedAt: null,
			}),
		).toBeNull();
	});
});

function shipped(
	id: string,
	supplier: string,
	createdAt: string,
	hours: number,
) {
	return {
		id,
		supplierShop: supplier,
		resellerShop: "reseller-shop",
		status: "shipped",
		items: [],
		createdAt,
		statusHistory: [
			{ status: "sent", at: createdAt },
			{
				status: "shipped",
				at: new Date(Date.parse(createdAt) + hours * HOUR).toISOString(),
			},
		],
	};
}

function responded(id: string, supplier: string, at: string, hours: number) {
	return {
		id,
		supplierShop: supplier,
		resellerShop: `reseller-${id}`,
		status: "approved",
		createdAt: "2026-01-01T00:00:00.000Z",
		resellerTermsAcceptedAt: at,
		respondedAt: new Date(Date.parse(at) + hours * HOUR).toISOString(),
	};
}

describe("refreshSupplierResaleStats", () => {
	it("stores each supplier's medians over 90 days and clears a stale record", async () => {
		const payload = fakePayload({
			shops: [
				{ id: "busy", name: "Busy", status: "active" },
				{ id: "quiet", name: "Quiet", status: "active" },
				{
					id: "stale",
					name: "Stale",
					status: "active",
					resaleStats: {
						medianShipHours: 12,
						medianResponseHours: 5,
						computedAt: "2026-06-01T00:00:00.000Z",
					},
				},
			],
			"purchase-orders": [
				shipped("po-1", "busy", "2026-10-01T08:00:00.000Z", 10),
				shipped("po-2", "busy", "2026-10-02T08:00:00.000Z", 19),
				shipped("po-3", "busy", "2026-10-03T08:00:00.000Z", 30),
				// Outside the 90-day window: ignored.
				shipped("po-old", "busy", "2026-06-01T08:00:00.000Z", 500),
				shipped("po-4", "quiet", "2026-10-01T08:00:00.000Z", 5),
				{
					id: "po-unshipped",
					supplierShop: "busy",
					status: "accepted",
					items: [],
					createdAt: "2026-10-05T08:00:00.000Z",
					statusHistory: [{ status: "sent", at: "2026-10-05T08:00:00.000Z" }],
				},
			],
			"resale-links": [
				responded("l-1", "busy", "2026-09-01T00:00:00.000Z", 24),
				responded("l-2", "busy", "2026-09-02T00:00:00.000Z", 48),
				responded("l-3", "busy", "2026-09-03T00:00:00.000Z", 72),
				responded("l-4", "quiet", "2026-09-03T00:00:00.000Z", 1),
				{
					id: "l-pending",
					supplierShop: "busy",
					resellerShop: "x",
					status: "requested",
					createdAt: "2026-10-01T00:00:00.000Z",
				},
			],
		});

		const updated = await refreshSupplierResaleStats(payload, NOW);

		const shop = (id: string) =>
			payload.store.shops?.find((row) => row.id === id) as {
				resaleStats?: Record<string, unknown>;
			};
		expect(shop("busy").resaleStats).toEqual({
			medianShipHours: 19,
			medianResponseHours: 48,
			computedAt: NOW.toISOString(),
		});
		// One observation each: below the minimum sample, nothing recorded.
		expect(shop("quiet").resaleStats).toBeUndefined();
		expect(shop("stale").resaleStats).toEqual({
			medianShipHours: null,
			medianResponseHours: null,
			computedAt: NOW.toISOString(),
		});
		expect(updated).toBe(2);
		expect(await refreshSupplierResaleStats(payload, NOW)).toBe(0);
	});
});

describe("supplier response time on link decisions", () => {
	function world(status: "requested" | "approved") {
		return fakePayload({
			shops: [
				{ id: "supplier", owner: "supplier-owner", status: "active", level: 3 },
				{ id: "reseller", owner: "reseller-owner", status: "active", level: 2 },
			],
			"shop-members": [
				{
					id: "m",
					shop: "supplier",
					user: "supplier-owner",
					role: "owner",
					status: "active",
				},
			],
			"resale-links": [
				{
					id: "link-1",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status,
					riskHold: false,
				},
			],
		});
	}

	it("stamps respondedAt on approval and refusal", async () => {
		for (const action of ["approve", "decline"] as const) {
			const payload = world("requested");
			const link = await decideResaleLink(
				payload,
				{ id: "supplier-owner" },
				"link-1",
				{ action },
				{ now: NOW },
			);
			expect(link.respondedAt).toBe(NOW.toISOString());
		}
	});

	it("does not treat a later suspension as a response", async () => {
		const payload = world("approved");
		const link = await decideResaleLink(
			payload,
			{ id: "supplier-owner" },
			"link-1",
			{ action: "suspend", reason: "quality" },
			{ now: NOW },
		);
		expect(link.respondedAt).toBeUndefined();
	});
});

describe("supplier stats on the reseller's supplier cards", () => {
	it("shows the supplier's medians to the reseller and nothing on the supplier side", async () => {
		const payload = fakePayload({
			shops: [
				{
					id: "supplier",
					name: "Supplier",
					owner: "supplier-owner",
					status: "active",
					level: 3,
					resaleStats: {
						medianShipHours: 19,
						medianResponseHours: null,
						computedAt: NOW.toISOString(),
					},
				},
				{
					id: "reseller",
					name: "Reseller",
					owner: "reseller-owner",
					status: "active",
					level: 2,
				},
			],
			"shop-members": [
				{
					id: "s",
					shop: "supplier",
					user: "supplier-owner",
					role: "owner",
					status: "active",
				},
				{
					id: "r",
					shop: "reseller",
					user: "reseller-owner",
					role: "owner",
					status: "active",
				},
			],
			"resale-links": [
				{
					id: "link-1",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status: "approved",
				},
			],
		});
		const resellerSide = await listResaleLinks(
			payload,
			{ id: "reseller-owner" },
			"reseller",
			{ side: "reseller" },
		);
		expect(resellerSide.docs[0]?.partnerShop.resaleStats).toEqual({
			medianShipHours: 19,
			medianResponseHours: null,
		});
		const supplierSide = await listResaleLinks(
			payload,
			{ id: "supplier-owner" },
			"supplier",
			{ side: "supplier" },
		);
		expect(supplierSide.docs[0]?.partnerShop).not.toHaveProperty("resaleStats");
	});
});

function catalogueWorld() {
	return fakePayload(
		{
			users: [{ id: "reseller-user", role: "user" }],
			shops: [
				{
					id: "reseller-shop",
					owner: "reseller-user",
					name: "Reseller",
					status: "active",
					level: 2,
				},
				{
					id: "douala-supplier",
					owner: "s1",
					name: "Mboppi",
					status: "active",
					level: 3,
					location: { city: "Douala" },
					resaleStats: { medianShipHours: 19, medianResponseHours: 30 },
				},
				{
					id: "yaounde-supplier",
					owner: "s2",
					name: "Mokolo",
					status: "active",
					level: 3,
					location: { city: "yaoundé" },
				},
			],
			"shop-members": [
				{
					id: "reseller-member",
					shop: "reseller-shop",
					user: "reseller-user",
					role: "owner",
					status: "active",
				},
			],
			"resale-terms": [
				{
					id: "terms",
					role: "reseller",
					version: "2026-10-01",
					publishedAt: "2026-10-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [
				{
					id: "acceptance",
					shop: "reseller-shop",
					role: "reseller",
					version: "2026-10-01",
				},
			],
			categories: [
				{ id: "accessories", name: "Accessories" },
				{ id: "cables", name: "Cables", parent: "accessories" },
				{ id: "phones", name: "Phones" },
			],
			media: [
				{
					id: "media-1",
					url: "/media/cable.jpg",
					thumbnailURL: "/media/cable-thumb.jpg",
				},
				{ id: "media-2", url: "/media/phone.jpg" },
			],
			products: [
				{
					id: "cable",
					shop: "douala-supplier",
					title: "Cable",
					category: "cables",
					status: "active",
					images: [{ image: "media-1" }, { image: "media-2" }],
					resale: { enabled: true },
				},
				{
					id: "phone",
					shop: "yaounde-supplier",
					title: "Phone",
					category: "phones",
					status: "active",
					images: [{ image: "media-2" }],
					resale: { enabled: true },
				},
			],
			"product-variants": [
				{
					id: "cable-v",
					product: "cable",
					shop: "douala-supplier",
					price: 3000,
					resale: {
						enabled: true,
						supplierPrice: 1500,
						minRetailPrice: 3000,
						minRetailPriceChangedAt: "2026-09-14T08:00:00.000Z",
						suggestedRetailPrice: 3500,
					},
				},
				{
					id: "phone-v",
					product: "phone",
					shop: "yaounde-supplier",
					price: 50000,
					resale: {
						enabled: true,
						supplierPrice: 40000,
						minRetailPrice: 45000,
						suggestedRetailPrice: 52000,
					},
				},
			],
		},
		{ globals: { "app-settings": { resale: { enabled: true } } } },
	);
}

describe("resale catalogue filters and data", () => {
	const user = { id: "reseller-user", role: "user" as const };

	it("filters a parent category through its subcategories", async () => {
		const result = await listResaleCatalogue(
			catalogueWorld(),
			user,
			"reseller-shop",
			{ categoryId: "accessories" },
		);
		expect(result.products.map((product) => product.productId)).toEqual([
			"cable",
		]);
	});

	it("filters by the supplier's city and lists the cities on offer", async () => {
		const result = await listResaleCatalogue(
			catalogueWorld(),
			user,
			"reseller-shop",
			{ shipsFromCity: "YAOUNDE" },
		);
		expect(result.products.map((product) => product.productId)).toEqual([
			"phone",
		]);
		expect(result.shipsFromCities).toEqual(["Douala", "yaoundé"]);
	});

	it("loads the first image small, the minimum's date and the supplier's track record", async () => {
		const result = await listResaleCatalogue(
			catalogueWorld(),
			user,
			"reseller-shop",
		);
		const cable = result.products.find((p) => p.productId === "cable");
		const phone = result.products.find((p) => p.productId === "phone");
		expect(cable).toMatchObject({
			imageUrl: "/media/cable-thumb.jpg",
			shipsFromCity: "Douala",
			supplier: {
				resaleStats: { medianShipHours: 19, medianResponseHours: 30 },
			},
		});
		expect(cable?.variants[0]?.minRetailPriceChangedAt).toBe(
			"2026-09-14T08:00:00.000Z",
		);
		expect(phone?.imageUrl).toBe("/media/phone.jpg");
		expect(phone?.variants[0]?.minRetailPriceChangedAt).toBeNull();
		expect(phone?.supplier.resaleStats).toEqual({
			medianShipHours: null,
			medianResponseHours: null,
		});
	});
});

describe("resold table data", () => {
	it("carries each listing's thumbnail and the minimum's date", async () => {
		const payload = fakePayload(
			{
				shops: [
					{ id: "reseller", owner: "r", status: "active", level: 2 },
					{ id: "supplier", name: "Supplier", status: "active", level: 3 },
				],
				"shop-members": [
					{
						id: "m",
						shop: "reseller",
						user: "r",
						role: "owner",
						status: "active",
					},
				],
				media: [{ id: "media-1", url: "/media/a.jpg", thumbnailURL: null }],
				listings: [
					{
						id: "listing-1",
						shop: "reseller",
						product: "product-1",
						title: "Cable",
						status: "published",
						images: [{ image: "media-1" }],
						resale: {
							supplierShop: "supplier",
							holds: [],
							prices: [{ variant: "variant-1", price: 3200 }],
						},
					},
				],
				"product-variants": [
					{
						id: "variant-1",
						product: "product-1",
						resale: {
							supplierPrice: 1500,
							minRetailPrice: 3000,
							minRetailPriceChangedAt: "2026-09-14T08:00:00.000Z",
						},
					},
				],
			},
			{ globals: { "app-settings": { resale: { enabled: true } } } },
		);
		const result = await listResoldListings(payload, { id: "r" }, "reseller");
		expect(result.listings[0]).toMatchObject({
			imageUrl: "/media/a.jpg",
			variants: [{ minRetailPriceChangedAt: "2026-09-14T08:00:00.000Z" }],
		});
	});
});
