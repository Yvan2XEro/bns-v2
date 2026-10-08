// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
	SHIPMENT_STATUSES,
	type ShipmentStatus,
} from "../../src/lib/delivery/types";
import { withTransaction } from "../../src/lib/transactions";
import type { Shipment } from "../../src/payload-types";
import { createShipmentForOrder } from "../../src/services/delivery/shipments";
import {
	applyShipmentTransition,
	assertShipmentTransition,
	isFinalShipmentFailure,
	SHIPMENT_TRANSITIONS,
	type ShipmentEventInput,
} from "../../src/services/delivery/shipmentTransitions";
import { fakePayload } from "./helpers/fakePayload";

function getHandoverSentAt(order: unknown): unknown {
	if (!order || typeof order !== "object" || !("handover" in order)) {
		return undefined;
	}
	const handover = order.handover;
	if (!handover || typeof handover !== "object" || !("sentAt" in handover)) {
		return undefined;
	}
	return handover.sentAt;
}

vi.mock("../../src/services/smsProvider", () => ({
	sendSms: vi.fn(async () => ({ sent: true })),
}));

const shipment: Shipment = {
	id: "shipment-1",
	shipmentNumber: "SHP-1",
	order: "order-1",
	storefrontShop: "shop-1",
	fulfillingShop: "shop-1",
	method: "seller_delivery",
	carrier: "self",
	origin: null,
	destination: null,
	fee: 0,
	status: "pending",
	createdAt: "2026-10-04T10:00:00.000Z",
	updatedAt: "2026-10-04T10:00:00.000Z",
};

const expected: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
	pending: ["picked_up", "in_transit", "delivered", "failed", "cancelled"],
	picked_up: ["in_transit", "delivered", "failed", "cancelled"],
	in_transit: ["delivered", "failed", "cancelled"],
	delivered: [],
	failed: ["in_transit", "returned"],
	returned: [],
	cancelled: [],
};

