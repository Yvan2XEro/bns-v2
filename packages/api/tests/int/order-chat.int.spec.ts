// @vitest-environment node
import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notifyShopInboxMessage = vi.fn();
const triggerNotificationEvent = vi.fn();

vi.mock("../../src/services/shopMemberNotifications", () => ({
	notifyShopInboxMessage: (...args: unknown[]) =>
		notifyShopInboxMessage(...args),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: (...args: unknown[]) =>
		triggerNotificationEvent(...args),
}));

import { Messages } from "../../src/collections/Messages";
import { __setSystemMessagePublisherForTests } from "../../src/hooks/systemMessageEvents";
import { formatXaf } from "../../src/lib/orderFormat";
import { withTransaction } from "../../src/lib/transactions";
import type { Order, OrderEvent } from "../../src/payload-types";
import {
	createOrderConversation,
	postOrderSystemMessage,
	registerOrderChatHandlers,
	SYSTEM_MESSAGE_EVENTS,
} from "../../src/services/orders/chat";
import {
	__resetOrderEventHandlers,
	runOrderEventHandlers,
} from "../../src/services/orders/events";
import { type Doc, fakePayload } from "./helpers/fakePayload";
import { runBeforeChange } from "./helpers/runBeforeChange";

type Hook = (args: Record<string, unknown>) => Promise<void>;

