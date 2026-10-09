// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async () => undefined),
	hasPushCredential: vi.fn(async () => true),
}));
vi.mock("../../src/hooks/searchEvents", () => ({
	queueSearchEvent: vi.fn(async () => undefined),
}));

import { Couriers } from "../../src/collections/Couriers";
import { launchCitySeedRows } from "../../src/lib/launchCities";
import {
	defaultFeeOf,
	districtLabelOf,
	getMarketCities,
	getShopMarketCities,
	invalidateMarketCities,
	isMarketCityKey,
	isMarketDistrictKey,
} from "../../src/lib/marketCities";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import {
	parseDeliveryAddress,
	quoteCheckout,
} from "../../src/services/checkout";
import { createZone } from "../../src/services/delivery/zones";
import { fakePayload } from "./helpers/fakePayload";
import { runBeforeChange } from "./helpers/runBeforeChange";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const CM = "market-cm";
const GA = "market-ga";
const libreville = {
	id: "ga:libreville",
	market: GA,
	key: "libreville",
	label: "Libreville",
	defaultDeliveryFee: 1500,
	districts: [{ slug: "centre", label: "Centre" }],
	active: true,
	sortOrder: 0,
};
const cmRows = (patch: Record<string, Record<string, unknown>> = {}) =>
	launchCitySeedRows(CM).map((row) => ({ ...row, ...patch[row.key] }));

const rawAddress = (patch: Record<string, unknown> = {}) => ({
	recipientName: "Jean Mballa",
	phone: "+237670000001",
	city: "douala",
	district: "douala.akwa",
	landmark: "Pres de la pharmacie du carrefour",
	...patch,
});

describe("market cities reads", () => {
	it("serves the active rows of the market, sorted, accents intact", async () => {
		const payload = fakePayload({
			"market-cities": [
				...cmRows({ yaounde: { sortOrder: 0 }, douala: { sortOrder: 1 } }),
				{ ...libreville },
			],
		});
		const cities = await getMarketCities(payload, { id: CM });
		expect(cities.map((c) => c.key)).toEqual(["yaounde", "douala"]);
		expect(districtLabelOf(cities, "douala.deido")).toBe("Deïdo");
		expect(districtLabelOf(cities, "douala.other")).toBe("Autre");
		expect(districtLabelOf(cities, "douala.nowhere")).toBeNull();
		expect(defaultFeeOf(cities, "yaounde")).toBe(3500);
		expect(defaultFeeOf(cities, "libreville")).toBeNull();
	});

	it("omits a deactivated city", async () => {
		const payload = fakePayload({
			"market-cities": cmRows({ yaounde: { active: false } }),
		});
		const cities = await getMarketCities(payload, { id: CM });
		expect(cities.map((c) => c.key)).toEqual(["douala"]);
	});

	it("serves a cached list for 60 s until invalidated", async () => {
		const payload = fakePayload({ "market-cities": cmRows() });
		const first = await getMarketCities(payload, { id: CM });
		expect(first).toHaveLength(2);
		payload.store["market-cities"] = [];
		expect(await getMarketCities(payload, { id: CM })).toHaveLength(2);
		invalidateMarketCities(payload);
		expect(await getMarketCities(payload, { id: CM })).toHaveLength(0);
	});

	it("validates keys and district keys; {city}.other is implicit", async () => {
		const payload = fakePayload({ "market-cities": cmRows() });
		const cities = await getMarketCities(payload, { id: CM });
		expect(isMarketCityKey(cities, "douala")).toBe(true);
		expect(isMarketCityKey(cities, "libreville")).toBe(false);
		expect(isMarketDistrictKey(cities, "douala", "douala.akwa")).toBe(true);
		expect(isMarketDistrictKey(cities, "douala", "douala.other")).toBe(true);
		expect(isMarketDistrictKey(cities, "douala", "douala.nowhere")).toBe(false);
		expect(isMarketDistrictKey(cities, "douala", "yaounde.bastos")).toBe(false);
		expect(isMarketDistrictKey(cities, "libreville", "libreville.other")).toBe(
			false,
		);
	});

	it("resolves a shop's cities through its own city row", async () => {
		const payload = fakePayload({
			"market-cities": [...cmRows(), { ...libreville }],
		});
		const cities = await getShopMarketCities(payload, {
			id: "s",
			location: { city: "libreville" },
		});
		expect(cities.map((c) => c.key)).toEqual(["libreville"]);
		expect(
			await getShopMarketCities(payload, { id: "s", location: {} }),
		).toEqual([]);
	});
});