describe("shipment transitions", () => {
	it("ships an accepted order once and does not reissue handover on redelivery", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					shop: "shop-1",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: {
						method: "seller_delivery",
						recipientName: "Aicha",
						phone: "+237600000099",
						city: "douala",
					},
					amounts: { total: 10000 },
					timestamps: { acceptedAt: "2026-10-04T10:00:00.000Z" },
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					product: "product-1",
					variant: "variant-1",
					fulfillingShop: "shop-1",
					unitPrice: 10000,
					quantity: 1,
					fulfillmentStatus: "unfulfilled",
				},
			],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-1",
					method: "seller_delivery",
					carrier: "self",
					origin: {},
					destination: {},
					fee: 0,
					status: "pending",
				},
			],
		});
		const firstEvent: ShipmentEventInput = {
			type: "shipment.in_transit",
			actorType: "seller",
			visibility: "both",
			occurredAt: "2026-10-04T12:00:00.000Z",
		};

		await withTransaction(payload, (req) =>
			applyShipmentTransition(req, shipment, "in_transit", firstEvent),
		);
		const orderAfterShip = payload.store.orders?.[0];
		const handoverSentAt = getHandoverSentAt(orderAfterShip);

		expect(orderAfterShip?.status).toBe("shipped");
		expect(payload.store["order-items"]?.[0]?.fulfillmentStatus).toBe(
			"shipped",
		);
		expect(typeof handoverSentAt).toBe("string");
		expect(
			payload.store["order-events"]?.filter(
				(row) => row.type === "order.handover_code_sent",
			),
		).toHaveLength(1);

		const failedShipment: Shipment = {
			...shipment,
			status: "failed",
			redelivery: { rescheduleBy: "2099-01-01T00:00:00.000Z" },
		};
		const row = payload.store.shipments?.[0];
		if (row) row.status = "failed";
		await withTransaction(payload, (req) =>
			applyShipmentTransition(req, failedShipment, "in_transit", {
				type: "shipment.redelivery_started",
				actorType: "seller",
				visibility: "both",
				occurredAt: "2026-10-05T12:00:00.000Z",
			}),
		);

		expect(payload.store.orders?.[0]?.status).toBe("shipped");
		expect(getHandoverSentAt(payload.store.orders?.[0])).toBe(handoverSentAt);
		expect(
			payload.store["order-events"]?.filter(
				(row) => row.type === "order.handover_code_sent",
			),
		).toHaveLength(1);
	});

	it("matches the delivery state machine exactly", () => {
		expect(SHIPMENT_TRANSITIONS).toEqual(expected);
		for (const from of SHIPMENT_STATUSES) {
			for (const to of SHIPMENT_STATUSES) {
				if (expected[from].includes(to)) {
					expect(() => assertShipmentTransition(from, to)).not.toThrow();
				} else {
					try {
						assertShipmentTransition(from, to);
						throw new Error(`unexpected transition: ${from} -> ${to}`);
					} catch (error) {
						expect(error).toMatchObject({
							code: "shipment.invalidTransition",
						});
					}
				}
			}
		}
	});

	it("writes the conditional status change and its event in one transaction", async () => {
		const payload = fakePayload({
			orders: [{ id: "order-1", status: "shipped" }],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					status: "pending",
				},
			],
		});
		const event: ShipmentEventInput = {
			type: "shipment.in_transit",
			actorType: "seller",
			visibility: "both",
			occurredAt: "2026-10-04T12:00:00.000Z",
		};

		await withTransaction(payload, (req) =>
			applyShipmentTransition(req, shipment, "in_transit", event),
		);

		expect(payload.store.shipments?.[0]?.status).toBe("in_transit");
		expect(payload.store["shipment-events"]).toMatchObject([
			{
				type: "shipment.in_transit",
				statusFrom: "pending",
				statusTo: "in_transit",
			},
		]);
		expect(
			new Set(payload.writes.map((write) => write.transactionID)).size,
		).toBe(1);
	});

	it("rejects secret metadata before it writes either document", async () => {
		const payload = fakePayload({
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					status: "pending",
				},
			],
		});
		const event: ShipmentEventInput = {
			type: "shipment.in_transit",
			actorType: "seller",
			visibility: "both",
			occurredAt: "2026-10-04T12:00:00.000Z",
			metadata: { codeHash: "must-not-be-persisted" },
		};

		await expect(
			withTransaction(payload, (req) =>
				applyShipmentTransition(req, shipment, "in_transit", event),
			),
		).rejects.toMatchObject({ code: "generic.badRequest" });
		expect(payload.store.shipments?.[0]?.status).toBe("pending");
		expect(payload.store["shipment-events"] ?? []).toHaveLength(0);
	});

	it("rejects an event whose type does not describe the requested status", async () => {
		const payload = fakePayload({
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					status: "pending",
				},
			],
		});
		const event: ShipmentEventInput = {
			type: "shipment.cancelled",
			actorType: "seller",
			visibility: "both",
			occurredAt: "2026-10-04T12:00:00.000Z",
		};

		await expect(
			withTransaction(payload, (req) =>
				applyShipmentTransition(req, shipment, "in_transit", event),
			),
		).rejects.toMatchObject({ code: "shipment.invalidTransition" });
		expect(payload.store.shipments?.[0]?.status).toBe("pending");
		expect(payload.store["shipment-events"] ?? []).toHaveLength(0);
	});

	it("lets one concurrent writer win and gives the loser the current status", async () => {
		const payload = fakePayload({
			orders: [{ id: "order-1", status: "shipped" }],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					status: "pending",
				},
			],
		});
		const courierShipment: Shipment = { ...shipment, carrier: "courier" };
		const event = (type: ShipmentEventInput["type"]): ShipmentEventInput => ({
			type,
			actorType: type === "shipment.cancelled" ? "system" : "courier_webhook",
			visibility: "both",
			occurredAt: "2026-10-04T12:00:00.000Z",
		});
		const [first, second] = await Promise.allSettled([
			withTransaction(payload, (req) =>
				applyShipmentTransition(
					req,
					courierShipment,
					"picked_up",
					event("shipment.picked_up"),
				),
			),
			withTransaction(payload, (req) =>
				applyShipmentTransition(
					req,
					courierShipment,
					"cancelled",
					event("shipment.cancelled"),
				),
			),
		]);

		expect([first.status, second.status].sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
		expect(payload.store["shipment-events"]).toHaveLength(1);
		const loser = first.status === "rejected" ? first : second;
		if (loser.status !== "rejected")
			throw new Error("expected one losing writer");
		expect(loser.reason).toMatchObject({
			code: "shipment.invalidTransition",
			details: { status: payload.store.shipments?.[0]?.status },
		});
	});

	it("reports the final attempt reasons, attempt limit and reschedule deadline", () => {
		expect(
			isFinalShipmentFailure(
				{
					attempts: [
						{
							number: 1,
							outcome: "failed",
							reason: "refused",
							actorType: "seller",
							at: "",
						},
					],
				},
				2,
				new Date("2026-10-04T12:00:00.000Z"),
			),
		).toBe(true);
		expect(
			isFinalShipmentFailure(
				{
					attempts: [
						{
							number: 1,
							outcome: "failed",
							reason: "absent",
							actorType: "seller",
							at: "",
						},
					],
					redelivery: { rescheduleBy: "2026-10-04T12:00:01.000Z" },
				},
				2,
				new Date("2026-10-04T12:00:00.000Z"),
			),
		).toBe(false);
		expect(
			isFinalShipmentFailure(
				{
					attempts: [
						{
							number: 1,
							outcome: "failed",
							reason: "absent",
							actorType: "seller",
							at: "",
						},
						{
							number: 2,
							outcome: "failed",
							reason: "absent",
							actorType: "seller",
							at: "",
						},
					],
				},
				2,
				new Date("2026-10-04T12:00:00.000Z"),
			),
		).toBe(true);
		expect(
			isFinalShipmentFailure(
				{
					attempts: [
						{
							number: 1,
							outcome: "failed",
							reason: "absent",
							actorType: "seller",
							at: "",
						},
					],
					redelivery: { rescheduleBy: "2026-10-04T12:00:00.000Z" },
				},
				2,
				new Date("2026-10-04T12:00:00.000Z"),
			),
		).toBe(true);
	});
});