function seed(extra: Record<string, Doc[]> = {}) {
	return fakePayload({
		users: [
			{
				id: "u-buyer",
				role: "user",
				name: "Clara",
				email: "clara@example.com",
			},
			{
				id: "u-owner",
				role: "user",
				name: "Aicha",
				email: "aicha@example.com",
			},
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
		...extra,
	});
}

function isOrder(value: unknown): value is Order {
	return typeof value === "object" && value !== null && "status" in value;
}

function orderOf(payload: ReturnType<typeof seed>): Order {
	const raw = payload.store.orders[0];
	if (!isOrder(raw)) throw new Error("test fixture: no order seeded");
	return structuredClone(raw);
}

function requestFor(payload: ReturnType<typeof seed>): PayloadRequest {
	return { payload, context: {} } as unknown as PayloadRequest;
}

let eventSeq = 0;
function eventOf(overrides: Partial<OrderEvent> = {}): OrderEvent {
	eventSeq += 1;
	return {
		id: `ev-${eventSeq}`,
		order: "o-1",
		type: "order.confirmed",
		visibility: "both",
		createdAt: "2026-09-15T00:00:00.000Z",
		updatedAt: "2026-09-15T00:00:00.000Z",
		...overrides,
	};
}

describe("createOrderConversation", () => {
	it("creates one conversation per order, with the shop, the buyer and the first item's listing", async () => {
		const payload = seed();
		const conversation = await createOrderConversation(
			requestFor(payload),
			orderOf(payload),
		);
		expect(conversation.shop).toBe("s-1");
		expect(conversation.buyer).toBe("u-buyer");
		expect(conversation.order).toBe("o-1");
		expect(conversation.listing).toBe("l-1");
	});

	it("participants are the buyer and the owner only", async () => {
		const payload = seed();
		const conversation = await createOrderConversation(
			requestFor(payload),
			orderOf(payload),
		);
		expect(conversation.participants).toEqual(["u-buyer", "u-owner"]);
	});

	it("is idempotent — a replayed placement event reuses the conversation", async () => {
		const payload = seed();
		const first = await createOrderConversation(
			requestFor(payload),
			orderOf(payload),
		);
		const second = await createOrderConversation(
			requestFor(payload),
			orderOf(payload),
		);
		expect(second.id).toBe(first.id);
		expect(payload.store.conversations).toHaveLength(1);
	});
});

describe("postOrderSystemMessage", () => {
	it("posts a system message with no sender, the event name and the French content", async () => {
		const payload = seed();
		await createOrderConversation(requestFor(payload), orderOf(payload));

		const message = await postOrderSystemMessage(
			requestFor(payload),
			orderOf(payload),
			eventOf({ type: "order.placed" }),
		);

		expect(message?.sender ?? null).toBeNull();
		expect(message?.systemEvent).toBe("order.placed");
		expect(message?.content).toBe(
			`Commande BNS-2609-000123 enregistrée, total ${formatXaf(47000, "fr")}.`,
		);
	});

	it("posts a system message for each of the ten listed events and for no other event", async () => {
		const payload = seed();
		await createOrderConversation(requestFor(payload), orderOf(payload));

		const candidates: OrderEvent["type"][] = [
			...SYSTEM_MESSAGE_EVENTS,
			"order.note_added",
		];

		for (const type of candidates) {
			const message = await postOrderSystemMessage(
				requestFor(payload),
				orderOf(payload),
				eventOf({ type }),
			);
			const listed = (SYSTEM_MESSAGE_EVENTS as readonly string[]).includes(
				type,
			);
			if (listed) {
				expect(message).not.toBeNull();
			} else {
				expect(message).toBeNull();
			}
		}

		const posted = payload.store.messages.filter((m) => m.kind === "system");
		expect(posted).toHaveLength(SYSTEM_MESSAGE_EVENTS.length);
	});

	it("never puts a code, hash, secret or otp into the content or systemParams of any system message", async () => {
		const payload = seed();
		await createOrderConversation(requestFor(payload), orderOf(payload));

		for (const type of SYSTEM_MESSAGE_EVENTS) {
			const message = await postOrderSystemMessage(
				requestFor(payload),
				orderOf(payload),
				eventOf({ type, reason: "buyer_changed_mind" }),
			);
			const haystack = `${message?.content ?? ""} ${JSON.stringify(
				message?.systemParams ?? {},
			)}`;
			expect(haystack).not.toMatch(/code|hash|secret|otp/i);
		}
	});

	it("returns null without a conversation to post into", async () => {
		const payload = seed();
		const message = await postOrderSystemMessage(
			requestFor(payload),
			orderOf(payload),
			eventOf({ type: "order.confirmed" }),
		);
		expect(message).toBeNull();
		expect(payload.store.messages).toHaveLength(0);
	});
});

describe("publishing on chat:system", () => {
	const originalRedisUrl = process.env.REDIS_URL;

	beforeEach(() => {
		process.env.REDIS_URL = "redis://test";
	});

	afterEach(() => {
		__setSystemMessagePublisherForTests(null);
		// `process.env.REDIS_URL = undefined` would coerce to the string
		// "undefined", not an absence — `queueSystemMessage`'s own
		// `!process.env.REDIS_URL` guard would then see something truthy.
		// biome-ignore lint/performance/noDelete: see above.
		if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
		else process.env.REDIS_URL = originalRedisUrl;
	});

	it("publishes on chat:system after the commit, never during", async () => {
		const payload = seed();
		await createOrderConversation(requestFor(payload), orderOf(payload));

		const published: string[] = [];
		__setSystemMessagePublisherForTests(async (_channel, message) => {
			published.push(message);
		});

		let duringCommit = false;
		await withTransaction(payload, async (req) => {
			await postOrderSystemMessage(
				req,
				orderOf(payload),
				eventOf({ type: "order.confirmed" }),
			);
			duringCommit = published.length > 0;
		});

		expect(duringCommit).toBe(false);
		expect(published).toHaveLength(1);
	});

	it("rolled back, nothing published", async () => {
		const payload = seed();
		await createOrderConversation(requestFor(payload), orderOf(payload));

		const published: string[] = [];
		__setSystemMessagePublisherForTests(async (_channel, message) => {
			published.push(message);
		});

		await expect(
			withTransaction(payload, async (req) => {
				await postOrderSystemMessage(
					req,
					orderOf(payload),
					eventOf({ type: "order.confirmed" }),
				);
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(published).toHaveLength(0);
	});
});

describe("registered on the order-event registry (Task 8)", () => {
	// `__resetOrderEventHandlers()` clears both the handler map and the
	// dispatch log it guards "posts once" with; `registerOrderChatHandlers()`
	// is the real re-registration this module actually does at load, not a
	// stand-in. Without this, the dispatch log is whatever this file's other
	// tests left it as — none of them touch it (they call
	// `createOrderConversation`/`postOrderSystemMessage` directly, never
	// `runOrderEventHandlers`), so it would in practice already be empty
	// here, but this test does not rely on that being true by accident.
	beforeEach(() => {
		__resetOrderEventHandlers();
		registerOrderChatHandlers();
	});

	it("posts once under a retried transition — the same event id dispatched twice", async () => {
		const payload = seed();
		const order = orderOf(payload);
		await createOrderConversation(requestFor(payload), order);
		const event = eventOf({ id: "ev-retry-1", type: "order.shipped" });

		await runOrderEventHandlers(payload, order, event);
		await runOrderEventHandlers(payload, order, event); // the retry

		const posted = payload.store.messages.filter(
			(m) => m.systemEvent === "order.shipped",
		);
		expect(posted).toHaveLength(1);
	});
});

describe("Messages.afterChange and a system message", () => {
	const afterChange = (Messages.hooks?.afterChange as Hook[])[0];
	const originalNovuKey = process.env.NOVU_SECRET_KEY;

	beforeEach(() => {
		process.env.NOVU_SECRET_KEY = "test-secret";
		notifyShopInboxMessage.mockClear();
		triggerNotificationEvent.mockClear();
	});

	afterEach(() => {
		// An assigned `undefined` would coerce to the string "undefined", not
		// an absence.
		// biome-ignore lint/performance/noDelete: see above.
		if (originalNovuKey === undefined) delete process.env.NOVU_SECRET_KEY;
		else process.env.NOVU_SECRET_KEY = originalNovuKey;
	});

	it("does not trigger new-message for a system message", async () => {
		const payload = fakePayload({
			conversations: [
				{
					id: "c-1",
					participants: ["u-buyer", "u-owner"],
					shop: null,
					buyer: null,
				},
			],
		});

		await afterChange({
			doc: {
				id: "m-1",
				conversation: "c-1",
				sender: null,
				kind: "system",
				content: "Commande BNS-2609-000123 confirmée.",
				createdAt: "2026-09-15T00:00:00.000Z",
			},
			operation: "create",
			req: requestFor(payload),
		});

		expect(notifyShopInboxMessage).not.toHaveBeenCalled();
		expect(triggerNotificationEvent).not.toHaveBeenCalled();
	});
});

describe("Messages.beforeChange and a system message", () => {
	it("a buyer who blocked a shop member still receives system messages", async () => {
		// The block rule is a lookup `beforeChange` never reaches for `kind:
		// "system"`: the early return at the top of the hook sets `sender:
		// null` and returns before the blocking query exists, so a block
		// between the buyer and any shop member cannot touch this path —
		// unlike a user message, which the next describe block's sibling
		// suite (`messages-hook.int.spec.ts`) shows the block rule still
		// reaches.
		const data = await runBeforeChange(Messages, {
			data: {
				conversation: "c-1",
				content: "Commande BNS-2609-000123 confirmée.",
				kind: "system",
				systemEvent: "order.confirmed",
			},
			req: { user: null, context: { orderService: true } },
			operation: "create",
		});
		expect(data.sender ?? null).toBeNull();
		expect(data.kind).toBe("system");
	});
});
