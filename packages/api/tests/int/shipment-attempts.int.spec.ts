// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { rescheduleShipmentSchema } from "../../src/lib/delivery/schemas";
import { withTransaction } from "../../src/lib/transactions";
import type { Shipment } from "../../src/payload-types";
import {
	confirmReturned,
	finalizeFailure,
	reportAttempt,
	rescheduleShipment,
} from "../../src/services/delivery/attempts";
import { fakePayload } from "./helpers/fakePayload";

const sendSms = vi.fn();
const triggerNotificationEvent = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: (...args: unknown[]) =>
		triggerNotificationEvent(...args),
}));
vi.mock("../../src/services/orders/risk", () => ({
	recordDelivered: vi.fn(async () => undefined),
	recordRefusal: vi.fn(async () => undefined),
}));

const orderId = "order-attempt-1";
const shipment: Shipment = {
	id: "shipment-attempt-1",
	shipmentNumber: "SHP-2610-000011",
	order: orderId,
	storefrontShop: "shop-1",
	fulfillingShop: "shop-1",
	method: "seller_delivery",
	carrier: "self",
	origin: null,
	destination: { city: "douala" },
	fee: 1500,
	status: "in_transit",
	createdAt: "2026-10-04T10:00:00.000Z",
	updatedAt: "2026-10-04T10:00:00.000Z",
};

function seededPayload() {
	return fakePayload({
		users: [
			{ id: "buyer-1", role: "user", name: "Buyer" },
			{ id: "seller-1", role: "user", name: "Seller" },
		],
		"shop-members": [
			{
				id: "shop-member-1",
				shop: "shop-1",
				user: "seller-1",
				role: "owner",
				status: "active",
			},
		],
		orders: [
			{
				id: orderId,
				orderNumber: "ORD-2610-000011",
				shop: "shop-1",
				buyer: "buyer-1",
				status: "shipped",
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				amounts: { total: 20000 },
				delivery: {
					method: "seller_delivery",
					recipientName: "Aicha",
					phone: "+237600000099",
					city: "douala",
				},
				timestamps: { acceptedAt: "2026-10-04T10:00:00.000Z" },
			},
		],
		"order-items": [
			{
				id: "order-item-attempt-1",
				order: orderId,
				product: "product-1",
				variant: "variant-1",
				fulfillingShop: "shop-1",
				unitPrice: 20000,
				quantity: 1,
				stockTracked: true,
				fulfillmentStatus: "shipped",
			},
		],
		products: [{ id: "product-1", shop: "shop-1", title: "Phone" }],
		"product-variants": [
			{
				id: "variant-1",
				product: "product-1",
				shop: "shop-1",
				price: 20000,
				trackInventory: true,
				stockOnHand: 5,
				stockReserved: 1,
			},
		],
		"stock-movements": [],
		shipments: [
			{
				id: shipment.id,
				shipmentNumber: shipment.shipmentNumber,
				order: orderId,
				storefrontShop: "shop-1",
				fulfillingShop: "shop-1",
				method: "seller_delivery",
				carrier: "self",
				origin: null,
				destination: { city: "douala" },
				fee: 1500,
				status: "in_transit",
			},
		],
	});
}