describe("createShipmentForOrder", () => {
	it("refuses a stale accepted event after the order has been cancelled", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					shop: "shop-1",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: {
						method: "seller_delivery",
						recipientName: "Aicha",
						phone: "+237600000099",
						city: "douala",
					},
				},
			],
		});
		const staleOrder = await payload.findByID({
			collection: "orders",
			id: "order-1",
			depth: 0,
		});
		const persistedOrder = payload.store.orders?.[0];
		if (persistedOrder) persistedOrder.status = "cancelled";

		await expect(
			createShipmentForOrder(payload, staleOrder),
		).rejects.toMatchObject({ code: "shipment.invalidTransition" });

		expect(payload.store.shipments ?? []).toHaveLength(0);
		expect(payload.store["shipment-events"] ?? []).toHaveLength(0);
	});

	it("rolls back shipment and order relation when its event cannot be written", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					shop: "shop-1",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: {
						method: "seller_delivery",
						recipientName: "Aicha",
						phone: "+237600000099",
						city: "douala",
						landmark: "Akwa",
					},
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					fulfillingShop: "shop-1",
					quantity: 1,
				},
			],
			"shop-locations": [
				{
					id: "location-1",
					shop: "shop-1",
					name: "Main warehouse",
					city: "douala",
					district: "Akwa",
					landmark: "Blue gate",
					gps: { lat: 4.05, lng: 9.7 },
					active: true,
					isDispatchOrigin: true,
					isDefaultOrigin: true,
				},
			],
		});
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "shipment-events";
		const order = await payload.findByID({
			collection: "orders",
			id: "order-1",
			depth: 0,
		});

		await expect(createShipmentForOrder(payload, order)).rejects.toThrow(
			"forced failure: create",
		);

		expect(payload.store.shipments ?? []).toHaveLength(0);
		expect(payload.store["shipment-events"] ?? []).toHaveLength(0);
		expect(payload.store.orders?.[0]?.shipments).toBeUndefined();
	});

	it("converges concurrent accepted-order events on one live shipment", async () => {
		const payload = fakePayload(
			{
				orders: [
					{
						id: "order-1",
						orderNumber: "ORD-1",
						shop: "shop-1",
						status: "accepted",
						paymentMethod: "cod",
						paymentStatus: "cod_pending",
						delivery: {
							method: "seller_delivery",
							recipientName: "Aicha",
							phone: "+237600000099",
							city: "douala",
							landmark: "Akwa",
						},
					},
				],
				"order-items": [
					{
						id: "item-1",
						order: "order-1",
						fulfillingShop: "shop-1",
						quantity: 1,
					},
				],
				"shop-locations": [
					{
						id: "location-1",
						shop: "shop-1",
						name: "Main warehouse",
						city: "douala",
						district: "Akwa",
						landmark: "Blue gate",
						gps: { lat: 4.05, lng: 9.7 },
						active: true,
						isDispatchOrigin: true,
						isDefaultOrigin: true,
					},
				],
			},
			{ uniques: { shipments: [["order"]] } },
		);
		const order = await payload.findByID({
			collection: "orders",
			id: "order-1",
			depth: 0,
		});

		const [first, second] = await Promise.all([
			createShipmentForOrder(payload, order),
			createShipmentForOrder(payload, order),
		]);

		expect(first.id).toBe(second.id);
		expect(payload.store.shipments).toHaveLength(1);
		expect(payload.store["shipment-events"]).toHaveLength(1);
		expect(payload.store.orders?.[0]?.shipments).toEqual([first.id]);
	});

	it("creates the shipment, event and order relation atomically", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					shop: "shop-1",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: {
						method: "seller_delivery",
						recipientName: "Aicha",
						phone: "+237600000099",
						city: "douala",
						landmark: "Akwa",
						fee: 1000,
						promisedBy: "2026-10-06T12:00:00.000Z",
					},
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					fulfillingShop: "shop-1",
					quantity: 2,
					fulfillmentStatus: "unfulfilled",
				},
			],
			"shop-locations": [
				{
					id: "location-1",
					shop: "shop-1",
					name: "Main warehouse",
					city: "douala",
					district: "Akwa",
					landmark: "Blue gate",
					gps: { lat: 4.05, lng: 9.7 },
					active: true,
					isDispatchOrigin: true,
					isDefaultOrigin: true,
				},
			],
		});
		const order = await payload.findByID({
			collection: "orders",
			id: "order-1",
			depth: 0,
		});

		const shipment = await createShipmentForOrder(payload, order);

		expect(shipment.status).toBe("pending");
		expect(shipment.items).toEqual([{ orderItem: "item-1", quantity: 2 }]);
		expect(payload.store["shipment-events"]).toMatchObject([
			{ shipment: shipment.id, type: "shipment.created", statusTo: "pending" },
		]);
		expect(payload.store.orders?.[0]?.shipments).toEqual([shipment.id]);
		const writes = payload.writes.filter((write) =>
			["shipments", "shipment-events", "orders"].includes(write.collection),
		);
		expect(new Set(writes.map((write) => write.transactionID)).size).toBe(1);
		expect(
			payload.writes.find((write) => write.collection === "sequences")
				?.transactionID,
		).toBeUndefined();
	});

	it("returns the existing live shipment instead of creating a duplicate", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					shop: "shop-1",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: {
						method: "seller_delivery",
						recipientName: "Aicha",
						phone: "+237600000099",
						city: "douala",
						landmark: "Akwa",
						fee: 1000,
						promisedBy: "2026-10-06T12:00:00.000Z",
					},
					shipments: ["shipment-live"],
				},
			],
			shipments: [
				{
					id: "shipment-live",
					shipmentNumber: "SHP-2610-000001",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-1",
					status: "pending",
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					fulfillingShop: "shop-1",
					quantity: 2,
					fulfillmentStatus: "unfulfilled",
				},
			],
			"shop-locations": [
				{
					id: "location-1",
					shop: "shop-1",
					name: "Main warehouse",
					city: "douala",
					district: "Akwa",
					landmark: "Blue gate",
					gps: { lat: 4.05, lng: 9.7 },
					active: true,
					isDispatchOrigin: true,
					isDefaultOrigin: true,
				},
			],
		});
		const order = await payload.findByID({
			collection: "orders",
			id: "order-1",
			depth: 0,
		});

		const shipment = await createShipmentForOrder(payload, order);

		expect(shipment.id).toBe("shipment-live");
		expect(payload.store.shipments).toHaveLength(1);
		expect(payload.store["shipment-events"] ?? []).toHaveLength(0);
		expect(
			payload.writes.some((write) => write.collection === "sequences"),
		).toBe(false);
	});
});
