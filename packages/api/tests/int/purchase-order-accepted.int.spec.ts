// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OrderEvent } from "../../src/payload-types";
import { runOrderEventHandlers } from "../../src/services/orders/events";
import {
	acceptPurchaseOrder,
	createPurchaseOrderForAcceptedOrder,
	registerPurchaseOrderOrderEvents,
} from "../../src/services/purchaseOrders";
import { fakePayload } from "./helpers/fakePayload";

describe("purchase order creation after order acceptance", () => {
	it("creates one supplier purchase order from resale order item snapshots", async () => {
		const payload = fakePayload(
			{
				orders: [
					{
						id: "order-1",
						orderNumber: "BNS-2609-0001",
						shop: "reseller-1",
						status: "accepted",
						paymentMethod: "cod",
						amounts: { deliveryFee: 2_000, total: 17_000 },
						createdAt: "2026-09-15T10:00:00.000Z",
					},
				],
				"order-items": [
					{
						id: "item-1",
						order: "order-1",
						sourcing: "resale",
						fulfillingShop: "supplier-1",
						resaleLink: "link-1",
						variant: "variant-1",
						unitPrice: 15_000,
						supplierUnitPrice: 10_000,
						quantity: 1,
						commissionAmount: 1_200,
						snapshot: { title: "Phone", variantLabel: "Blue", sku: "P-1" },
					},
				],
				shops: [
					{
						id: "reseller-1",
						name: "Reseller Shop",
						handle: "reseller",
						contact: { phone: "+237600000001" },
					},
				],
				sequences: [],
			},
			{ uniques: { sequences: [["key"]], "purchase-orders": [["order"]] } },
		);
		const order = await payload.findByID({
			collection: "orders",
			id: "order-1",
			depth: 0,
			overrideAccess: true,
		});

		const unregister = registerPurchaseOrderOrderEvents();
		const event: OrderEvent = {
			id: "order-accepted-event-1",
			order: "order-1",
			type: "order.accepted",
			actorType: "seller",
			visibility: "both",
			createdAt: "2026-09-15T10:00:00.000Z",
			updatedAt: "2026-09-15T10:00:00.000Z",
		};
		const failed = await runOrderEventHandlers(payload, order, event);
		unregister();
		const purchaseOrders = await payload.find({
			collection: "purchase-orders",
			limit: 10,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		const purchaseOrder = purchaseOrders.docs[0];
		if (!purchaseOrder) throw new Error("purchase order was not created");
		const replay = await createPurchaseOrderForAcceptedOrder(
			payload,
			order,
			new Date("2026-09-15T10:00:01.000Z"),
		);

		expect(purchaseOrder).toMatchObject({
			number: "PO-2609-0001",
			order: "order-1",
			supplierShop: "supplier-1",
			resellerShop: "reseller-1",
			link: "link-1",
			status: "sent",
			supplierAmount: 10_000,
			deliveryFee: 2_000,
			collectAmount: 17_000,
			platformCommission: 1_200,
			resellerCommission: 3_800,
			branding: {
				name: "Reseller Shop",
				handle: "reseller",
				phone: "+237600000001",
			},
			items: [
				{
					orderItem: "item-1",
					variant: "variant-1",
					title: "Phone",
					variantLabel: "Blue",
					sku: "P-1",
					quantity: 1,
					supplierUnitPrice: 10_000,
					resellerUnitPrice: 15_000,
				},
			],
		});
		expect(payload.store["order-items"]?.[0]?.purchaseOrder).toBe(
			purchaseOrder.id,
		);
		expect(failed).toEqual([]);
		expect(replay?.id).toBe(purchaseOrder.id);
		expect(payload.store["purchase-orders"]).toHaveLength(1);
		expect(payload.store["reseller-commissions"]).toHaveLength(1);
		expect(payload.store["reseller-commissions"]?.[0]).toMatchObject({
			purchaseOrder: purchaseOrder.id,
			resellerShop: "reseller-1",
			supplierShop: "supplier-1",
			saleAmount: 15_000,
			supplierAmount: 10_000,
			platformCommission: 1_200,
			amount: 3_800,
			status: "accrued",
			paymentMethod: "cod",
		});
		expect(payload.store["order-events"]).toHaveLength(1);
	});

	it("lets the supplier accept before the deadline and derives the ship deadline", async () => {
		const payload = fakePayload(
			{
				shops: [
					{
						id: "supplier-1",
						owner: "supplier-user",
						name: "Supplier",
						status: "active",
					},
				],
				orders: [
					{
						id: "order-1",
						orderNumber: "BNS-2609-0001",
						shop: "reseller-1",
						status: "accepted",
						paymentMethod: "cod",
						paymentStatus: "cod_pending",
					},
				],
				"shop-members": [
					{
						id: "supplier-member",
						shop: "supplier-1",
						user: "supplier-user",
						role: "owner",
						status: "active",
					},
				],
				products: [{ id: "product-1", resale: { handlingHours: 36 } }],
				"order-items": [{ id: "order-item-1", product: "product-1" }],
				"purchase-orders": [
					{
						id: "po-1",
						order: "order-1",
						supplierShop: "supplier-1",
						resellerShop: "reseller-1",
						status: "sent",
						acceptBy: "2026-09-16T10:00:00.000Z",
						items: [{ orderItem: "order-item-1" }],
						statusHistory: [{ status: "sent", source: "order.accepted" }],
					},
				],
			},
			{ globals: { "app-settings": { resale: { poAcceptHours: 24 } } } },
		);

		const purchaseOrder = await acceptPurchaseOrder(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			new Date("2026-09-15T10:00:00.000Z"),
		);

		expect(purchaseOrder).toMatchObject({
			status: "accepted",
			acceptedAt: "2026-09-15T10:00:00.000Z",
			shipBy: "2026-09-16T22:00:00.000Z",
			statusHistory: [
				{ status: "sent", source: "order.accepted" },
				{
					status: "accepted",
					source: "supplier.accepted",
					actor: "supplier-user",
				},
			],
		});
	});

	it("creates and links the P7 shipment when delivery zones are enabled", async () => {
		const payload = fakePayload(
			{
				shops: [
					{
						id: "supplier-1",
						owner: "supplier-user",
						status: "active",
						level: 3,
					},
					{ id: "reseller-1", status: "active", level: 2 },
				],
				"shop-members": [
					{
						id: "supplier-member",
						shop: "supplier-1",
						user: "supplier-user",
						role: "owner",
						status: "active",
					},
				],
				orders: [
					{
						id: "order-1",
						orderNumber: "BNS-2609-0001",
						shop: "reseller-1",
						buyer: "buyer-1",
						status: "accepted",
						paymentMethod: "cod",
						paymentStatus: "cod_pending",
						delivery: {
							method: "seller_delivery",
							recipientName: "Buyer",
							phone: "+237600000000",
							city: "douala",
						},
						amounts: { total: 15_000, deliveryFee: 0 },
					},
				],
				"order-items": [
					{
						id: "item-1",
						order: "order-1",
						sourcing: "resale",
						fulfillingShop: "supplier-1",
						resaleLink: "link-1",
						product: "product-1",
						variant: "variant-1",
						unitPrice: 15_000,
						supplierUnitPrice: 10_000,
						quantity: 1,
						commissionAmount: 1_200,
						snapshot: { title: "Phone" },
						fulfillmentStatus: "unfulfilled",
					},
				],
				products: [{ id: "product-1", resale: { handlingHours: 24 } }],
				"shop-locations": [
					{
						id: "origin-1",
						shop: "supplier-1",
						name: "Warehouse",
						city: "douala",
						district: "Akwa",
						landmark: "Main road",
						active: true,
						isDispatchOrigin: true,
						isDefaultOrigin: true,
					},
				],
				"purchase-orders": [
					{
						id: "po-1",
						number: "PO-2609-0001",
						order: "order-1",
						supplierShop: "supplier-1",
						resellerShop: "reseller-1",
						link: "link-1",
						status: "sent",
						paymentMethod: "cod",
						items: [{ orderItem: "item-1" }],
						supplierAmount: 10_000,
						deliveryFee: 0,
						collectAmount: 15_000,
						platformCommission: 1_200,
						resellerCommission: 3_800,
						branding: { name: "Reseller", handle: "reseller" },
						acceptBy: "2026-09-16T10:00:00.000Z",
						statusHistory: [{ status: "sent", source: "order.accepted" }],
					},
				],
				sequences: [],
			},
			{
				globals: {
					"app-settings": {
						resale: { poAcceptHours: 24 },
						delivery: { zonesEnabled: true },
					},
				},
				uniques: { sequences: [["key"]], "purchase-orders": [["order"]] },
			},
		);

		const accepted = await acceptPurchaseOrder(
			payload,
			{ id: "supplier-user", role: "user" },
			"po-1",
			new Date("2026-09-15T10:00:00.000Z"),
		);

		expect(payload.store.shipments).toHaveLength(1);
		expect(accepted).toMatchObject({
			status: "accepted",
			tracking: { shipment: payload.store.shipments?.[0]?.id },
		});
		expect(payload.store.orders?.[0]?.status).toBe("accepted");

		const unregister = registerPurchaseOrderOrderEvents();
		const order = await payload.findByID({
			collection: "orders",
			id: "order-1",
			depth: 0,
			overrideAccess: true,
		});
		const shippedEvent: OrderEvent = {
			id: "event-shipped",
			order: "order-1",
			type: "order.shipped",
			actorType: "seller",
			visibility: "both",
			createdAt: "2026-09-15T11:00:00.000Z",
			updatedAt: "2026-09-15T11:00:00.000Z",
		};
		expect(await runOrderEventHandlers(payload, order, shippedEvent)).toEqual(
			[],
		);
		expect(payload.store["purchase-orders"]?.[0]).toMatchObject({
			status: "shipped",
			tracking: {
				carrier: "own_courier",
				shipment: payload.store.shipments?.[0]?.id,
			},
		});
		const deliveredEvent: OrderEvent = {
			...shippedEvent,
			id: "event-delivered",
			type: "order.delivered",
			createdAt: "2026-09-15T12:00:00.000Z",
			updatedAt: "2026-09-15T12:00:00.000Z",
		};
		expect(await runOrderEventHandlers(payload, order, deliveredEvent)).toEqual(
			[],
		);
		expect(payload.store["purchase-orders"]?.[0]?.status).toBe("delivered");
		expect(await runOrderEventHandlers(payload, order, deliveredEvent)).toEqual(
			[],
		);
		expect(
			(
				await payload.findByID({
					collection: "purchase-orders",
					id: String(payload.store["purchase-orders"]?.[0]?.id),
				})
			).statusHistory?.filter((entry) => entry.status === "delivered"),
		).toHaveLength(1);
		const returnedEvent: OrderEvent = {
			...shippedEvent,
			id: "event-returned",
			type: "order.returned",
			createdAt: "2026-09-16T12:00:00.000Z",
			updatedAt: "2026-09-16T12:00:00.000Z",
		};
		expect(await runOrderEventHandlers(payload, order, returnedEvent)).toEqual(
			[],
		);
		expect(payload.store["purchase-orders"]?.[0]?.status).toBe("returned");
		unregister();
	});
});
