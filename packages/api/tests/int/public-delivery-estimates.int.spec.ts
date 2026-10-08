import { describe, expect, it, vi } from "vitest";
import type { DeliveryEstimateCache } from "../../src/lib/delivery/estimateCache";
import { publicDeliveryEstimates } from "../../src/services/delivery/publicEstimates";
import { fakePayload } from "./helpers/fakePayload";

function seed() {
	return fakePayload(
		{
			listings: [
				{
					id: "listing",
					status: "published",
					shop: "storefront",
					price: 2000,
					resale: { supplierShop: "supplier" },
				},
			],
			shops: [
				{ id: "storefront", location: { city: "yaounde" } },
				{
					id: "supplier",
					location: { city: "douala" },
					orderSettings: { sellerDeliveryEnabled: true, deliveryFee: 1500 },
				},
			],
			"delivery-zones": [
				{
					id: "zone",
					shop: "supplier",
					city: "douala",
					scope: "same_city",
					method: "seller_delivery",
					active: true,
					codAllowed: true,
					fee: 1500,
					etaMinHours: 4,
					etaMaxHours: 8,
					districts: [],
					deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
				},
			],
		},
		{
			globals: {
				"app-settings": {
					orders: { enabled: true },
					delivery: { zonesEnabled: true },
				},
			},
		},
	);
}

describe("public delivery estimates", () => {
	it("reports only the cheapest pickup with that location's preparation time", async () => {
		const payload = seed();
		const openingHours = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(
			(day) => ({ day, opens: "08:00", closes: "18:00" }),
		);
		payload.store["shop-locations"] = [
			{
				id: "fast",
				shop: "supplier",
				city: "douala",
				active: true,
				pickupEnabled: true,
				gps: { lat: 4, lng: 9 },
				landmark: "Fast",
				pickupFee: 500,
				preparationHours: 2,
				openingHours,
			},
			{
				id: "cheap",
				shop: "supplier",
				city: "douala",
				active: true,
				pickupEnabled: true,
				gps: { lat: 4, lng: 9 },
				landmark: "Cheap",
				pickupFee: 200,
				preparationHours: 5,
				openingHours,
			},
		];
		expect(await publicDeliveryEstimates(payload, "listing", {})).toEqual({
			perMethod: [
				{
					method: "seller_delivery",
					cheapestFee: 1500,
					etaMinHours: 4,
					etaMaxHours: 8,
				},
				{ method: "pickup", cheapestFee: 200, etaMinHours: 5, etaMaxHours: 5 },
			],
		});
	});
	it("ignores cache content that does not match the public response contract", async () => {
		const cache: DeliveryEstimateCache = {
			get: async () =>
				JSON.stringify({ perMethod: [{ method: "train", cheapestFee: -1 }] }),
			set: vi.fn(async () => undefined),
		};
		const result = await publicDeliveryEstimates(
			seed(),
			"listing",
			{},
			undefined,
			cache,
		);
		expect(result).toEqual({
			perMethod: [
				{
					method: "seller_delivery",
					cheapestFee: 1500,
					etaMinHours: 4,
					etaMaxHours: 8,
				},
			],
		});
		expect(cache.set).toHaveBeenCalledWith(
			expect.any(String),
			JSON.stringify(result),
			300,
		);
	});
	it("keeps zone estimates hidden while their feature is disabled", async () => {
		const payload = seed();
		payload.globals["app-settings"] = {
			orders: { enabled: true },
			delivery: { zonesEnabled: false },
		};
		expect(await publicDeliveryEstimates(payload, "listing", {})).toEqual({
			perMethod: [],
		});
	});
	it("caches for five minutes and invalidates zone and location revisions", async () => {
		const payload = seed();
		const entries = new Map<string, string>();
		const cache: DeliveryEstimateCache = {
			get: vi.fn(async (key) => entries.get(key) ?? null),
			set: vi.fn(async (key, value) => {
				entries.set(key, value);
			}),
		};
		const first = await publicDeliveryEstimates(
			payload,
			"listing",
			{},
			undefined,
			cache,
		);
		expect(
			await publicDeliveryEstimates(payload, "listing", {}, undefined, cache),
		).toEqual(first);
		expect(cache.set).toHaveBeenCalledTimes(1);
		expect(cache.set).toHaveBeenCalledWith(
			expect.any(String),
			JSON.stringify(first),
			300,
		);
		payload.store["delivery-zones"][0].fee = 2100;
		payload.store["delivery-zones"][0].updatedAt = "2026-10-06T12:00:00.000Z";
		expect(
			await publicDeliveryEstimates(payload, "listing", {}, undefined, cache),
		).toEqual({
			perMethod: [
				{
					method: "seller_delivery",
					cheapestFee: 2100,
					etaMinHours: 4,
					etaMaxHours: 8,
				},
			],
		});
		payload.store["shop-locations"] = [
			{
				id: "origin",
				shop: "supplier",
				active: false,
				updatedAt: "2026-10-06T13:00:00.000Z",
			},
		];
		await publicDeliveryEstimates(payload, "listing", {}, undefined, cache);
		expect(cache.set).toHaveBeenCalledTimes(3);
	});
	it("does not share price-dependent free delivery across listings", async () => {
		const payload = seed();
		payload.store["delivery-zones"][0].freeAboveSubtotal = 5000;
		payload.store.listings.push({
			...payload.store.listings[0],
			id: "expensive",
			price: 6000,
		});
		const entries = new Map<string, string>();
		const cache: DeliveryEstimateCache = {
			get: async (key) => entries.get(key) ?? null,
			set: async (key, value) => {
				entries.set(key, value);
			},
		};
		expect(
			(await publicDeliveryEstimates(payload, "listing", {}, undefined, cache))
				.perMethod[0]?.cheapestFee,
		).toBe(1500);
		expect(
			(
				await publicDeliveryEstimates(
					payload,
					"expensive",
					{},
					undefined,
					cache,
				)
			).perMethod[0]?.cheapestFee,
		).toBe(0);
	});
	it("computes a fresh estimate when the optional cache is unavailable", async () => {
		const cache: DeliveryEstimateCache = {
			get: async () => {
				throw new Error("Offline");
			},
			set: async () => {
				throw new Error("Offline");
			},
		};
		expect(
			await publicDeliveryEstimates(seed(), "listing", {}, undefined, cache),
		).toEqual({
			perMethod: [
				{
					method: "seller_delivery",
					cheapestFee: 1500,
					etaMinHours: 4,
					etaMaxHours: 8,
				},
			],
		});
	});
	it("quotes the fulfilling supplier rather than the reseller storefront", async () => {
		const payload = seed();
		const find = vi.spyOn(payload, "find");
		expect(await publicDeliveryEstimates(payload, "listing", {})).toEqual({
			perMethod: [
				{
					method: "seller_delivery",
					cheapestFee: 1500,
					etaMinHours: 4,
					etaMaxHours: 8,
				},
			],
		});
		expect(find).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "listings",
				overrideAccess: false,
			}),
		);
	});
	it("uses the authenticated viewer location as the default destination", async () => {
		expect(
			await publicDeliveryEstimates(seed(), "listing", {}, { city: "yaounde" }),
		).toEqual({ perMethod: [] });
	});
	it("returns not found for an inaccessible listing, not its delivery information", async () => {
		const payload = seed();
		payload.store.listings = [];
		await expect(
			publicDeliveryEstimates(payload, "listing", {}),
		).rejects.toMatchObject({ status: 404 });
	});
});
