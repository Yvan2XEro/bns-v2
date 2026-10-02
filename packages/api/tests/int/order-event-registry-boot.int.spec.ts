// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * Every order-event handler registers itself as a side effect of its
 * module being loaded, so a handler module nothing in production imports is
 * a handler that never runs. This file loads only what `payload.config.ts`
 * loads (`src/jobs`) and the dispatcher, never a handler module by name —
 * the other order specs import `services/orders/chat` themselves, which is
 * exactly why none of them could see it was missing.
 */
const triggerNotificationEvent = vi.fn();
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: (...args: unknown[]) =>
		triggerNotificationEvent(...args),
	hasPushCredential: async () => true,
}));
vi.mock("../../src/services/shopMemberNotifications", () => ({
	notifyShopInboxMessage: vi.fn(),
}));
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: vi.fn(async () => ({ status: "sent" })),
}));

import "../../src/jobs";
import { __setSystemMessagePublisherForTests } from "../../src/hooks/systemMessageEvents";
import type { Order, OrderEvent } from "../../src/payload-types";
import { runOrderEventHandlers } from "../../src/services/orders/events";
import { fakePayload } from "./helpers/fakePayload";

function seed() {
	return fakePayload({
		users: [
			{ id: "u-buyer", role: "user", name: "Clara" },
			{ id: "u-owner", role: "user", name: "Aicha" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa",
				owner: "u-owner",
				status: "active",
			},
		],
		"shop-members": [],
		orders: [
			{
				id: "o-1",
				orderNumber: "BNS-2609-000123",
				shop: "s-1",
				buyer: "u-buyer",
				status: "placed",
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				delivery: { recipientName: "Clara", phone: "+237600000000" },
				amounts: { total: 47000, currency: "XAF" },
			},
		],
		"order-items": [
			{
				id: "oi-1",
				order: "o-1",
				lineNumber: 1,
				listing: "l-1",
				product: "p-1",
				variant: "v-1",
				fulfillingShop: "s-1",
				unitPrice: 47000,
				quantity: 1,
				fulfillmentStatus: "unfulfilled",
			},
		],
		conversations: [],
		messages: [],
		"blocked-users": [],
	});
}

describe("the order-event registry as production loads it", () => {
	it("opens the order conversation and notifies the buyer on order.placed", async () => {
		__setSystemMessagePublisherForTests(async () => {});
		const payload = seed();
		const order = structuredClone(payload.store.orders[0]) as unknown as Order;
		const event: OrderEvent = {
			id: "ev-boot-placed",
			order: "o-1",
			type: "order.placed",
			visibility: "both",
			actorType: "buyer",
			createdAt: "2026-09-15T00:00:00.000Z",
			updatedAt: "2026-09-15T00:00:00.000Z",
		};

		const failed = await runOrderEventHandlers(payload, order, event);

		expect(failed).toEqual([]);
		expect(
			payload.store.conversations.map((c) => [c.order, c.buyer, c.shop]),
		).toEqual([["o-1", "u-buyer", "s-1"]]);
		expect(
			triggerNotificationEvent.mock.calls.map(
				([arg]) => (arg as { event: string; subscriberId: string }).event,
			),
		).toContain("order-placed");
	});
});
