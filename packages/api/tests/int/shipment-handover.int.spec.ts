// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import { hashHandoverCode } from "../../src/lib/orderCodes";
import { ServiceError } from "../../src/lib/serviceError";
import { withTransaction } from "../../src/lib/transactions";
import type { Shipment } from "../../src/payload-types";
import { reportAttempt } from "../../src/services/delivery/attempts";
import {
	declareDelivered,
	handoverShipment,
	readyForPickup,
} from "../../src/services/delivery/handover";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/services/orders/risk", () => ({
	recordDelivered: vi.fn(async () => undefined),
	recordRefusal: vi.fn(async () => undefined),
}));

vi.mock("../../src/services/smsProvider", () => ({
	sendSms: vi.fn(async () => ({ sent: true })),
}));

const secret = "shipment-handover-test-secret";
const orderId = "order-handover-1";
const code = "4821";

const shipment: Shipment = {
	id: "shipment-handover-1",
	shipmentNumber: "SHP-2610-000001",
	order: orderId,
	storefrontShop: "shop-1",
	fulfillingShop: "shop-1",
	method: "seller_delivery",
	carrier: "self",
	origin: null,
	destination: { gps: { lat: 4.05, lng: 9.7 } },
	fee: 2000,
	status: "in_transit",
	createdAt: "2026-10-04T10:00:00.000Z",
	updatedAt: "2026-10-04T10:00:00.000Z",
};