describe("checkout address validation", () => {
	const field = (fn: () => unknown) => {
		try {
			fn();
			return null;
		} catch (error) {
			return (error as { details?: { field?: string } }).details?.field;
		}
	};
	const cm = launchCitySeedRows(CM);

	it("accepts a market district and the implicit other", () => {
		expect(
			field(() => parseDeliveryAddress(rawAddress(), "seller_delivery", cm)),
		).toBeNull();
		expect(
			field(() =>
				parseDeliveryAddress(
					rawAddress({
						district: "douala.other",
						districtOther: "Pres du pont",
					}),
					"seller_delivery",
					cm,
				),
			),
		).toBeNull();
	});

	it("refuses a district outside the rows and a city outside the market", () => {
		expect(
			field(() =>
				parseDeliveryAddress(
					rawAddress({ district: "douala.nowhere" }),
					"seller_delivery",
					cm,
				),
			),
		).toBe("delivery.district");
		expect(
			field(() =>
				parseDeliveryAddress(
					rawAddress({ city: "libreville", district: "libreville.centre" }),
					"seller_delivery",
					cm,
				),
			),
		).toBe("delivery.city");
	});
});

describe("quoteCheckout against the shop's market", () => {
	beforeEach(() => {
		process.env.ORDER_PHONE_PEPPER = "pepper";
	});
	afterEach(() => {
		process.env.ORDER_PHONE_PEPPER = undefined;
	});

	const world = (cities: object[]) =>
		fakePayload(
			{
				users: [
					{
						id: "u-buyer",
						name: "Buyer",
						phone: "+237670000001",
						phoneVerifiedAt: NOW.toISOString(),
					},
					{ id: "u-owner", name: "Owner" },
				],
				shops: [
					{
						id: "s-1",
						name: "Chez Awa",
						handle: "chez-awa",
						owner: "u-owner",
						status: "active",
						level: 1,
						location: { city: "douala" },
						contact: { phone: "+237690000000" },
						orderSettings: {
							codEnabled: true,
							sellerDeliveryEnabled: true,
							deliveryFee: null,
							deliveryEtaText: "24-48h",
							pickupEnabled: false,
						},
					},
				],
				products: [
					{
						id: "p-1",
						shop: "s-1",
						title: "AirPods",
						status: "active",
						delivery: { codAllowed: true },
						returnPolicy: "30 jours",
					},
				],
				listings: [
					{
						id: "l-1",
						title: "AirPods Pro",
						status: "published",
						shop: "s-1",
						product: "p-1",
						condition: "new",
						category: "cat-1",
					},
				],
				"product-variants": [
					{
						id: "v-1",
						product: "p-1",
						shop: "s-1",
						sku: "AP-1",
						price: 10_000,
						trackInventory: true,
						stockOnHand: 5,
						stockReserved: 0,
						archivedAt: null,
					},
				],
				categories: [{ id: "cat-1", name: "Audio" }],
				"shop-members": [
					{
						id: "sm-1",
						shop: "s-1",
						user: "u-owner",
						status: "active",
						role: "owner",
					},
				],
				carts: [
					{
						id: "c-1",
						user: "u-buyer",
						status: "active",
						items: [
							{
								id: "i-1",
								listing: "l-1",
								product: "p-1",
								variant: "v-1",
								shop: "s-1",
								quantity: 1,
								priceAtAdd: 10_000,
								addedAt: NOW.toISOString(),
							},
						],
					},
				],
				orders: [],
				"order-items": [],
				"market-cities": cities,
			},
			{
				globals: {
					"app-settings": {
						orders: {
							enabled: true,
							launchCities: [
								{ key: "douala", deliveryFee: 2000 },
								{ key: "yaounde", deliveryFee: 3500 },
							],
							termsVersion: "2026-09",
							pilotShopIds: [],
						},
					},
				},
			},
		);

	const quote = (payload: ReturnType<typeof world>, address: object) =>
		quoteCheckout(
			payload,
			{ id: "u-buyer" },
			{
				address,
				deliveryOptionId: "seller_delivery:douala",
				paymentMethod: "cod",
				locale: "fr",
			},
			{ now: NOW, store: new MemoryCounterStore() },
		);

	it("accepts douala.akwa and douala.other, refuses douala.nowhere", async () => {
		const payload = world(cmRows());
		await expect(quote(payload, rawAddress())).resolves.toBeDefined();
		await expect(
			quote(
				payload,
				rawAddress({ district: "douala.other", districtOther: "Pres du pont" }),
			),
		).resolves.toBeDefined();
		await expect(
			quote(payload, rawAddress({ district: "douala.nowhere" })),
		).rejects.toMatchObject({ code: "checkout.addressInvalid" });
	});

	it("refuses a city of another market, not just an unknown one", async () => {
		const payload = world([...cmRows(), { ...libreville }]);
		await expect(
			quote(
				payload,
				rawAddress({ city: "libreville", district: "libreville.centre" }),
			),
		).rejects.toMatchObject({ code: "checkout.addressInvalid" });
	});

	it("refuses a deactivated city for new orders and leaves a stored order alone", async () => {
		const payload = world(cmRows({ yaounde: { active: false } }));
		payload.store.orders.push({
			id: "o-1",
			delivery: { city: "yaounde", district: "yaounde.bastos" },
		});
		await expect(
			quote(
				payload,
				rawAddress({ city: "yaounde", district: "yaounde.bastos" }),
			),
		).rejects.toMatchObject({ code: "checkout.addressInvalid" });
		expect(payload.store.orders[0].delivery).toEqual({
			city: "yaounde",
			district: "yaounde.bastos",
		});
	});
});

