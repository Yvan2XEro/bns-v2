import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";
import { migrateP4DeliveryData } from "../../src/migrations/p7DeliveryData";

const { notifySettingsIncompleteMock, queueSearchEventMock } = vi.hoisted(
	() => ({
		notifySettingsIncompleteMock: vi.fn(async () => undefined),
		queueSearchEventMock: vi.fn(async () => undefined),
	}),
);
vi.mock("../../src/hooks/searchEvents", () => ({
	queueSearchEvent: queueSearchEventMock,
}));
vi.mock("../../src/services/delivery/notifications", () => ({
	notifyDeliverySettingsIncomplete: notifySettingsIncompleteMock,
}));

import { type Doc, fakePayload } from "./helpers/fakePayload";

const shop = (id: string, orderSettings: Doc): Doc => ({
	id,
	owner: "owner-1",
	location: { city: "douala" },
	orderSettings,
});

describe("P4 to P7 delivery migration", () => {
	it("repairs the order relationship when a prior run stopped after shipment creation", async () => {
		const api = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-100",
					status: "shipped",
					shop: "shop-1",
					delivery: { method: "seller_delivery" },
					amounts: {},
					timestamps: { shippedAt: "2026-10-01T10:00:00.000Z" },
					shipments: [],
				},
			],
			shipments: [
				{
					id: "shipment-1",
					order: "order-1",
					status: "in_transit",
					metadata: { migratedFrom: "p4" },
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					quantity: 1,
				},
			],
		});

		await migrateP4DeliveryData(api as unknown as Payload);

		expect(api.store.orders[0].shipments).toEqual(["shipment-1"]);
		expect(api.store.shipments).toHaveLength(1);
	});

	it("migrates legacy delivery data once and preserves fee and attempt facts", async () => {
		const api = fakePayload(
			{
				shops: [
					shop("shop-override", {
						codEnabled: true,
						sellerDeliveryEnabled: true,
						deliveryFee: 2_000,
					}),
					shop("shop-default", {
						codEnabled: true,
						sellerDeliveryEnabled: true,
					}),
					shop("shop-pickup", {
						pickupEnabled: true,
						pickupPoint: {
							address: "Rue 1",
							landmark: "Near the market",
							gps: { lat: 4.05, lng: 9.7 },
							hours: "Mon-Sat, 08:00-18:00",
						},
					}),
					shop("shop-no-option", {
						codEnabled: true,
						sellerDeliveryEnabled: false,
					}),
				],
				orders: [
					{
						id: "order-delivery",
						status: "shipped",
						shop: "shop-override",
						paymentMethod: "cod",
						amounts: { deliveryFee: 2_000, total: 12_000 },
						delivery: {
							method: "seller_delivery",
							city: "yaounde",
							district: "douala.akwa",
							landmark: "Near the market",
							phone: "+237600000000",
							recipientName: "Buyer",
							fee: 2_000,
						},
						timestamps: { shippedAt: "2026-10-01T10:00:00.000Z" },
					},
					{
						id: "order-pickup",
						status: "shipped",
						shop: "shop-pickup",
						paymentMethod: "cod",
						amounts: { deliveryFee: 0, total: 10_000 },
						delivery: {
							method: "pickup",
							city: "douala",
							phone: "+237600000000",
							recipientName: "Buyer",
							fee: 0,
						},
						timestamps: { shippedAt: "2026-10-02T10:00:00.000Z" },
					},
				],
				"order-items": [
					{
						id: "item-1",
						order: "order-delivery",
						fulfillingShop: "shop-override",
						quantity: 2,
					},
					{
						id: "item-2",
						order: "order-pickup",
						fulfillingShop: "shop-pickup",
						quantity: 1,
					},
				],
				"order-events": [
					{
						id: "attempt-1",
						order: "order-delivery",
						type: "order.delivery_attempt_failed",
						reason: "absent",
						createdAt: "2026-10-01T11:00:00.000Z",
					},
					{
						id: "attempt-2",
						order: "order-delivery",
						type: "order.delivery_attempt_failed",
						reason: "timeout",
						createdAt: "2026-10-01T12:00:00.000Z",
					},
				],
			},
			{
				globals: {
					"app-settings": {
						orders: { launchCities: [{ key: "douala", deliveryFee: 1_500 }] },
					},
				},
			},
		);
		const payload = api as unknown as Payload;

		await migrateP4DeliveryData(payload);
		const firstCounts = {
			zones: api.store["delivery-zones"]?.length ?? 0,
			locations: api.store["shop-locations"]?.length ?? 0,
			shipments: api.store.shipments?.length ?? 0,
		};
		await migrateP4DeliveryData(payload);

		expect(firstCounts).toEqual({ zones: 2, locations: 1, shipments: 2 });
		expect({
			zones: api.store["delivery-zones"]?.length ?? 0,
			locations: api.store["shop-locations"]?.length ?? 0,
			shipments: api.store.shipments?.length ?? 0,
		}).toEqual(firstCounts);
		expect(api.store["delivery-zones"]?.map((row) => row.fee)).toEqual([
			2_000, 1_500,
		]);
		expect(api.store.shipments?.[0]).toMatchObject({
			status: "in_transit",
			origin: {
				id: null,
				city: "douala",
				address: null,
				district: null,
				landmark: null,
				gps: null,
			},
			attempts: [
				{ number: 1, outcome: "failed", reason: "absent" },
				{ number: 2, outcome: "failed", reason: "other" },
			],
			metadata: { migratedFrom: "p4" },
		});
		const pickupLocation = api.store["shop-locations"]?.find(
			(row) => row.shop === "shop-pickup",
		);
		expect(api.store.shipments?.[1]).toMatchObject({
			status: "pending",
			readyForPickupAt: "2026-10-02T10:00:00.000Z",
			origin: {
				id: pickupLocation?.id,
				city: "douala",
				address: "Rue 1",
				landmark: "Near the market",
				gps: { lat: 4.05, lng: 9.7 },
			},
			pickupLocation: pickupLocation?.id,
		});
		expect(api.store["shop-locations"]?.[0]).toMatchObject({
			pickupEnabled: true,
			isDispatchOrigin: true,
			isDefaultOrigin: true,
			district: "douala.other",
			openingHoursNote: "Mon-Sat, 08:00-18:00",
		});
		expect(queueSearchEventMock).toHaveBeenCalledWith(
			undefined,
			"shop.updated",
			"shop-pickup",
			{ reindexListings: true },
		);
		expect(queueSearchEventMock).toHaveBeenCalledTimes(4);
		expect(notifySettingsIncompleteMock).toHaveBeenNthCalledWith(
			1,
			"owner-1",
			"shop-pickup",
			{ needsStructuredPickupHours: true, noActiveOption: false },
		);
		expect(notifySettingsIncompleteMock).toHaveBeenNthCalledWith(
			2,
			"owner-1",
			"shop-no-option",
			{ needsStructuredPickupHours: false, noActiveOption: true },
		);
		expect(notifySettingsIncompleteMock).toHaveBeenCalledTimes(2);
		expect(
			api.store.shops?.find((row) => row.id === "shop-pickup")
				?.deliveryMigrationNoticeSentAt,
		).toEqual(expect.any(String));
		expect(
			api.store.shops?.find((row) => row.id === "shop-no-option")
				?.deliveryMigrationNoticeSentAt,
		).toEqual(expect.any(String));
	});
});
