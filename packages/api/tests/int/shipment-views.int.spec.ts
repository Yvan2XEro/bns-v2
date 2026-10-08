// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { withTransaction } from "../../src/lib/transactions";
import { confirmShipmentRemittance } from "../../src/services/delivery/codRemittance";
import {
	getOrderShipments,
	shipmentViewFor,
} from "../../src/services/delivery/serialize";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/lib/privateFiles", () => ({
	createSignedDocumentUrl: vi.fn(
		async (doc: { id: string }, ttlSeconds: number, route: string) => ({
			url: `${route}/${doc.id}?ttl=${ttlSeconds}`,
			expiresAt: new Date(Date.now() + ttlSeconds * 1000),
		}),
	),
}));

describe("shipment audience projections", () => {
	it("orders equal-timestamp timeline events deterministically by event id", async () => {
		const occurredAt = "2026-10-01T10:00:00.000Z";
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					buyer: "buyer-1",
					paymentMethod: "cod",
				},
			],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					status: "pending",
					method: "seller_delivery",
				},
			],
			"order-events": [
				{
					id: "event-z",
					order: "order-1",
					type: "order.confirmed",
					visibility: "buyer",
					createdAt: occurredAt,
				},
			],
			"shipment-events": [
				{
					id: "event-a",
					shipment: "shipment-1",
					type: "shipment.ready",
					visibility: "buyer",
					occurredAt,
				},
			],
		});
		const shipment = await payload.findByID({
			collection: "shipments",
			id: "shipment-1",
			depth: 0,
			overrideAccess: true,
		});
		const view = await shipmentViewFor(payload, shipment, {
			id: "buyer-1",
			role: "user",
		});
		if (!("timeline" in view)) throw new Error("buyer projection expected");
		expect(view.timeline).toEqual([
			{ type: "shipment.ready", at: occurredAt },
			{ type: "order.confirmed", at: occurredAt },
		]);
	});

	it("returns the exact buyer projection without internal shipment fields", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					buyer: "buyer-1",
					shop: "shop-1",
					paymentMethod: "cod",
					amounts: { total: 12500 },
				},
			],
			shops: [{ id: "shop-1", name: "Shop One" }],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-1",
					method: "seller_delivery",
					carrier: "self",
					status: "pending",
					origin: { name: "Shop One", phone: "+237600000001" },
					destination: { recipientName: "Aicha Ngu", phone: "+237600000002" },
					fee: 700,
					courierCost: 450,
					attempts: [
						{
							number: 1,
							reason: "absent",
							note: "private",
							at: "2026-10-01T10:00:00.000Z",
						},
					],
					riderLink: {
						tokenHash: "secret-hash",
						createdAt: "2026-10-01T10:00:00.000Z",
					},
					proof: {
						handoverMethod: "otp",
						capturedAt: "2026-10-01T11:00:00.000Z",
						photo: "proof-1",
					},
					createdAt: "2026-10-01T10:00:00.000Z",
					updatedAt: "2026-10-01T10:00:00.000Z",
				},
			],
			"order-events": [
				{
					id: "order-event-1",
					order: "order-1",
					type: "order.accepted",
					visibility: "buyer",
					createdAt: "2026-10-01T09:00:00.000Z",
				},
			],
			"shipment-events": [
				{
					id: "shipment-event-1",
					shipment: "shipment-1",
					order: "order-1",
					type: "shipment.picked_up",
					visibility: "buyer",
					occurredAt: "2026-10-01T10:00:00.000Z",
				},
				{
					id: "shipment-event-private",
					shipment: "shipment-1",
					order: "order-1",
					type: "shipment.rider_assigned",
					visibility: "staff",
					occurredAt: "2026-10-01T10:30:00.000Z",
				},
				{
					id: "shipment-event-2",
					shipment: "shipment-1",
					order: "order-1",
					type: "shipment.delivered",
					visibility: "both",
					occurredAt: "2026-10-01T11:00:00.000Z",
				},
			],
			"delivery-proofs": [
				{
					id: "proof-1",
					filename: "handover.jpg",
					mimeType: "image/jpeg",
					kind: "handover",
					shipment: "shipment-1",
				},
			],
		});
		const shipment = await payload.findByID({
			collection: "shipments",
			id: "shipment-1",
			depth: 0,
			overrideAccess: true,
		});

		const view = await shipmentViewFor(payload, shipment, {
			id: "buyer-1",
			role: "user",
		});

		expect(view).toEqual({
			id: "shipment-1",
			shipmentNumber: "SHP-1",
			status: "pending",
			method: "seller_delivery",
			promisedBy: null,
			stepper: {
				readyAt: null,
				pickedUpAt: null,
				inTransitAt: null,
				terminalAt: null,
			},
			rider: null,
			attempts: [
				{ number: 1, reason: "absent", at: "2026-10-01T10:00:00.000Z" },
			],
			redelivery: null,
			pickup: null,
			trackingUrl: null,
			proof: {
				handoverMethod: "otp",
				capturedAt: "2026-10-01T11:00:00.000Z",
				photoUrl: "/api/delivery-proofs/files/proof-1?ttl=600",
				codeVerified: true,
			},
			timeline: [
				{ type: "order.accepted", at: "2026-10-01T09:00:00.000Z" },
				{ type: "shipment.picked_up", at: "2026-10-01T10:00:00.000Z" },
				{ type: "shipment.delivered", at: "2026-10-01T11:00:00.000Z" },
			],
			canReschedule: false,
		});
		expect(JSON.stringify(view)).not.toContain("secret-hash");
		expect(JSON.stringify(view)).not.toContain("private");
		expect(JSON.stringify(view)).not.toContain("courierCost");
		expect(JSON.stringify(view)).not.toContain("shipment.rider_assigned");
		if (!("proof" in view)) throw new Error("buyer projection expected");
		const proof = payload.store["delivery-proofs"]?.[0];
		if (!proof) throw new Error("proof fixture expected");
		proof.kind = "attempt";
		const attemptView = await shipmentViewFor(payload, shipment, {
			id: "buyer-1",
			role: "user",
		});
		if (!("proof" in attemptView)) throw new Error("buyer projection expected");
		expect(attemptView.proof?.photoUrl).toBeNull();
		const inTransitView = await shipmentViewFor(
			payload,
			{
				...shipment,
				status: "in_transit",
				rider: { name: "Rider One", phone: "+237600000099" },
			},
			{ id: "buyer-1", role: "user" },
		);
		if (!("canReschedule" in inTransitView)) {
			throw new Error("buyer projection expected");
		}
		expect(inTransitView.rider).toEqual({
			firstName: "Rider",
			phone: "+237600000099",
		});
		const retryView = await shipmentViewFor(
			payload,
			{
				...shipment,
				status: "failed",
				rider: { name: "Rider One", phone: "+237600000099" },
				redelivery: {
					scheduledFor: "2026-10-05T10:00:00.000Z",
					window: "morning",
					rescheduleBy: new Date(Date.now() + 60_000).toISOString(),
				},
			},
			{ id: "buyer-1", role: "user" },
		);
		if (!("canReschedule" in retryView)) {
			throw new Error("buyer projection expected");
		}
		expect(retryView.rider).toEqual({
			firstName: "Rider",
			phone: "+237600000099",
		});
		const deliveredView = await shipmentViewFor(
			payload,
			{
				...shipment,
				status: "delivered",
				rider: { name: "Rider One", phone: "+237600000099" },
			},
			{ id: "buyer-1", role: "user" },
		);
		if (!("canReschedule" in deliveredView)) {
			throw new Error("buyer projection expected");
		}
		expect(deliveredView.rider).toBeNull();
	});

	it("lists an order's shipments as the shop projection for a member and refuses a stranger", async () => {
		const payload = fakePayload({
			users: [{ id: "seller-1", role: "user" }],
			"shop-members": [
				{
					id: "member-1",
					shop: "shop-1",
					user: "seller-1",
					role: "staff",
					status: "active",
				},
			],
			shops: [{ id: "shop-1", name: "Shop One", status: "active", level: 2 }],
			orders: [{ id: "order-1", buyer: "buyer-1", shop: "shop-1" }],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-1",
					method: "seller_delivery",
					carrier: "self",
					status: "pending",
					riderLink: { tokenHash: "secret-hash", createdAt: "2026-10-01" },
				},
			],
		});
		const views = await getOrderShipments(payload, "order-1", {
			id: "seller-1",
			role: "user",
		});
		expect(views.map((view) => view.shipmentNumber)).toEqual(["SHP-1"]);
		expect(JSON.stringify(views)).not.toContain("secret-hash");
		await expect(
			getOrderShipments(payload, "order-1", { id: "stranger", role: "user" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("projects shop membership without the rider token hash and reveals cost to owner", async () => {
		const payload = fakePayload({
			users: [{ id: "seller-1", role: "user", name: "Seller" }],
			"shop-members": [
				{
					id: "shop-member-1",
					shop: "shop-1",
					user: "seller-1",
					role: "owner",
					status: "active",
				},
				{
					id: "supplier-member-1",
					shop: "shop-2",
					user: "seller-1",
					role: "owner",
					status: "active",
				},
			],
			shops: [
				{ id: "shop-1", name: "Shop One", status: "active", level: 2 },
				{ id: "shop-2", name: "Supplier Shop", status: "active", level: 2 },
			],
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					buyer: "buyer-1",
					shop: "shop-1",
					paymentMethod: "cod",
					amounts: { total: 12500 },
				},
			],
			shipments: [
				{
					id: "shipment-1",
					shipmentNumber: "SHP-1",
					order: "order-1",
					storefrontShop: "shop-1",
					fulfillingShop: "shop-2",
					method: "courier",
					carrier: "courier",
					courier: "courier-1",
					courierCost: 450,
					status: "pending",
					fee: 700,
					proof: {
						handoverMethod: "seller_declaration",
						photo: "proof-shop",
					},
					riderLink: {
						tokenHash: "secret-hash",
						createdAt: "2026-10-01T10:00:00.000Z",
						expiresAt: "2026-10-04T10:00:00.000Z",
					},
				},
			],
			"delivery-proofs": [
				{
					id: "proof-shop",
					filename: "attempt.jpg",
					mimeType: "image/jpeg",
					kind: "attempt",
					shipment: "shipment-1",
				},
			],
		});
		const shipment = await payload.findByID({
			collection: "shipments",
			id: "shipment-1",
			depth: 0,
			overrideAccess: true,
		});

		const view = await shipmentViewFor(payload, shipment, {
			id: "seller-1",
			role: "user",
		});

		expect(view).toEqual({
			id: "shipment-1",
			shipmentNumber: "SHP-1",
			order: "order-1",
			storefrontShop: "shop-1",
			fulfillingShop: "shop-2",
			method: "courier",
			carrier: "courier",
			courier: "courier-1",
			status: "pending",
			fee: 700,
			proof: {
				handoverMethod: "seller_declaration",
				capturedAt: "",
				photoUrl: "/api/delivery-proofs/files/proof-shop?ttl=600",
				codeVerified: false,
			},
			timeline: [],
			riderLink: {
				createdAt: "2026-10-01T10:00:00.000Z",
				expiresAt: "2026-10-04T10:00:00.000Z",
				revokedAt: null,
				lastUsedAt: null,
			},
			courierCost: 450,
		});
		expect(JSON.stringify(view)).not.toContain("secret-hash");
		const shopMember = payload.store["shop-members"]?.find(
			(member) => member.shop === "shop-2",
		);
		if (!shopMember) throw new Error("fulfilling shop membership expected");
		shopMember.role = "staff";
		const staffView = await shipmentViewFor(payload, shipment, {
			id: "seller-1",
			role: "user",
		});
		expect(staffView).not.toHaveProperty("courierCost");
	});

	it("includes the buyer pickup point and deadline without exposing the full location record", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-pickup",
					buyer: "buyer-pickup",
					shop: "shop-pickup",
				},
			],
			"shop-locations": [
				{
					id: "location-1",
					shop: "shop-pickup",
					name: "Akwa pickup desk",
					landmark: "Beside the central market",
					address: "Rue Joss",
					gps: { lat: 4.05, lng: 9.7 },
					openingHours: [
						{ day: "mon", opens: "09:00", closes: "18:00" },
						{ day: "sat", opens: "09:00", closes: "13:00" },
					],
				},
			],
			shipments: [
				{
					id: "shipment-pickup",
					shipmentNumber: "SHP-PICKUP",
					order: "order-pickup",
					storefrontShop: "shop-pickup",
					fulfillingShop: "shop-pickup",
					method: "pickup",
					carrier: "self",
					status: "pending",
					fee: 0,
					pickupLocation: "location-1",
					pickupDeadline: "2026-10-10T17:00:00.000Z",
				},
			],
		});
		const shipment = await payload.findByID({
			collection: "shipments",
			id: "shipment-pickup",
			depth: 0,
			overrideAccess: true,
		});

		const view = await shipmentViewFor(payload, shipment, {
			id: "buyer-pickup",
			role: "user",
		});

		expect(view).toMatchObject({
			method: "pickup",
			pickup: {
				locationName: "Akwa pickup desk",
				landmark: "Beside the central market",
				address: "Rue Joss",
				gps: { lat: 4.05, lng: 9.7 },
				hours: "mon 09:00-18:00, sat 09:00-13:00",
				pickupDeadline: "2026-10-10T17:00:00.000Z",
			},
		});
		expect(JSON.stringify(view)).not.toContain("openingHours");
	});

	it("projects courier data without exposing item prices and only to courier members", async () => {
		const payload = fakePayload({
			users: [{ id: "dispatcher-1", role: "user", name: "Dispatcher" }],
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
			shops: [{ id: "shop-1", name: "Shop One" }],
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					buyer: "buyer-1",
					shop: "shop-1",
					paymentMethod: "cod",
					amounts: { total: 12500 },
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					quantity: 2,
					unitPrice: 9999,
					snapshot: { title: "Phone" },
				},
				{
					id: "item-2",
					order: "order-1",
					quantity: 1,
					unitPrice: 7000,
					snapshot: { title: "PRIVATE_OTHER_PARCEL_ITEM" },
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
					courier: "courier-1",
					status: "pending",
					fee: 700,
					rider: {
						user: "rider-1",
						name: "Rider One",
						phone: "+237600000003",
					},
					items: [{ orderItem: "item-1", quantity: 2 }],
					origin: {},
					destination: {
						recipientName: "Aicha Ngu",
						phone: "+237600000002",
						city: "Douala",
						district: "Akwa",
						landmark: "Market",
						gps: { lat: 4.05, lng: 9.7 },
					},
				},
			],
		});
		const shipment = await payload.findByID({
			collection: "shipments",
			id: "shipment-1",
			depth: 0,
			overrideAccess: true,
		});

		const view = await shipmentViewFor(payload, shipment, {
			id: "dispatcher-1",
			role: "user",
		});

		expect(view).toEqual({
			id: "shipment-1",
			shipmentNumber: "SHP-1",
			status: "pending",
			storefrontName: "Shop One",
			destination: {
				recipientFirstName: "Aicha",
				phone: "+237600000002",
				city: "Douala",
				district: "Akwa",
				landmark: "Market",
				gps: { lat: 4.05, lng: 9.7 },
			},
			expectedCod: 12500,
			items: [{ title: "Phone", quantity: 2 }],
			attempts: [],
			proof: null,
			allowedActions: ["picked_up"],
		});
		if (!("items" in view)) throw new Error("courier projection expected");
		expect(view.items).toEqual([{ title: "Phone", quantity: 2 }]);
		expect(JSON.stringify(view)).not.toContain("9999");
		expect(JSON.stringify(view)).not.toContain("PRIVATE_OTHER_PARCEL_ITEM");
		const riderView = await shipmentViewFor(payload, shipment, {
			id: "rider-1",
			role: "user",
		});
		expect(riderView).toEqual(view);
		const inTransitView = await shipmentViewFor(
			payload,
			{ ...shipment, status: "in_transit" },
			{ id: "dispatcher-1", role: "user" },
		);
		if (!("destination" in inTransitView)) {
			throw new Error("courier projection expected");
		}
		expect(inTransitView.destination).toMatchObject({ phone: "+237600000002" });
		const finalFailureView = await shipmentViewFor(
			payload,
			{
				...shipment,
				status: "failed",
				finalFailure: {
					reason: "absent",
					at: "2026-10-01T12:00:00.000Z",
					returnInitiatedAt: "2026-10-01T12:00:00.000Z",
				},
			},
			{ id: "dispatcher-1", role: "user" },
		);
		if (!("destination" in finalFailureView)) {
			throw new Error("courier projection expected");
		}
		expect(finalFailureView.destination).toMatchObject({ phone: null });
		const deliveredView = await shipmentViewFor(
			payload,
			{ ...shipment, status: "delivered" },
			{ id: "rider-1", role: "user" },
		);
		if (!("destination" in deliveredView)) {
			throw new Error("courier projection expected");
		}
		expect(deliveredView.destination).toMatchObject({ phone: null });
		await expect(
			shipmentViewFor(payload, shipment, { id: "stranger-1", role: "user" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("confirms a courier remittance for the shop owner and records the event", async () => {
		const payload = remittanceWorld();
		const shipment = await payload.findByID({
			collection: "shipments",
			id: "shipment-1",
			depth: 0,
			overrideAccess: true,
		});
		const result = await withTransaction(
			payload,
			(req) =>
				confirmShipmentRemittance(
					req,
					shipment,
					{ id: "seller-1", role: "user" },
					"confirm",
				),
			{ user: { id: "seller-1", role: "user" } },
		);

		expect(result.codCollection?.remittanceStatus).toBe("confirmed");
		expect(payload.store["shipment-events"]).toMatchObject([
			{ type: "shipment.cod_remittance_confirmed", actor: "seller-1" },
		]);
	});

	it("creates a shipment report atomically when the owner disputes remittance", async () => {
		const payload = remittanceWorld();
		const shipment = await payload.findByID({
			collection: "shipments",
			id: "shipment-1",
			depth: 0,
			overrideAccess: true,
		});
		const result = await withTransaction(
			payload,
			(req) =>
				confirmShipmentRemittance(
					req,
					shipment,
					{ id: "seller-1", role: "user" },
					"dispute",
					"Courier has not paid the cash",
				),
			{ user: { id: "seller-1", role: "user" } },
		);

		expect(result.codCollection?.remittanceStatus).toBe("disputed");
		expect(result.flags).toContain("cod_remittance_disputed");
		expect(payload.store.reports).toMatchObject([
			{
				targetType: "shipment",
				targetId: "shipment-1",
				reason: "cod_remittance",
				description: "Courier has not paid the cash",
			},
		]);
		expect(payload.store["shipment-events"]).toMatchObject([
			{ type: "shipment.cod_remittance_disputed", actor: "seller-1" },
		]);
	});

	it("rolls back the remittance, report and event in one failed transaction", async () => {
		const payload = remittanceWorld();
		const shipment = await payload.findByID({
			collection: "shipments",
			id: "shipment-1",
			depth: 0,
			overrideAccess: true,
		});
		await expect(
			withTransaction(
				payload,
				async (req) => {
					await confirmShipmentRemittance(
						req,
						shipment,
						{ id: "seller-1", role: "user" },
						"dispute",
					);
					throw new Error("forced transaction failure");
				},
				{ user: { id: "seller-1", role: "user" } },
			),
		).rejects.toThrow("forced transaction failure");

		expect(payload.store.shipments?.[0]).toMatchObject({
			codCollection: { remittanceStatus: "declared_remitted" },
		});
		expect(payload.store.reports).toHaveLength(0);
		expect(payload.store["shipment-events"]).toHaveLength(0);
	});
});

function remittanceWorld() {
	return fakePayload({
		users: [{ id: "seller-1", role: "user", name: "Seller" }],
		"shop-members": [
			{
				id: "shop-member-1",
				shop: "shop-1",
				user: "seller-1",
				role: "owner",
				status: "active",
			},
		],
		shops: [{ id: "shop-1", name: "Shop One", status: "active" }],
		orders: [{ id: "order-1", shop: "shop-1", buyer: "buyer-1" }],
		shipments: [
			{
				id: "shipment-1",
				shipmentNumber: "SHP-1",
				order: "order-1",
				storefrontShop: "shop-1",
				fulfillingShop: "shop-1",
				method: "courier",
				carrier: "courier",
				status: "delivered",
				fee: 700,
				codCollection: {
					expectedAmount: 12500,
					collectedBy: "courier",
					collectedAmount: 12500,
					remittanceStatus: "declared_remitted",
				},
			},
		],
	});
}