describe("zone and courier saves", () => {
	const owner = { id: "owner-1", role: "user" };
	const shop = {
		id: "shop-1",
		owner: owner.id,
		status: "active",
		level: 2,
		location: { city: "douala" },
	};
	const member = {
		id: "m-1",
		shop: shop.id,
		user: owner.id,
		role: "owner",
		status: "active",
	};
	const zone = (patch: Record<string, unknown> = {}) => ({
		name: "Douala centre",
		scope: "same_city",
		city: "douala",
		districts: ["douala.akwa"],
		method: "seller_delivery",
		fee: 1500,
		etaMinHours: 24,
		etaMaxHours: 72,
		deliveryDays: ["mon"],
		...patch,
	});

	it("refuses a zone naming a city or district outside its market's rows", async () => {
		const payload = fakePayload({
			shops: [shop],
			"shop-members": [member],
			"market-cities": [...cmRows(), { ...libreville }],
		});
		await expect(
			createZone(
				payload,
				owner,
				shop.id,
				zone({ city: "libreville", districts: [] }),
			),
		).rejects.toMatchObject({ code: "delivery.zoneInvalid" });
		await expect(
			createZone(
				payload,
				owner,
				shop.id,
				zone({ districts: ["douala.nowhere"] }),
			),
		).rejects.toMatchObject({ code: "delivery.zoneInvalid" });
		await expect(
			createZone(payload, owner, shop.id, zone()),
		).resolves.toBeDefined();
	});

	const courier = (data: Record<string, unknown>, rows: object[]) =>
		runBeforeChange(Couriers, {
			data,
			operation: "create",
			req: { payload: fakePayload({ "market-cities": rows }) },
		});

	it("refuses a courier whose cities are not all in one market's rows", async () => {
		const rows = [...cmRows(), { ...libreville }];
		await expect(
			courier({ cities: ["douala", "yaounde"] }, rows),
		).resolves.toBeDefined();
		await expect(
			courier({ cities: ["douala", "libreville"] }, rows),
		).rejects.toThrow(/market/i);
		await expect(
			courier(
				{ cities: ["douala"], tariffs: [{ city: "libreville", amount: 1 }] },
				rows,
			),
		).rejects.toThrow(/market/i);
	});
});
