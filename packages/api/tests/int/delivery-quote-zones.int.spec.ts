import { describe, expect, it } from "vitest";
import { getOrderSettings } from "../../src/lib/orderSettings";
import { quoteDelivery } from "../../src/services/deliveryQuote";
import { fakePayload } from "./helpers/fakePayload";

const now = new Date("2026-10-05T09:00:00.000Z");
const zone = {
	id: "city",
	shop: "supplier",
	name: "City",
	scope: "same_city",
	city: "douala",
	districts: [],
	method: "seller_delivery",
	fee: 1500,
	freeAboveSubtotal: 10_000,
	etaMinHours: 4,
	etaMaxHours: 8,
	deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
	active: true,
	codAllowed: true,
	updatedAt: "2026-10-01T00:00:00.000Z",
};
async function quote(
	overrides: {
		subtotal?: number;
		paymentMethod?: "cod" | "mobile_money";
		city?: string;
		district?: string;
		zones?: Record<string, unknown>[];
		locations?: Record<string, unknown>[];
		couriers?: Record<string, unknown>[];
		intercity?: boolean;
		zonesEnabled?: boolean;
	} = {},
) {
	const payload = fakePayload(
		{
			"delivery-zones": overrides.zones ?? [zone],
			"shop-locations": overrides.locations ?? [],
			couriers: overrides.couriers ?? [],
		},
		{
			globals: {
				"app-settings": {
					delivery: {
						zonesEnabled: overrides.zonesEnabled ?? true,
						intercityEnabled: overrides.intercity ?? false,
						couriersEnabled: true,
					},
				},
			},
		},
	);
	return quoteDelivery({
		payload,
		shop: {
			id: "supplier",
			location: { city: "douala" },
			orderSettings: { sellerDeliveryEnabled: true, deliveryFee: 2300 },
		},
		items: [
			{
				variantId: "v",
				quantity: 1,
				lineSubtotal: overrides.subtotal ?? 10_000,
				codAllowed: true,
			},
		],
		subtotal: overrides.subtotal ?? 10_000,
		destination: {
			city: overrides.city ?? "douala",
			district: overrides.district,
			gps: { lat: 4, lng: 9 },
		},
		settings: await getOrderSettings(payload),
		paymentMethod: overrides.paymentMethod ?? "cod",
		now,
	});
}
describe("zone delivery quotes", () => {
	it("includes the public courier identity and its actual COD eligibility", async () => {
		const result = await quote({
			paymentMethod: "mobile_money",
			zones: [{ ...zone, method: "courier", courier: "partner" }],
			couriers: [
				{
					id: "partner",
					name: "Delivery Partner",
					provider: "manual",
					status: "active",
					cities: ["douala"],
					scopes: ["same_city"],
					supportsCod: false,
				},
			],
		});
		expect(result.options).toHaveLength(1);
		expect(result.options[0]).toMatchObject({
			method: "courier",
			courier: { id: "partner", name: "Delivery Partner" },
			codAllowed: false,
		});
	});
	it("returns the pickup distance and complete fee snapshot", async () => {
		const result = await quote({
			locations: [
				{
					id: "pickup",
					shop: "supplier",
					city: "douala",
					active: true,
					pickupEnabled: true,
					gps: { lat: 4, lng: 9 },
					landmark: "Entrance",
					preparationHours: 1,
					pickupFee: 500,
					openingHours: [{ day: "mon", opens: "08:00", closes: "18:00" }],
				},
			],
		});
		expect(
			result.options.filter((option) => option.method === "pickup"),
		).toEqual([
			expect.objectContaining({
				originalFee: 500,
				freeApplied: false,
				pickupPoint: {
					address: null,
					landmark: "Entrance",
					gps: { lat: 4, lng: 9 },
					hours: null,
					distanceMeters: 0,
				},
			}),
		]);
	});
	it("keeps the legacy flat quote while zones are disabled", async () => {
		expect(await quote({ zonesEnabled: false })).toMatchObject({
			options: [{ optionId: "seller_delivery:douala", fee: 2300 }],
			unavailable: [],
		});
	});
	it("uses the supplier zone and applies free delivery at the exact threshold", async () => {
		expect(await quote()).toMatchObject({
			options: [
				{
					optionId: "zone:city",
					zoneId: "city",
					fee: 0,
					freeApplied: true,
					originalFee: 1500,
					promisedBy: "2026-10-05T17:00:00.000Z",
				},
			],
			unavailable: [],
		});
		expect((await quote({ subtotal: 9999 })).options[0]?.fee).toBe(1500);
	});
	it("uses a whole-city fallback for a named district without an override", async () => {
		expect(
			(await quote({ district: "douala.akwa" })).options.map(
				(option) => option.zoneId,
			),
		).toEqual(["city"]);
	});
	it("gives a district-specific zone priority over the whole-city fallback", async () => {
		expect(
			(
				await quote({
					district: "douala.akwa",
					zones: [
						zone,
						{
							...zone,
							id: "district",
							districts: [{ key: "douala.akwa" }],
							fee: 700,
							freeAboveSubtotal: null,
						},
					],
				})
			).options.map((option) => ({ id: option.zoneId, fee: option.fee })),
		).toEqual([{ id: "district", fee: 700 }]);
	});
	it("reports the minimum subtotal instead of offering an unusable method", async () => {
		expect(
			await quote({
				subtotal: 4999,
				zones: [{ ...zone, minOrderSubtotal: 5000 }],
			}),
		).toEqual({
			options: [],
			unavailable: [
				{
					method: "seller_delivery",
					reason: "below_minimum",
					minOrderSubtotal: 5000,
				},
			],
		});
	});
	it("filters intercity COD at quote time but allows protected payment", async () => {
		const params = {
			intercity: true,
			city: "yaounde",
			zones: [{ ...zone, scope: "intercity", destinationCities: ["yaounde"] }],
		};
		expect(await quote(params)).toEqual({
			options: [],
			unavailable: [{ method: "seller_delivery", reason: "cod_not_allowed" }],
		});
		expect(
			(await quote({ ...params, paymentMethod: "mobile_money" })).options.map(
				(option) => option.zoneId,
			),
		).toEqual(["city"]);
		expect(
			(
				await quote({
					...params,
					intercity: false,
					paymentMethod: "mobile_money",
				})
			).options,
		).toEqual([]);
	});
	it("moves COD-disabled zones to unavailable without blocking protected payment", async () => {
		const zones = [{ ...zone, codAllowed: false }];
		expect(await quote({ zones })).toEqual({
			options: [],
			unavailable: [{ method: "seller_delivery", reason: "cod_not_allowed" }],
		});
		expect(
			(await quote({ zones, paymentMethod: "mobile_money" })).options,
		).toHaveLength(1);
	});
});
