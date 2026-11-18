// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	advanceReturnCases,
	cancelReturn,
	getReturnCaseView,
	listReturnCases,
	respondToReturnDeduction,
	shipReturn,
} from "../../src/services/returns";
import { fakePayload } from "./helpers/fakePayload";

describe("return lifecycle", () => {
	it("offers buyer refund actions only after the seller submits proof", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					buyer: "buyer-1",
					shop: "shop-1",
					paymentMethod: "cod",
				},
			],
			"return-cases": [
				{
					id: "pending",
					number: "RET-PENDING",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "refund_pending",
					refund: { channel: "seller_direct", amount: 5000 },
				},
				{
					id: "proven",
					number: "RET-PROVEN",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "refund_pending",
					refund: {
						channel: "seller_direct",
						amount: 5000,
						sellerProof: { evidence: "proof-1" },
					},
				},
			],
		});
		expect(
			(await getReturnCaseView(payload, { id: "buyer-1" }, "pending"))
				.allowedActions,
		).toEqual(["upload_evidence"]);
		expect(
			(await getReturnCaseView(payload, { id: "buyer-1" }, "proven"))
				.allowedActions,
		).toEqual(["confirm_refund", "contest_refund", "upload_evidence"]);
	});
	it("offers the seller refund proof for protected-payment fallback but not a provider refund", async () => {
		const payload = fakePayload({
			"shop-members": [
				{
					id: "member-1",
					shop: "shop-1",
					user: "owner-1",
					status: "active",
					role: "owner",
				},
			],
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					paymentMethod: "mobile_money",
				},
			],
			"return-cases": [
				{
					id: "direct",
					number: "RET-D",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "refund_pending",
					refund: { amount: 5000, channel: "seller_direct" },
				},
				{
					id: "provider",
					number: "RET-P",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "refund_pending",
					refund: { amount: 5000, channel: "provider" },
				},
			],
		});
		expect(
			(await getReturnCaseView(payload, { id: "owner-1" }, "direct"))
				.allowedActions,
		).toContain("refund_proof");
		expect(
			(await getReturnCaseView(payload, { id: "owner-1" }, "provider"))
				.allowedActions,
		).toEqual(["upload_evidence"]);
	});
	it("moves an accepted inspection deduction to the refund queue", async () => {
		const now = new Date("2026-10-04T12:00:00.000Z");
		const payload = fakePayload({
			"return-cases": [
				{
					id: "ret-deduction",
					number: "RET-D1",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "inspected",
					deadlines: {
						deductionRespondBy: new Date(now.getTime() + 1000).toISOString(),
					},
					items: [
						{
							orderItem: "item-1",
							quantity: 1,
							inspection: { deductionAmount: 500 },
						},
					],
					statusHistory: [{ status: "inspected", actorType: "seller" }],
				},
			],
		});

		const result = await respondToReturnDeduction(
			payload,
			{ id: "buyer-1" },
			"ret-deduction",
			"accept",
			now,
		);

		expect(result.status).toBe("refund_pending");
		expect(result.statusHistory).toHaveLength(2);
		expect(result.statusHistory?.[1]).toMatchObject({
			status: "refund_pending",
			actorType: "buyer",
		});
	});

	it("opens one system dispute when an inspection deduction times out", async () => {
		const now = new Date("2026-10-04T12:00:00.000Z");
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "delivered",
					paymentMethod: "cod",
					paymentStatus: "cod_collected",
					amounts: { subtotal: 10_000, deliveryFee: 1_000, total: 11_000 },
					timestamps: { deliveredAt: "2026-10-01T00:00:00.000Z" },
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					title: "Item",
					quantity: 1,
					unitPrice: 10_000,
				},
			],
			"return-cases": [
				{
					id: "ret-timeout",
					number: "RET-TIMEOUT",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "inspected",
					deadlines: { deductionRespondBy: now.toISOString() },
					items: [
						{
							orderItem: "item-1",
							quantity: 1,
							unitPrice: 10_000,
							inspection: { outcome: "damaged_by_buyer", deductionAmount: 500 },
						},
					],
					statusHistory: [{ status: "inspected", actorType: "seller" }],
				},
			],
			"order-events": [],
			disputes: [],
		});

		expect(await advanceReturnCases(payload, now)).toMatchObject({
			deductionContested: ["ret-timeout"],
		});
		expect(await advanceReturnCases(payload, now)).toMatchObject({
			deductionContested: [],
		});
		expect(payload.store.disputes).toHaveLength(1);
		expect(payload.store.disputes?.[0]).toMatchObject({
			reason: "damaged",
			openedByType: "system",
			status: "under_review",
		});
		expect(payload.store["return-cases"]?.[0]).toMatchObject({
			status: "disputed",
			dispute: payload.store.disputes?.[0]?.id,
		});
	});

	it("records buyer shipment and courier tracking exactly once in the timeline", async () => {
		const payload = fakePayload({
			"return-cases": [
				{
					id: "ret-1",
					number: "RET-1",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					returnRequired: true,
					returnMethod: "courier",
					status: "awaiting_shipment",
					statusHistory: [{ status: "awaiting_shipment", actorType: "system" }],
				},
			],
		});
		const result = await shipReturn(
			payload,
			{ id: "buyer-1" },
			"ret-1",
			{ returnMethod: "courier", returnTracking: "  TRACK-123  " },
			new Date("2026-10-04T12:00:00.000Z"),
		);

		expect(result.status).toBe("in_transit");
		expect(result.returnTracking).toBe("TRACK-123");
		expect(result.shippedAt).toBe("2026-10-04T12:00:00.000Z");
		expect(result.statusHistory).toHaveLength(2);
		expect(result.statusHistory?.[1]).toMatchObject({
			status: "in_transit",
			actorType: "buyer",
			actor: "buyer-1",
		});
	});

	it("releases the return hold and restores item fulfillment when a buyer cancels", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "delivered",
					paymentMethod: "cod",
					paymentStatus: "cod_collected",
					completionHold: "return_case",
					returnCase: "ret-1",
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					fulfillmentStatus: "return_requested",
				},
			],
			"order-events": [],
			"payout-holds": [
				{
					id: "hold-1",
					scope: "order",
					order: "order-1",
					shop: "shop-1",
					reason: "return_open",
					status: "active",
				},
			],
			"return-cases": [
				{
					id: "ret-1",
					number: "RET-1",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "awaiting_shipment",
					items: [{ orderItem: "item-1", quantity: 1, unitPrice: 5000 }],
				},
			],
		});

		const result = await cancelReturn(payload, { id: "buyer-1" }, "ret-1");

		expect(result.status).toBe("cancelled");
		expect(payload.store.orders?.[0]).toMatchObject({
			completionHold: "none",
			returnCase: null,
		});
		expect(payload.store["order-items"]?.[0]?.fulfillmentStatus).toBe(
			"delivered",
		);
		expect(payload.store["payout-holds"]?.[0]?.status).toBe("released");
		expect(payload.store["order-events"]).toHaveLength(1);
		expect(payload.store["order-events"]?.[0]?.type).toBe(
			"order.return_cancelled",
		);
	});

	it("returns a buyer-scoped view with server-decided actions", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					paymentMethod: "cod",
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					snapshot: { title: "Table" },
					quantity: 1,
					fulfillmentStatus: "return_requested",
				},
			],
			"return-cases": [
				{
					id: "ret-1",
					number: "RET-1",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "awaiting_shipment",
					returnMethod: "courier",
					items: [{ orderItem: "item-1", quantity: 1, unitPrice: 5000 }],
					statusHistory: [
						{
							status: "awaiting_shipment",
							actorType: "system",
							at: "2026-10-01T00:00:00.000Z",
						},
					],
				},
			],
		});

		const view = await getReturnCaseView(payload, { id: "buyer-1" }, "ret-1");
		expect(view).toMatchObject({
			id: "ret-1",
			orderId: "order-1",
			orderNumber: "BNS-1",
			items: [
				{ orderItemId: "item-1", title: "Table", quantity: 1, unitPrice: 5000 },
			],
			allowedActions: ["ship", "cancel", "upload_evidence"],
		});
		await expect(
			getReturnCaseView(payload, { id: "stranger" }, "ret-1"),
		).rejects.toMatchObject({ status: 404 });
	});

	it("lists return cases with deadlines and caller action counts", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					paymentMethod: "cod",
				},
				{
					id: "order-2",
					orderNumber: "BNS-2",
					buyer: "buyer-1",
					shop: "shop-1",
					paymentMethod: "cod",
				},
			],
			"return-cases": [
				{
					id: "open",
					number: "RET-OPEN",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "awaiting_shipment",
					deadlines: { shipBy: "2026-10-03T00:00:00.000Z" },
					refund: { amount: 5000 },
					createdAt: "2026-10-01T00:00:00.000Z",
				},
				{
					id: "other",
					number: "RET-OTHER",
					basis: "withdrawal",
					order: "order-2",
					shop: "shop-1",
					buyer: "buyer-2",
					openedByType: "buyer",
					status: "refund_pending",
					createdAt: "2026-10-02T00:00:00.000Z",
				},
			],
		});

		const result = await listReturnCases(
			payload,
			{ id: "buyer-1" },
			{},
			new Date("2026-10-04T00:00:00.000Z"),
		);
		expect(result).toEqual({
			rows: [
				{
					id: "open",
					number: "RET-OPEN",
					orderNumber: "BNS-1",
					basis: "withdrawal",
					status: "awaiting_shipment",
					refundAmount: 5000,
					nextDeadline: "2026-10-03T00:00:00.000Z",
					overdue: true,
					createdAt: "2026-10-01T00:00:00.000Z",
				},
			],
			awaitingCount: 1,
		});
		expect(
			await listReturnCases(
				payload,
				{ id: "buyer-1" },
				{ overdue: true },
				new Date("2026-10-04T00:00:00.000Z"),
			),
		).toMatchObject({ rows: [{ id: "open" }], awaitingCount: 1 });
	});

	it("rejects an expired unapproved request once and leaves later requests open", async () => {
		const payload = fakePayload({
			"return-cases": [
				{
					id: "expired",
					number: "RET-OLD",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "requested",
					deadlines: { requestDeadline: "2026-10-03T00:00:00.000Z" },
					statusHistory: [{ status: "requested", actorType: "buyer" }],
				},
				{
					id: "current",
					number: "RET-CURRENT",
					basis: "withdrawal",
					order: "order-2",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "requested",
					deadlines: { requestDeadline: "2026-10-05T00:00:00.000Z" },
					statusHistory: [{ status: "requested", actorType: "buyer" }],
				},
			],
		});
		const now = new Date("2026-10-04T00:00:00.000Z");

		expect(await advanceReturnCases(payload, now)).toEqual({
			rejected: ["expired"],
			expired: [],
			pickupWaived: [],
			received: [],
			inspected: [],
			deductionContested: [],
		});
		expect(await advanceReturnCases(payload, now)).toEqual({
			rejected: [],
			expired: [],
			pickupWaived: [],
			received: [],
			inspected: [],
			deductionContested: [],
		});
		expect(payload.store["return-cases"][0]).toMatchObject({
			status: "rejected",
			rejectionReason: "request_deadline_elapsed",
		});
		expect(payload.store["return-cases"][0]?.statusHistory).toHaveLength(2);
		expect(payload.store["return-cases"][1]?.status).toBe("requested");
	});

	it("expires an unshipped return at its deadline without clearing an active dispute hold", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "delivered",
					paymentMethod: "cod",
					paymentStatus: "cod_collected",
					completionHold: "return_case",
					returnCase: "ret-1",
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					fulfillmentStatus: "return_requested",
				},
			],
			"order-events": [],
			"payout-holds": [
				{
					id: "hold-1",
					scope: "order",
					order: "order-1",
					shop: "shop-1",
					reason: "return_open",
					status: "active",
				},
			],
			disputes: [{ id: "dispute-1", order: "order-1", status: "under_review" }],
			"return-cases": [
				{
					id: "ret-1",
					number: "RET-1",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "awaiting_shipment",
					deadlines: { shipBy: "2026-10-04T00:00:00.000Z" },
					items: [{ orderItem: "item-1", quantity: 1, unitPrice: 5000 }],
				},
			],
		});
		const now = new Date("2026-10-04T00:00:00.000Z");

		expect(await advanceReturnCases(payload, now)).toEqual({
			rejected: [],
			expired: ["ret-1"],
			pickupWaived: [],
			received: [],
			inspected: [],
			deductionContested: [],
		});
		expect(await advanceReturnCases(payload, now)).toEqual({
			rejected: [],
			expired: [],
			pickupWaived: [],
			received: [],
			inspected: [],
			deductionContested: [],
		});
		expect(payload.store.orders?.[0]).toMatchObject({
			completionHold: "dispute",
			returnCase: null,
		});
		expect(payload.store["order-items"]?.[0]?.fulfillmentStatus).toBe(
			"delivered",
		);
		expect(payload.store["payout-holds"]?.[0]?.status).toBe("released");
		expect(payload.store["order-events"]).toHaveLength(1);
		expect(payload.store["order-events"]?.[0]?.type).toBe(
			"order.return_expired",
		);
	});

	it("waives seller pickup once its own deadline elapses and queues the refund state", async () => {
		const payload = fakePayload({
			orders: [],
			"return-cases": [
				{
					id: "ret-pickup",
					number: "RET-PICKUP",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					returnRequired: true,
					returnMethod: "seller_pickup",
					status: "awaiting_shipment",
					deadlines: { pickupBy: "2026-10-04T00:00:00.000Z" },
				},
			],
		});

		expect(
			await advanceReturnCases(payload, new Date("2026-10-04T00:00:00.000Z")),
		).toMatchObject({ pickupWaived: ["ret-pickup"] });
		expect(
			await advanceReturnCases(payload, new Date("2026-10-04T00:00:00.000Z")),
		).toMatchObject({ pickupWaived: [] });
		expect(payload.store["return-cases"]?.[0]).toMatchObject({
			status: "refund_pending",
			returnRequired: false,
		});
	});

	it("presumes receipt only after the configured window and with shipping proof", async () => {
		const payload = fakePayload({
			"return-cases": [
				{
					id: "tracked",
					number: "RET-TRACKED",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "in_transit",
					returnMethod: "courier",
					returnTracking: "TRACKED",
					shippedAt: "2026-09-26T00:00:00.000Z",
					statusHistory: [{ status: "in_transit", actorType: "buyer" }],
				},
				{
					id: "unproven",
					number: "RET-UNPROVEN",
					basis: "withdrawal",
					order: "order-2",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "in_transit",
					returnMethod: "buyer_drop_off",
					shippedAt: "2026-09-26T00:00:00.000Z",
					statusHistory: [{ status: "in_transit", actorType: "buyer" }],
				},
			],
			"dispute-evidence": [],
		});
		const now = new Date("2026-10-04T00:00:00.000Z");

		expect(await advanceReturnCases(payload, now)).toEqual({
			rejected: [],
			expired: [],
			pickupWaived: [],
			received: ["tracked"],
			inspected: [],
			deductionContested: [],
		});
		expect(await advanceReturnCases(payload, now)).toEqual({
			rejected: [],
			expired: [],
			pickupWaived: [],
			received: [],
			inspected: [],
			deductionContested: [],
		});
		expect(payload.store["return-cases"][0]).toMatchObject({
			status: "received",
			receivedAt: now.toISOString(),
			deadlines: {
				inspectBy: "2026-10-07T00:00:00.000Z",
				refundBy: "2026-10-19T00:00:00.000Z",
			},
		});
		expect(payload.store["return-cases"][1]?.status).toBe("in_transit");
	});

	it("restocks a return after the inspection deadline and does it once", async () => {
		const payload = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "BNS-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "delivered",
					paymentMethod: "cod",
					delivery: { fee: 1000 },
					amounts: { subtotal: 5000, deliveryFee: 1000 },
				},
			],
			products: [{ id: "product-1", shop: "shop-1", title: "Table" }],
			"product-variants": [
				{
					id: "variant-1",
					product: "product-1",
					shop: "shop-1",
					price: 5000,
					trackInventory: true,
					stockOnHand: 0,
					stockReserved: 0,
				},
			],
			"order-items": [
				{
					id: "item-1",
					order: "order-1",
					product: "product-1",
					variant: "variant-1",
					fulfillingShop: "shop-1",
					snapshot: { title: "Table" },
					unitPrice: 5000,
					quantity: 1,
					fulfillmentStatus: "delivered",
				},
			],
			"return-cases": [
				{
					id: "ret-inspect",
					number: "RET-I",
					basis: "withdrawal",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					openedByType: "buyer",
					status: "received",
					items: [
						{
							orderItem: "item-1",
							variant: "variant-1",
							quantity: 1,
							unitPrice: 5000,
						},
					],
					deadlines: { inspectBy: "2026-10-03T00:00:00.000Z" },
					statusHistory: [{ status: "received", actorType: "seller" }],
				},
			],
			"stock-movements": [],
		});
		const now = new Date("2026-10-04T00:00:00.000Z");

		expect(await advanceReturnCases(payload, now)).toMatchObject({
			inspected: ["ret-inspect"],
		});
		expect(await advanceReturnCases(payload, now)).toMatchObject({
			inspected: [],
		});
		expect(payload.store["return-cases"][0]).toMatchObject({
			status: "refund_pending",
			items: [{ inspection: { outcome: "restock", deductionAmount: 0 } }],
		});
		expect(payload.store["stock-movements"]).toMatchObject([
			{ type: "return", quantity: 1, stockAfter: 1 },
		]);
		expect(payload.store["stock-movements"]).toHaveLength(1);
		expect(payload.store["product-variants"][0]?.stockOnHand).toBe(1);
	});
});