describe("shipment failed attempts", () => {
	it("rejects phone changes in the redelivery request contract", () => {
		const parsed = rescheduleShipmentSchema.safeParse({
			date: "2026-10-05T10:00:00.000Z",
			window: "morning",
			phone: "+237699999999",
		});
		expect(parsed.success).toBe(false);
	});

	it("closes the reschedule window at the exact deadline", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-06T10:00:00.000Z"));
		try {
			const payload = seededPayload();
			const failedShipment: Shipment = {
				...shipment,
				status: "failed",
				redelivery: { rescheduleBy: "2026-10-06T10:00:00.000Z" },
			};
			await expect(
				withTransaction(payload, (req) =>
					rescheduleShipment(
						req,
						failedShipment,
						{ date: "2026-10-07T10:00:00.000Z", window: "morning" },
						"buyer",
					),
				),
			).rejects.toMatchObject({ code: "shipment.rescheduleWindowClosed" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("rejects a reschedule date that is not a delivery day", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-04T10:00:00.000Z"));
		try {
			const payload = fakePayload({
				orders: [
					{
						id: orderId,
						orderNumber: "ORD-2610-000011",
						shop: "shop-1",
						buyer: "buyer-1",
						status: "shipped",
						paymentMethod: "cod",
						paymentStatus: "cod_pending",
						amounts: { total: 1000 },
						delivery: { phone: "+237600000099" },
					},
				],
				shipments: [
					{
						id: shipment.id,
						shipmentNumber: shipment.shipmentNumber,
						order: orderId,
						storefrontShop: "shop-1",
						fulfillingShop: "shop-1",
						method: "seller_delivery",
						carrier: "self",
						zone: "zone-sunday",
						origin: null,
						destination: {},
						fee: 0,
						status: "failed",
						redelivery: { rescheduleBy: "2026-10-06T10:00:00.000Z" },
					},
				],
				"delivery-zones": [
					{
						id: "zone-sunday",
						shop: "shop-1",
						name: "Weekdays",
						scope: "same_city",
						city: "douala",
						method: "seller_delivery",
						fee: 0,
						etaMinHours: 1,
						etaMaxHours: 24,
						deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
						active: true,
					},
				],
			});
			const failedShipment: Shipment = {
				...shipment,
				zone: "zone-sunday",
				status: "failed",
				redelivery: { rescheduleBy: "2026-10-06T10:00:00.000Z" },
			};
			await expect(
				withTransaction(payload, (req) =>
					rescheduleShipment(
						req,
						failedShipment,
						{ date: "2026-10-04T18:00:00.000Z", window: "evening" },
						"buyer",
					),
				),
			).rejects.toMatchObject({ code: "shipment.rescheduleDateInvalid" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not allow a final failure to be rescheduled", async () => {
		const payload = seededPayload();
		await expect(
			withTransaction(payload, (req) =>
				rescheduleShipment(
					req,
					{
						...shipment,
						status: "failed",
						redelivery: { rescheduleBy: "2026-10-06T10:00:00.000Z" },
						finalFailure: { reason: "refused", at: "2026-10-04T10:00:00.000Z" },
					},
					{ date: "2026-10-05T10:00:00.000Z", window: "morning" },
					"buyer",
				),
			),
		).rejects.toMatchObject({ code: "shipment.rescheduleWindowClosed" });
	});

	it("records an eligible failure and keeps the order shipped without releasing stock", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-04T10:00:00.000Z"));
		sendSms.mockClear();
		triggerNotificationEvent.mockClear();
		const payload = seededPayload();
		let result: Shipment;
		try {
			result = await withTransaction(payload, async (req) => {
				const reported = await reportAttempt(
					req,
					shipment,
					{ reason: "absent", note: "No answer" },
					{ type: "seller", id: "seller-1" },
				);
				expect(sendSms).not.toHaveBeenCalled();
				return reported;
			});
		} finally {
			vi.useRealTimers();
		}

		expect(result.status).toBe("failed");
		expect(result.attempts).toMatchObject([
			{ number: 1, outcome: "failed", reason: "absent", note: "No answer" },
		]);
		expect(result.redelivery?.rescheduleBy).toBe("2026-10-06T10:00:00.000Z");
		expect(payload.store.orders?.[0]).toMatchObject({
			status: "shipped",
			deliveryFailure: { attempts: 1, reason: "absent" },
		});
		expect(payload.store.orders?.[0]?.paymentStatus).toBe("cod_pending");
		expect(payload.store["shipment-events"]).toMatchObject([
			{
				type: "shipment.attempt_failed",
				statusFrom: "in_transit",
				statusTo: "failed",
			},
		]);
		expect(payload.store["order-events"]).toMatchObject([
			{ type: "order.delivery_attempt_failed", reason: "absent" },
		]);
		expect(
			payload.writes.some((write) => write.collection === "stock-movements"),
		).toBe(false);
		expect(sendSms).toHaveBeenCalledWith(
			payload,
			expect.objectContaining({
				to: "+237600000099",
				message: expect.stringContaining("Choisissez un nouveau créneau"),
			}),
		);
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "shipment-attempt-failed",
				subscriberId: "buyer-1",
				payload: expect.objectContaining({ audience: "buyer", orderId }),
			}),
		);
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "shipment-attempt-failed",
				subscriberId: "seller-1",
				payload: expect.objectContaining({ audience: "shop", orderId }),
			}),
		);
	});

	it("maps a pickup not collected failure to absent on the order", async () => {
		const payload = seededPayload();
		const pickup = { ...shipment, method: "pickup" as const };
		const pickupRow = payload.store.shipments?.[0];
		if (pickupRow) pickupRow.method = "pickup";
		const result = await withTransaction(payload, (req) =>
			reportAttempt(
				req,
				pickup,
				{ reason: "not_collected" },
				{ type: "seller", id: "seller-1" },
			),
		);

		expect(result.finalFailure).toMatchObject({ reason: "not_collected" });
		expect(payload.store.orders?.[0]?.deliveryFailure).toMatchObject({
			attempts: 1,
			reason: "absent",
		});
		expect(payload.store.orders?.[0]?.status).toBe("shipped");
		expect(payload.store.orders?.[0]?.paymentStatus).toBe("cod_pending");
		expect(payload.store["shipment-events"]).toMatchObject([
			{ type: "shipment.failed_final" },
			{ type: "shipment.return_initiated" },
		]);
	});

	it("assigns a refused COD resale parcel's return cost to the reseller", async () => {
		const payload = seededPayload();
		const item = payload.store["order-items"]?.[0];
		if (item) item.sourcing = "resale";
		const failedShipment: Shipment = {
			...shipment,
			status: "failed",
			attempts: [
				{
					number: 1,
					outcome: "failed",
					reason: "refused",
					actorType: "seller",
					at: "2026-10-04T10:00:00.000Z",
				},
			],
		};
		const row = payload.store.shipments?.[0];
		if (row) {
			row.status = "failed";
			row.attempts = failedShipment.attempts;
		}
		const finalized = await withTransaction(payload, (req) =>
			finalizeFailure(req, failedShipment, "refused"),
		);
		expect(finalized.failureCostBearer).toBe("reseller");
		expect(finalized.finalFailure).toMatchObject({ reason: "refused" });
	});

	it("releases the reserved stock only on physical return, once", async () => {
		const payload = seededPayload();
		const failedShipment: Shipment = {
			...shipment,
			status: "failed",
			attempts: [
				{
					number: 1,
					outcome: "failed",
					reason: "refused",
					actorType: "seller",
					at: "2026-10-04T10:00:00.000Z",
				},
				{
					number: 2,
					outcome: "failed",
					reason: "other",
					actorType: "seller",
					at: "2026-10-04T11:00:00.000Z",
				},
			],
		};
		const shipmentRow = payload.store.shipments?.[0];
		if (shipmentRow) {
			shipmentRow.status = "failed";
			shipmentRow.attempts = failedShipment.attempts;
		}

		const finalFailure = await withTransaction(payload, (req) =>
			finalizeFailure(req, failedShipment, "other"),
		);
		expect(finalFailure.status).toBe("failed");
		expect(payload.store["product-variants"]?.[0]?.stockReserved).toBe(1);
		expect(payload.store["stock-movements"]).toHaveLength(0);

		const returned = await withTransaction(payload, (req) =>
			confirmReturned(req, finalFailure, { type: "seller", id: "seller-1" }),
		);
		expect(returned.status).toBe("returned");
		expect(payload.store["product-variants"]?.[0]?.stockReserved).toBe(0);
		expect(payload.store["stock-movements"]).toHaveLength(1);
		expect(payload.store.orders?.[0]?.status).toBe("delivery_failed");
		expect(payload.store.orders?.[0]).toMatchObject({
			paymentStatus: "cod_refused",
			deliveryFailure: { reason: "refused" },
		});

		await expect(
			withTransaction(payload, (req) =>
				confirmReturned(req, failedShipment, {
					type: "seller",
					id: "seller-1",
				}),
			),
		).rejects.toMatchObject({ code: "shipment.invalidTransition" });
		expect(payload.store["product-variants"]?.[0]?.stockReserved).toBe(0);
		expect(payload.store["stock-movements"]).toHaveLength(1);
	});

	it("rolls back final failure when the combined return transaction cannot transition the order", async () => {
		triggerNotificationEvent.mockClear();
		const payload = seededPayload();
		const liveShipment: Shipment = {
			...shipment,
			status: "failed",
		};
		const row = payload.store.shipments?.[0];
		if (row) row.status = "failed";
		payload.failWhen = (method, args) =>
			method === "db.updateOne" && args.collection === "orders";

		await expect(
			withTransaction(payload, async (req) => {
				const finalized = await finalizeFailure(req, liveShipment, "refused");
				return confirmReturned(req, finalized, {
					type: "seller",
					id: "seller-1",
				});
			}),
		).rejects.toThrow("forced failure: db.updateOne");

		expect(payload.store.shipments?.[0]).toMatchObject({ status: "failed" });
		expect(payload.store.shipments?.[0]?.finalFailure).toBeUndefined();
		expect(payload.store.shipments?.[0]?.returnedAt).toBeUndefined();
		expect(payload.store["shipment-events"]).toHaveLength(0);
		expect(payload.store.orders?.[0]?.status).toBe("shipped");
		expect(payload.store["product-variants"]?.[0]?.stockReserved).toBe(1);
		expect(payload.store["stock-movements"]).toHaveLength(0);
		expect(triggerNotificationEvent).not.toHaveBeenCalled();
	});

	it("notifies the shop after finalizing a parcel return", async () => {
		triggerNotificationEvent.mockClear();
		const payload = seededPayload();
		const liveShipment: Shipment = { ...shipment, status: "failed" };
		const row = payload.store.shipments?.[0];
		if (row) row.status = "failed";

		const finalized = await withTransaction(payload, (req) =>
			finalizeFailure(req, liveShipment, "refused"),
		);

		expect(finalized.finalFailure).toMatchObject({ reason: "refused" });
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "shipment-return-initiated",
				subscriberId: "seller-1",
				payload: expect.objectContaining({
					shipmentId: shipment.id,
					orderNumber: "ORD-2610-000011",
					reason: "refused",
					audience: "shop",
				}),
			}),
		);
	});

	it("updates both address snapshots and appends one address event on reschedule", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-04T10:00:00.000Z"));
		sendSms.mockClear();
		triggerNotificationEvent.mockClear();
		try {
			const payload = fakePayload({
				users: [
					{ id: "buyer-1", role: "user", name: "Buyer" },
					{ id: "seller-1", role: "user", name: "Seller" },
				],
				"shop-members": [
					{
						id: "shop-member-1",
						shop: "shop-1",
						user: "seller-1",
						role: "owner",
						status: "active",
					},
				],
				"courier-members": [
					{
						id: "dispatcher-membership",
						courier: "courier-1",
						user: "dispatcher-1",
						role: "dispatcher",
						status: "active",
					},
					{
						id: "rider-membership",
						courier: "courier-1",
						user: "rider-1",
						role: "rider",
						status: "active",
					},
				],
				orders: [
					{
						id: orderId,
						orderNumber: "ORD-2610-000011",
						shop: "shop-1",
						buyer: "buyer-1",
						status: "shipped",
						paymentMethod: "cod",
						paymentStatus: "cod_pending",
						amounts: { total: 20000 },
						delivery: {
							method: "seller_delivery",
							recipientName: "Aicha",
							phone: "+237600000099",
							city: "douala",
							landmark: "Old landmark",
						},
						timestamps: {},
					},
				],
				shipments: [
					{
						id: shipment.id,
						shipmentNumber: shipment.shipmentNumber,
						order: orderId,
						storefrontShop: "shop-1",
						fulfillingShop: "shop-1",
						method: "seller_delivery",
						carrier: "self",
						courier: "courier-1",
						rider: { user: "rider-1" },
						zone: "zone-1",
						destination: {
							city: "douala",
							landmark: "Old landmark",
							phone: "+237600000099",
						},
						fee: 1500,
						status: "failed",
						redelivery: { rescheduleBy: "2026-10-06T10:00:00.000Z" },
					},
				],
				"delivery-zones": [
					{
						id: "zone-1",
						shop: "shop-1",
						name: "Zone",
						scope: "same_city",
						city: "douala",
						method: "seller_delivery",
						fee: 1500,
						etaMinHours: 1,
						etaMaxHours: 24,
						deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
						active: true,
					},
				],
			});
			const failedShipment: Shipment = {
				...shipment,
				zone: "zone-1",
				courier: "courier-1",
				rider: { user: "rider-1" },
				destination: {
					city: "douala",
					landmark: "Old landmark",
					phone: "+237600000099",
				},
				status: "failed",
				redelivery: { rescheduleBy: "2026-10-06T10:00:00.000Z" },
			};
			const result = await withTransaction(payload, (req) =>
				rescheduleShipment(
					req,
					failedShipment,
					{
						date: "2026-10-05T10:00:00.000Z",
						window: "morning",
						landmark: "New landmark",
						gps: { lat: 4.05, lng: 9.7 },
					},
					"seller",
					"seller-1",
				),
			);
			expect(result.redelivery).toMatchObject({
				requestedBy: "seller",
				scheduledFor: "2026-10-05T10:00:00.000Z",
				window: "morning",
			});
			expect(payload.store.shipments?.[0]?.destination).toMatchObject({
				landmark: "New landmark",
				phone: "+237600000099",
			});
			expect(payload.store.orders?.[0]?.delivery).toMatchObject({
				landmark: "New landmark",
				phone: "+237600000099",
			});
			expect(payload.store["order-events"]).toMatchObject([
				{ type: "order.address_updated", actorType: "seller" },
			]);
			expect(payload.store["order-events"]).toHaveLength(1);
			expect(triggerNotificationEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					event: "shipment-redelivery-scheduled",
					subscriberId: "seller-1",
					payload: expect.objectContaining({ audience: "shop" }),
				}),
			);
			expect(triggerNotificationEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					event: "shipment-redelivery-scheduled",
					subscriberId: "dispatcher-1",
					payload: expect.objectContaining({ audience: "rider" }),
				}),
			);
			expect(triggerNotificationEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					event: "shipment-redelivery-scheduled",
					subscriberId: "rider-1",
				}),
			);
			expect(sendSms).toHaveBeenCalledWith(
				payload,
				expect.objectContaining({
					to: "+237600000099",
					message: expect.stringContaining("2026-10-05T10:00:00.000Z"),
				}),
			);
		} finally {
			vi.useRealTimers();
		}
	});
});
