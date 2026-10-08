// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CourierWebhookEvent } from "../../src/lib/delivery/types";
import { withTransaction } from "../../src/lib/transactions";
import { applyCourierEvent } from "../../src/services/delivery/webhooks";
import { fakePayload } from "./helpers/fakePayload";

describe("courier webhook application", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("holds premature delivery, then applies pickup and a later delivery in order", async () => {
		vi.stubEnv("ORDER_PHONE_PEPPER", "delivery-webhook-test-pepper");
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "shipped",
					paymentMethod: "mobile_money",
					paymentStatus: "paid",
					delivery: { phone: "+237600000001", method: "courier" },
					amounts: { total: 1000 },
					handover: {},
					timestamps: {},
					deadlines: {},
				},
			],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-1",
					method: "courier",
					carrier: "courier",
					provider: "yango",
					providerShipmentId: "provider-1",
					status: "pending",
					fee: 0,
					origin: {},
					destination: {},
				},
			],
		});
		const event: CourierWebhookEvent = {
			reference: "SHP-1",
			providerShipmentId: "provider-1",
			providerStatus: "delivered",
			status: "delivered",
			occurredAt: new Date("2026-10-04T12:00:00.000Z"),
			providerEventId: "evt-1",
			type: "shipment.delivered",
		};

		const result = await withTransaction(payload, (req) =>
			applyCourierEvent(req, "yango", event),
		);

		expect(result).toEqual({ outcome: "stored_without_transition" });
		expect(payload.store.shipments?.[0]).toMatchObject({
			status: "pending",
			providerStatus: {
				providerStatus: "delivered",
				status: "delivered",
				providerEventId: "evt-1",
			},
		});
		expect(payload.store["shipment-events"]).toMatchObject([
			{ type: "shipment.provider_status", providerEventId: "evt-1" },
		]);
		const replay = await withTransaction(payload, (req) =>
			applyCourierEvent(req, "yango", event),
		);
		expect(replay).toEqual({ outcome: "duplicate" });
		expect(payload.store["shipment-events"]).toHaveLength(1);

		const pickedUp: CourierWebhookEvent = {
			...event,
			providerStatus: "picked_up",
			status: "picked_up",
			occurredAt: new Date("2026-10-04T12:01:00.000Z"),
			providerEventId: "evt-picked-up",
			type: "shipment.picked_up",
		};
		const pickupResult = await withTransaction(payload, (req) =>
			applyCourierEvent(req, "yango", pickedUp),
		);
		expect(pickupResult).toEqual({ outcome: "applied" });
		expect(payload.store.shipments?.[0]?.status).toBe("picked_up");

		const laterDelivery: CourierWebhookEvent = {
			...event,
			occurredAt: new Date("2026-10-04T12:02:00.000Z"),
			providerEventId: "evt-later-delivery",
			proof: { recipientName: "Awa" },
		};
		const deliveryResult = await withTransaction(payload, (req) =>
			applyCourierEvent(req, "yango", laterDelivery),
		);
		expect(deliveryResult).toEqual({ outcome: "applied" });
		expect(payload.store.shipments?.[0]?.status).toBe("delivered");
		expect(payload.store.orders?.[0]?.status).toBe("delivered");
	});

	it("records an out-of-order event without moving the provider snapshot backward", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "shipped",
					paymentMethod: "mobile_money",
					paymentStatus: "paid",
				},
			],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-1",
					method: "courier",
					carrier: "courier",
					provider: "yango",
					providerShipmentId: "provider-1",
					status: "picked_up",
					providerStatus: {
						providerStatus: "picked_up",
						status: "picked_up",
						occurredAt: "2026-10-04T12:00:00.000Z",
						providerEventId: "evt-picked-up",
					},
					fee: 0,
					origin: {},
					destination: {},
				},
			],
			"shipment-events": [
				{
					id: "event-1",
					shipment: "shipment-1",
					order: "order-1",
					type: "shipment.picked_up",
					actorType: "courier_webhook",
					providerEventId: "evt-picked-up",
					visibility: "both",
					occurredAt: "2026-10-04T12:00:00.000Z",
				},
			],
		});
		const staleEvent: CourierWebhookEvent = {
			reference: "SHP-1",
			providerShipmentId: "provider-1",
			providerStatus: "in_transit",
			status: "in_transit",
			occurredAt: new Date("2026-10-04T11:59:00.000Z"),
			providerEventId: "evt-stale",
			type: "shipment.in_transit",
		};

		const result = await withTransaction(payload, (req) =>
			applyCourierEvent(req, "yango", staleEvent),
		);

		expect(result).toEqual({ outcome: "out_of_order" });
		expect(payload.store.shipments?.[0]).toMatchObject({
			status: "picked_up",
			providerStatus: { providerEventId: "evt-picked-up", status: "picked_up" },
		});
		expect(payload.store["shipment-events"]).toHaveLength(2);
		expect(payload.store["shipment-events"]?.[1]).toMatchObject({
			type: "shipment.provider_status",
			providerEventId: "evt-stale",
		});
	});

	it("delivers the P4 order as carrier_pod and opens the contest window", async () => {
		vi.stubEnv("ORDER_PHONE_PEPPER", "delivery-webhook-test-pepper");
		vi.useFakeTimers();
		const now = new Date("2026-10-04T12:00:00.000Z");
		vi.setSystemTime(now);
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "shipped",
					paymentMethod: "mobile_money",
					paymentStatus: "paid",
					delivery: { phone: "+237600000001", method: "courier" },
					amounts: { total: 1000 },
					handover: {},
					timestamps: {},
					deadlines: {},
				},
			],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-1",
					method: "courier",
					carrier: "courier",
					provider: "yango",
					providerShipmentId: "provider-1",
					status: "in_transit",
					fee: 0,
					origin: {},
					destination: {},
				},
			],
		});
		const delivered: CourierWebhookEvent = {
			reference: "SHP-1",
			providerShipmentId: "provider-1",
			providerStatus: "delivered",
			status: "delivered",
			occurredAt: now,
			providerEventId: "evt-delivered",
			type: "shipment.delivered",
			proof: { podUrl: "https://carrier.example/pod/1", recipientName: "Awa" },
		};

		const result = await withTransaction(payload, (req) =>
			applyCourierEvent(req, "yango", delivered),
		);

		const order = payload.store.orders?.[0];
		const handover = order?.handover;
		const contestBy =
			handover &&
			typeof handover === "object" &&
			"contestBy" in handover &&
			typeof handover.contestBy === "string"
				? Date.parse(handover.contestBy)
				: Number.NaN;
		expect(result).toEqual({ outcome: "applied" });
		expect(order).toMatchObject({
			status: "delivered",
			handover: { method: "carrier_pod" },
		});
		expect(contestBy).toBe(now.getTime() + 48 * 60 * 60 * 1000);
		expect(payload.store.shipments?.[0]).toMatchObject({
			status: "delivered",
			proof: {
				handoverMethod: "carrier_pod",
				providerPodUrl: "https://carrier.example/pod/1",
				recipientName: "Awa",
			},
			flags: ["delivered_without_code"],
		});
	});

	it("stores an unmapped provider status without moving the shipment", async () => {
		const payload = fakePayload({
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-1",
					method: "courier",
					carrier: "courier",
					provider: "yango",
					providerShipmentId: "provider-1",
					status: "in_transit",
					fee: 0,
					origin: {},
					destination: {},
				},
			],
		});
		const unmapped: CourierWebhookEvent = {
			reference: "SHP-1",
			providerShipmentId: "provider-1",
			providerStatus: "provider-added-state",
			status: null,
			occurredAt: new Date("2026-10-04T12:00:00.000Z"),
			providerEventId: "evt-unmapped",
			type: "shipment.provider-added-state",
		};

		const result = await withTransaction(payload, (req) =>
			applyCourierEvent(req, "yango", unmapped),
		);

		expect(result).toEqual({ outcome: "stored_without_transition" });
		expect(payload.store.shipments?.[0]).toMatchObject({
			status: "in_transit",
			providerStatus: {
				providerStatus: "provider-added-state",
				status: null,
				providerEventId: "evt-unmapped",
			},
		});
	});

	it("folds courier rider, failed-attempt, and COD snapshots into the shipment", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "shipped",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: { phone: "+237600000001", method: "courier" },
					amounts: { total: 1000 },
				},
			],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-1",
					method: "courier",
					carrier: "courier",
					provider: "yango",
					providerShipmentId: "provider-1",
					status: "in_transit",
					fee: 0,
					origin: {},
					destination: {},
				},
			],
		});
		const failed: CourierWebhookEvent = {
			reference: "SHP-1",
			providerShipmentId: "provider-1",
			providerStatus: "attempt_failed",
			status: "failed",
			occurredAt: new Date("2026-10-04T12:00:00.000Z"),
			providerEventId: "evt-failed",
			type: "shipment.attempt_failed",
			rider: { name: "Moto Rider", phone: "+237699000001", vehicle: "Moto" },
			attempt: { reason: "absent", note: "No one answered" },
			codCollectedAmount: 0,
		};

		const result = await withTransaction(payload, (req) =>
			applyCourierEvent(req, "yango", failed),
		);

		expect(result).toEqual({ outcome: "applied" });
		expect(payload.store.shipments?.[0]).toMatchObject({
			status: "failed",
			rider: { name: "Moto Rider", phone: "+237699000001", vehicle: "Moto" },
			attempts: [
				{
					number: 1,
					outcome: "failed",
					reason: "absent",
					note: "No one answered",
					actorType: "courier_webhook",
				},
			],
			codCollection: {
				collectedAmount: 0,
				collectedBy: "courier",
				remittanceStatus: "pending",
			},
		});
	});
});