describe("shipment handover", () => {
	it("records OTP proof, COD collection and order delivery atomically", async () => {
		const payload = fakePayload(
			{
				orders: [
					{
						id: orderId,
						orderNumber: "ORD-2610-000001",
						shop: "shop-1",
						buyer: "buyer-1",
						status: "shipped",
						paymentMethod: "cod",
						paymentStatus: "cod_pending",
						amounts: { total: 42000 },
						delivery: {
							method: "seller_delivery",
							recipientName: "Aicha",
							phone: "+237600000099",
						},
						handover: {
							codeHash: hashHandoverCode(secret, orderId, code),
							attempts: 0,
						},
						timestamps: { acceptedAt: "2026-10-04T10:00:00.000Z" },
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
						origin: null,
						destination: { gps: { lat: 4.05, lng: 9.7 } },
						fee: 2000,
						status: "in_transit",
					},
				],
			},
			{ secret },
		);

		const delivered = await withTransaction(payload, (req) =>
			handoverShipment(
				req,
				shipment,
				{
					code,
					gps: { lat: 4.0501, lng: 9.7001, accuracyMeters: 12 },
					recipientName: "Aicha",
				},
				{ type: "rider", id: "rider-1" },
			),
		);

		expect(delivered.status).toBe("delivered");
		expect(delivered.proof).toMatchObject({
			handoverMethod: "otp",
			recipientName: "Aicha",
			gps: { lat: 4.0501, lng: 9.7001, accuracyMeters: 12 },
		});
		expect(delivered.proof?.distanceFromDestinationMeters).toBeGreaterThan(0);
		expect(delivered.codCollection).toMatchObject({
			expectedAmount: 42000,
			collectedAmount: 42000,
			collectedBy: "rider",
			remittanceStatus: "pending",
		});
		expect(payload.store.orders?.[0]).toMatchObject({
			status: "delivered",
			paymentStatus: "cod_collected",
			handover: { method: "otp" },
		});
		expect(payload.store["shipment-events"]).toMatchObject([
			{
				type: "shipment.delivered",
				statusFrom: "in_transit",
				statusTo: "delivered",
			},
		]);
		const transactionalWrites = payload.writes.filter((write) =>
			["shipments", "shipment-events", "orders", "order-events"].includes(
				write.collection,
			),
		);
		expect(
			new Set(transactionalWrites.map((write) => write.transactionID)).size,
		).toBe(1);
	});

	it("starts pickup hold when a seller marks a parcel ready", async () => {
		const pickupShipment: Shipment = {
			...shipment,
			id: "shipment-pickup-1",
			method: "pickup",
			pickupLocation: "location-1",
			status: "pending",
		};
		const payload = fakePayload(
			{
				orders: [
					{
						id: orderId,
						orderNumber: "ORD-2610-000001",
						shop: "shop-1",
						status: "accepted",
						paymentMethod: "cod",
						paymentStatus: "cod_pending",
						amounts: { total: 42000 },
						delivery: {
							method: "pickup",
							recipientName: "Aicha",
							phone: "+237600000099",
							city: "douala",
						},
						timestamps: {},
						deadlines: {},
						contract: { locale: "fr" },
						handover: {},
					},
				],
				"order-items": [],
				shipments: [
					{
						id: pickupShipment.id,
						shipmentNumber: pickupShipment.shipmentNumber,
						order: orderId,
						storefrontShop: "shop-1",
						fulfillingShop: "shop-1",
						method: "pickup",
						carrier: "self",
						pickupLocation: "location-1",
						status: "pending",
					},
				],
				"shop-locations": [
					{ id: "location-1", shop: "shop-1", holdDays: 3, active: true },
				],
			},
			{
				secret,
				globals: { "app-settings": { delivery: { pickupHoldDaysDefault: 7 } } },
			},
		);

		const ready = await withTransaction(payload, (req) =>
			readyForPickup(req, pickupShipment, { type: "seller", id: "seller-1" }),
		);

		expect(ready.readyForPickupAt).toBeDefined();
		expect(
			Date.parse(ready.pickupDeadline ?? "") -
				Date.parse(ready.readyForPickupAt ?? ""),
		).toBe(3 * 24 * 60 * 60 * 1000);
		expect(ready.status).toBe("pending");
		expect(payload.store.orders?.[0]?.status).toBe("shipped");
		expect(payload.store["shipment-events"]).toMatchObject([
			{ type: "shipment.ready_for_pickup", statusTo: "pending" },
		]);
	});

	it("requires a photo and a self-delivery seller for declaration", async () => {
		const payload = fakePayload();
		await expect(
			withTransaction(payload, (req) =>
				declareDelivered(
					req,
					shipment,
					{ photoId: "" },
					{ type: "seller", id: "seller-1" },
				),
			),
		).rejects.toMatchObject({ code: ERROR_CODES.shipmentPhotoRequired });

		await expect(
			withTransaction(payload, (req) =>
				declareDelivered(
					req,
					shipment,
					{ photoId: "proof-1" },
					{ type: "rider", id: "rider-1" },
				),
			),
		).rejects.toBeInstanceOf(ServiceError);
		expect(payload.store.shipments ?? []).toHaveLength(0);
	});

	describe("declaration photo ownership", () => {
		const seller = { type: "seller" as const, id: "seller-1" };
		const declare = (rows: Record<string, unknown>[], photoId: string) => {
			const payload = fakePayload(
				{
					orders: [
						{
							id: orderId,
							orderNumber: "ORD-2610-000001",
							shop: "shop-1",
							buyer: "buyer-1",
							status: "shipped",
							paymentMethod: "cod",
							paymentStatus: "cod_pending",
							amounts: { total: 42000 },
							delivery: {
								method: "seller_delivery",
								recipientName: "Aicha",
								phone: "+237600000099",
							},
							timestamps: { acceptedAt: "2026-10-04T10:00:00.000Z" },
						},
					],
					shipments: [shipment],
					"delivery-proofs": rows,
				},
				{ secret },
			);
			return {
				payload,
				run: () =>
					withTransaction(payload, (req) =>
						declareDelivered(req, shipment, { photoId }, seller),
					),
			};
		};

		it("refuses a dangling proof id", async () => {
			const { payload, run } = declare([], "missing");
			await expect(run()).rejects.toMatchObject({
				code: ERROR_CODES.shipmentPhotoRequired,
			});
			expect(payload.store.shipments?.[0]?.status).toBe("in_transit");
		});

		it("refuses another shipment's proof", async () => {
			const { payload, run } = declare(
				[{ id: "p-old", shipment: "other-shipment", kind: "declaration" }],
				"p-old",
			);
			await expect(run()).rejects.toMatchObject({
				code: ERROR_CODES.shipmentPhotoRequired,
			});
			expect(payload.store.shipments?.[0]?.status).toBe("in_transit");
		});

		it("accepts this shipment's declaration proof", async () => {
			const { payload, run } = declare(
				[{ id: "p-ok", shipment: shipment.id, kind: "declaration" }],
				"p-ok",
			);
			const result = await run();
			expect(result.proof?.photo).toBe("p-ok");
			expect(payload.store.shipments?.[0]?.status).toBe("delivered");
		});
	});
	describe("proof photo ownership at every call site", () => {
		const rider = { type: "rider" as const, id: "rider-1" };
		const orderRow = {
			id: orderId,
			orderNumber: "ORD-2610-000001",
			shop: "shop-1",
			buyer: "buyer-1",
			status: "shipped",
			paymentMethod: "cod",
			paymentStatus: "cod_pending",
			amounts: { total: 42000 },
			delivery: {
				method: "seller_delivery",
				recipientName: "Aicha",
				phone: "+237600000099",
			},
			handover: {
				codeHash: hashHandoverCode(secret, orderId, code),
				attempts: 0,
			},
			timestamps: { acceptedAt: "2026-10-04T10:00:00.000Z" },
		};
		const world = (proofs: Record<string, unknown>[]) =>
			fakePayload(
				{
					orders: [orderRow],
					shipments: [shipment],
					"delivery-proofs": proofs,
				},
				{ secret },
			);
		const foreign = [
			{ id: "p-foreign", shipment: "other-shipment", kind: "handover" },
		];
		const wrongKind = [
			{ id: "p-wrong", shipment: shipment.id, kind: "attempt" },
		];

		it("handover refuses another shipment's photo and moves nothing", async () => {
			const payload = world(foreign);
			await expect(
				withTransaction(payload, (req) =>
					handoverShipment(
						req,
						shipment,
						{ code, photoId: "p-foreign" },
						rider,
					),
				),
			).rejects.toMatchObject({
				code: ERROR_CODES.shipmentPhotoRequired,
				status: 400,
			});
			expect(payload.store.shipments?.[0]?.status).toBe("in_transit");
			expect(payload.store.orders?.[0]?.status).toBe("shipped");
		});

		it("handover refuses this shipment's photo of the wrong kind", async () => {
			const payload = world([
				{ id: "p-wrong", shipment: shipment.id, kind: "declaration" },
			]);
			await expect(
				withTransaction(payload, (req) =>
					handoverShipment(req, shipment, { code, photoId: "p-wrong" }, rider),
				),
			).rejects.toMatchObject({ code: ERROR_CODES.shipmentPhotoRequired });
			expect(payload.store.shipments?.[0]?.status).toBe("in_transit");
		});

		it("an attempt report refuses another shipment's photo", async () => {
			const payload = world([
				{ id: "p-foreign", shipment: "other-shipment", kind: "attempt" },
			]);
			await expect(
				withTransaction(payload, (req) =>
					reportAttempt(
						req,
						shipment,
						{ reason: "absent", photoId: "p-foreign" },
						rider,
					),
				),
			).rejects.toMatchObject({
				code: ERROR_CODES.shipmentPhotoRequired,
				status: 400,
			});
			expect(payload.store.shipments?.[0]?.attempts ?? []).toHaveLength(0);
		});

		it("an attempt report refuses this shipment's photo of the wrong kind", async () => {
			const payload = world(wrongKind.map((r) => ({ ...r, kind: "handover" })));
			await expect(
				withTransaction(payload, (req) =>
					reportAttempt(
						req,
						shipment,
						{ reason: "absent", photoId: "p-wrong" },
						rider,
					),
				),
			).rejects.toMatchObject({ code: ERROR_CODES.shipmentPhotoRequired });
			expect(payload.store.shipments?.[0]?.attempts ?? []).toHaveLength(0);
		});

		it("the kind-mismatch branch alone refuses an own-shipment declaration photo", async () => {
			const payload = world(wrongKind);
			await expect(
				withTransaction(payload, (req) =>
					declareDelivered(
						req,
						shipment,
						{ photoId: "p-wrong" },
						{ type: "seller", id: "seller-1" },
					),
				),
			).rejects.toMatchObject({ code: ERROR_CODES.shipmentPhotoRequired });
			expect(payload.store.shipments?.[0]?.status).toBe("in_transit");
		});
	});
});
