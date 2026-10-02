// @vitest-environment node
import type { PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

type NotificationPayloadValue = string | number | boolean | null | undefined;

/** Mirrors `hooks/notificationEvents.ts`'s own (unexported) `TriggerPayload`. */
type TriggerCall = {
	event: string;
	subscriberId: string;
	payload: Record<string, NotificationPayloadValue>;
};

// `vi.hoisted` guarantees these run before the mock factory below, which
// vitest hoists above every import.
const { triggerNotificationEvent, hasPushCredential } = vi.hoisted(() => ({
	triggerNotificationEvent: vi.fn(async (_args: TriggerCall) => undefined),
	hasPushCredential: vi.fn(async (_subscriberId: string) => true),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent,
	hasPushCredential,
}));

const sendSms = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

import { withTransaction } from "../../src/lib/transactions";
import type {
	CommissionInvoice,
	Order,
	OrderEvent,
} from "../../src/payload-types";
import {
	__resetOrderEventHandlers,
	runOrderEventHandlers,
} from "../../src/services/orders/events";
import {
	notifyCommissionInvoiceIssued,
	notifyCommissionInvoiceOverdue,
	notifyCommissionInvoicePaid,
	notifyOrderReviewReminder,
	registerOrderNotificationHandlers,
} from "../../src/services/orders/notifications";
import { applyTransition } from "../../src/services/orders/transitions";
import { fakePayload } from "./helpers/fakePayload";

const NOW_ISO = "2026-10-01T00:00:00.000Z";

const USERS = [
	{ id: "u-buyer", role: "user", name: "Buyer", email: "buyer@example.com" },
	{ id: "u-owner", role: "user", name: "Owner", email: "owner@example.com" },
	{
		id: "u-manager",
		role: "user",
		name: "Manager",
		email: "manager@example.com",
	},
	{ id: "u-staff", role: "user", name: "Staff", email: "staff@example.com" },
	{
		id: "u-susp",
		role: "user",
		name: "Suspended",
		email: "susp@example.com",
		suspendedAt: "2026-09-01T00:00:00.000Z",
		suspendedUntil: "2099-01-01T00:00:00.000Z",
	},
	{
		id: "u-exmember",
		role: "user",
		name: "Ex member",
		email: "ex@example.com",
	},
];

const SHOP = {
	id: "s-1",
	handle: "akwa",
	name: "Akwa Shop",
	owner: "u-owner",
	status: "active",
	level: 2,
	contact: { phone: "+237600000001" },
};

const MEMBERS = [
	{
		id: "sm-owner",
		shop: "s-1",
		user: "u-owner",
		role: "owner",
		status: "active",
		inboxNotifications: "all",
	},
	{
		id: "sm-manager",
		shop: "s-1",
		user: "u-manager",
		role: "manager",
		status: "active",
		inboxNotifications: "all",
	},
	{
		id: "sm-staff",
		shop: "s-1",
		user: "u-staff",
		role: "staff",
		status: "active",
		inboxNotifications: "all",
	},
	{
		id: "sm-susp",
		shop: "s-1",
		user: "u-susp",
		role: "staff",
		status: "active",
		inboxNotifications: "all",
	},
	{
		id: "sm-revoked",
		shop: "s-1",
		user: "u-exmember",
		role: "manager",
		status: "revoked",
		inboxNotifications: "all",
	},
];

function baseOrder(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "order-1",
		orderNumber: "BNS-2610-000001",
		buyer: "u-buyer",
		shop: "s-1",
		status: "confirmed",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: { recipientName: "Aicha", phone: "+237699999999" },
		amounts: { total: 47000, currency: "XAF" },
		contract: { locale: "fr" },
		confirmation: {},
		deadlines: {},
		risk: {},
		...overrides,
	};
}

function seed(
	order: Record<string, unknown>,
	events: Record<string, unknown>[] = [],
	extra: {
		returnCases?: Record<string, unknown>[];
		shop?: Record<string, unknown>;
	} = {},
) {
	return fakePayload({
		users: USERS.map((u) => ({ ...u })),
		shops: [{ ...SHOP, ...(extra.shop ?? {}) }],
		"shop-members": MEMBERS.map((m) => ({ ...m })),
		orders: [order],
		"order-events": events,
		"return-cases": extra.returnCases ?? [],
	});
}

async function freshOrder(
	payload: ReturnType<typeof fakePayload>,
): Promise<Order> {
	return (await payload.findByID({
		collection: "orders",
		id: "order-1",
		overrideAccess: true,
	})) as Order;
}

function withReq<T>(
	payload: ReturnType<typeof fakePayload>,
	fn: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
	return withTransaction(payload, fn);
}

function placedEvent(orderId: string, id: string): OrderEvent {
	return {
		id,
		order: orderId,
		type: "order.placed",
		visibility: "both",
		updatedAt: NOW_ISO,
		createdAt: NOW_ISO,
	};
}

function callsFor(event: string): TriggerCall[] {
	return triggerNotificationEvent.mock.calls
		.map(([args]) => args)
		.filter((call) => call.event === event);
}

beforeEach(() => {
	triggerNotificationEvent.mockClear();
	hasPushCredential.mockReset();
	hasPushCredential.mockResolvedValue(true);
	sendSms.mockReset();
	sendSms.mockResolvedValue(undefined);

	// `events.ts`'s dispatch log is keyed by `OrderEvent.id` and is never reset
	// between dispatches on purpose (that is the idempotency guarantee under
	// test). But `fakePayload`'s own id counter restarts at 1 for every fresh
	// instance, so two different tests' first `order-events` row both land on
	// the literal id "order-events-1" — a real Mongo ObjectId never repeats,
	// but this fake's does, and without this reset the second test's dispatch
	// would be silently swallowed as if it were a replay of the first. This
	// was caught by exactly that happening: a notifier-throws test looked
	// green while never having called the notifier at all.
	__resetOrderEventHandlers();
	registerOrderNotificationHandlers();
});

describe("order-placed", () => {
	it("reaches the buyer and every active member with orders.view, and nobody who lacks it", async () => {
		const payload = seed(baseOrder({ confirmation: { method: "sms_code" } }));
		const order = await freshOrder(payload);
		await runOrderEventHandlers(payload, order, placedEvent(order.id, "ev-1"));

		const recipients = callsFor("order-placed")
			.map((c) => c.subscriberId)
			.sort();
		expect(recipients).toEqual(
			["u-buyer", "u-manager", "u-owner", "u-staff"].sort(),
		);
		expect(recipients).not.toContain("u-susp");
		expect(recipients).not.toContain("u-exmember");
	});

	it("marks the buyer's copy 'buyer' and every shop member's copy 'shop'", async () => {
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		await runOrderEventHandlers(payload, order, placedEvent(order.id, "ev-2"));

		const calls = callsFor("order-placed");
		const buyerCall = calls.find((c) => c.subscriberId === "u-buyer");
		expect(buyerCall?.payload.audience).toBe("buyer");
		for (const call of calls.filter((c) => c.subscriberId !== "u-buyer")) {
			expect(call.payload.audience).toBe("shop");
		}
	});

	it("sends exactly orderId, orderNumber, shopName, total, audience and confirmationRequired", async () => {
		const payload = seed(baseOrder({ confirmation: { method: "sms_code" } }));
		const order = await freshOrder(payload);
		await runOrderEventHandlers(payload, order, placedEvent(order.id, "ev-3"));

		const buyerCall = callsFor("order-placed").find(
			(c) => c.subscriberId === "u-buyer",
		);
		expect(Object.keys(buyerCall?.payload ?? {}).sort()).toEqual(
			[
				"orderId",
				"orderNumber",
				"shopName",
				"total",
				"audience",
				"confirmationRequired",
			].sort(),
		);
		expect(buyerCall?.payload).toEqual({
			orderId: "order-1",
			orderNumber: "BNS-2610-000001",
			shopName: "Akwa Shop",
			total: 47000,
			audience: "buyer",
			confirmationRequired: "sms_code",
		});
	});
});

describe("order-confirmation-needed", () => {
	it("fires to shop members, with the buyer's phone risk tier, only when seller_call is required", async () => {
		const payload = seed(
			baseOrder({
				confirmation: { method: "seller_call" },
				risk: { phoneTier: "watch" },
			}),
		);
		const order = await freshOrder(payload);
		await runOrderEventHandlers(payload, order, placedEvent(order.id, "ev-4"));

		const calls = callsFor("order-confirmation-needed");
		expect(calls.map((c) => c.subscriberId).sort()).toEqual(
			["u-manager", "u-owner", "u-staff"].sort(),
		);
		for (const call of calls) {
			expect(call.payload).toEqual({
				orderId: "order-1",
				orderNumber: "BNS-2610-000001",
				tier: "watch",
			});
		}
	});

	it("never fires when the order does not require a seller call", async () => {
		const payload = seed(baseOrder({ confirmation: { method: "sms_code" } }));
		const order = await freshOrder(payload);
		await runOrderEventHandlers(payload, order, placedEvent(order.id, "ev-5"));
		expect(callsFor("order-confirmation-needed")).toHaveLength(0);
	});
});

describe("order-accept-reminder", () => {
	it("fires once; dispatching the same event a second time sends nothing more", async () => {
		const payload = seed(
			baseOrder({ deadlines: { acceptBy: "2026-10-03T00:00:00.000Z" } }),
		);
		const order = await freshOrder(payload);
		const event: OrderEvent = {
			id: "ev-reminder-1",
			order: order.id,
			type: "order.accept_reminder_sent",
			visibility: "shop",
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		};

		await runOrderEventHandlers(payload, order, event);
		await runOrderEventHandlers(payload, order, event);

		const calls = callsFor("order-accept-reminder");
		expect(calls).toHaveLength(3);
		expect(calls.map((c) => c.subscriberId).sort()).toEqual(
			["u-manager", "u-owner", "u-staff"].sort(),
		);
		expect(calls[0]?.payload).toEqual({
			orderId: "order-1",
			orderNumber: "BNS-2610-000001",
			acceptBy: "2026-10-03T00:00:00.000Z",
		});
	});
});

describe("fires only after commit, never inside the transaction", () => {
	it("fires order-accepted to the buyer once the transition's transaction commits", async () => {
		const payload = seed(baseOrder({ status: "confirmed" }));
		await withReq(payload, async (req) => {
			const order = await freshOrder(payload);
			return applyTransition(
				req,
				order,
				{ status: "accepted" },
				{ type: "order.accepted", actorType: "seller", visibility: "both" },
			);
		});

		const calls = callsFor("order-accepted");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.subscriberId).toBe("u-buyer");
		expect(calls[0]?.payload).toEqual({
			orderId: "order-1",
			orderNumber: "BNS-2610-000001",
			shopName: "Akwa Shop",
			etaText: "",
		});
	});

	it("never fires, and leaves the order untouched, when the transaction rolls back", async () => {
		const payload = seed(baseOrder({ status: "confirmed" }));
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "order-events";

		await expect(
			withReq(payload, async (req) => {
				const order = await freshOrder(payload);
				return applyTransition(
					req,
					order,
					{ status: "accepted" },
					{ type: "order.accepted", actorType: "seller", visibility: "both" },
				);
			}),
		).rejects.toThrow();

		expect(triggerNotificationEvent).not.toHaveBeenCalled();
		const order = await freshOrder(payload);
		expect(order.status).toBe("confirmed");
	});

	it("never fires when the commit itself fails, even though the body already ran", async () => {
		const payload = seed(baseOrder({ status: "confirmed" }));
		payload.db.commitTransaction = async () => {
			throw new Error("commit failed");
		};

		await expect(
			withReq(payload, async (req) => {
				const order = await freshOrder(payload);
				return applyTransition(
					req,
					order,
					{ status: "accepted" },
					{ type: "order.accepted", actorType: "seller", visibility: "both" },
				);
			}),
		).rejects.toThrow("commit failed");

		expect(triggerNotificationEvent).not.toHaveBeenCalled();
	});

	it("does not take down the transition when the notifier throws", async () => {
		triggerNotificationEvent.mockImplementationOnce(async () => {
			throw new Error("novu is down");
		});
		const payload = seed(baseOrder({ status: "confirmed" }));
		const result = await withReq(payload, async (req) => {
			const order = await freshOrder(payload);
			return applyTransition(
				req,
				order,
				{ status: "accepted" },
				{ type: "order.accepted", actorType: "seller", visibility: "both" },
			);
		});
		expect(result.order.status).toBe("accepted");
	});
});

describe("commission-invoice-issued", () => {
	it("reaches owner and manager only, never staff", async () => {
		const payload = seed(baseOrder());
		const invoice: CommissionInvoice = {
			id: "inv-1",
			invoiceNumber: "INV-2610-0001",
			shop: "s-1",
			totalDue: 15000,
			dueAt: "2026-10-10T00:00:00.000Z",
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		};
		await notifyCommissionInvoiceIssued(payload, invoice);

		const calls = callsFor("commission-invoice-issued");
		expect(calls.map((c) => c.subscriberId).sort()).toEqual(
			["u-manager", "u-owner"].sort(),
		);
		for (const call of calls) {
			expect(call.payload).toEqual({
				invoiceId: "inv-1",
				invoiceNumber: "INV-2610-0001",
				totalDue: 15000,
				dueAt: "2026-10-10T00:00:00.000Z",
			});
		}
	});
});

describe("the seller SMS fallback", () => {
	it("does not fire when at least one shop recipient has a push credential", async () => {
		hasPushCredential.mockResolvedValue(true);
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		await runOrderEventHandlers(
			payload,
			order,
			placedEvent(order.id, "ev-sms-1"),
		);
		expect(sendSms).not.toHaveBeenCalled();
	});

	it("fires to the shop's contact phone, carrying no code, when nobody has a push credential", async () => {
		hasPushCredential.mockResolvedValue(false);
		const payload = seed(baseOrder());
		const order = await freshOrder(payload);
		await runOrderEventHandlers(
			payload,
			order,
			placedEvent(order.id, "ev-sms-2"),
		);

		expect(sendSms).toHaveBeenCalledTimes(1);
		const [, smsArgs] = sendSms.mock.calls[0] as [
			unknown,
			{ to: string; message: string },
		];
		expect(smsArgs.to).toBe("+237600000001");
		expect(smsArgs.message).toContain("BNS-2610-000001");
		expect(smsArgs.message.toLowerCase()).not.toContain("code");
	});

	it("falls back to the owner's phone when the shop has no contact phone on file", async () => {
		hasPushCredential.mockResolvedValue(false);
		const payload = seed(baseOrder(), [], { shop: { contact: {} } });
		await payload.update({
			collection: "users",
			id: "u-owner",
			data: { phone: "+237655000000" },
			overrideAccess: true,
		});
		const order = await freshOrder(payload);
		await runOrderEventHandlers(
			payload,
			order,
			placedEvent(order.id, "ev-sms-3"),
		);

		expect(sendSms).toHaveBeenCalledTimes(1);
		const [, smsArgs] = sendSms.mock.calls[0] as [
			unknown,
			{ to: string; message: string },
		];
		expect(smsArgs.to).toBe("+237655000000");
	});
});

describe("payload shape and the no-evidence rule", () => {
	const CONFIRM_HASH = "SECRET_CONFIRM_HASH_9f31";
	const HANDOVER_HASH = "SECRET_HANDOVER_HASH_1a2b";
	const BUYER_FULL_PHONE = "+237699999999";
	const VENDOR_SECRET = "VENDOR_SNAPSHOT_SECRET_7788";
	const INTERNAL_NOTE = "INTERNAL_WAIVE_NOTE_SECRET";

	it("never carries a handover code, a confirmation code, any hash, the buyer's full phone or a shop's cost/margin, across every order and commission payload", async () => {
		const taintedOrder = baseOrder({
			status: "shipped",
			confirmation: { method: "sms_code", codeHash: CONFIRM_HASH },
			handover: {
				codeHash: HANDOVER_HASH,
				method: "seller_declaration",
				contestBy: "2026-10-05T00:00:00.000Z",
			},
			delivery: {
				recipientName: "Aicha",
				phone: BUYER_FULL_PHONE,
				method: "pickup",
				pickupPoint: { label: "Marche Central", lat: 4.05, lng: 9.7 },
				etaText: "Demain",
			},
			commission: { rateBps: 500, amount: 2350 },
			cancellation: { by: "seller", reason: "seller_out_of_stock" },
			deliveryFailure: { reason: "unreachable" },
			deadlines: {
				acceptBy: "2026-10-03T00:00:00.000Z",
				withdrawalUntil: "2026-10-20T00:00:00.000Z",
			},
			risk: { phoneTier: "watch" },
			returnCase: "rc-1",
		});

		const payload = seed(taintedOrder, [], {
			returnCases: [
				{ id: "rc-1", number: "RET-2610-000001", status: "requested" },
			],
		});
		const order = await freshOrder(payload);

		await runOrderEventHandlers(
			payload,
			order,
			placedEvent(order.id, "ev-leak-1"),
		);
		await runOrderEventHandlers(payload, order, {
			id: "ev-leak-2",
			order: order.id,
			type: "order.accept_reminder_sent",
			visibility: "shop",
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		});
		await runOrderEventHandlers(payload, order, {
			id: "ev-leak-3",
			order: order.id,
			type: "order.accepted",
			visibility: "both",
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		});
		await runOrderEventHandlers(payload, order, {
			id: "ev-leak-4",
			order: order.id,
			type: "order.shipped",
			visibility: "both",
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		});
		await runOrderEventHandlers(payload, order, {
			id: "ev-leak-5",
			order: order.id,
			type: "order.delivered",
			visibility: "both",
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		});
		await runOrderEventHandlers(payload, order, {
			id: "ev-leak-6",
			order: order.id,
			type: "order.cancelled",
			visibility: "both",
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		});
		await runOrderEventHandlers(payload, order, {
			id: "ev-leak-7",
			order: order.id,
			type: "order.delivery_failed",
			visibility: "both",
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		});
		await runOrderEventHandlers(payload, order, {
			id: "ev-leak-8",
			order: order.id,
			type: "order.withdrawal_requested",
			visibility: "both",
			items: [
				{
					orderItem: "oi-1",
					fulfillmentFrom: "delivered",
					fulfillmentTo: "return_requested",
				},
			],
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		});
		await notifyOrderReviewReminder(payload, order);

		const invoice: CommissionInvoice = {
			id: "inv-1",
			invoiceNumber: "INV-2610-0001",
			shop: "s-1",
			totalDue: 15000,
			dueAt: "2026-10-10T00:00:00.000Z",
			sellerSnapshot: { rccm: "RC/DLA/2020/B/9999" },
			issuerSnapshot: { vendorRef: VENDOR_SECRET },
			waivedNote: INTERNAL_NOTE,
			updatedAt: NOW_ISO,
			createdAt: NOW_ISO,
		};
		await notifyCommissionInvoiceIssued(payload, invoice);
		await notifyCommissionInvoiceOverdue(payload, invoice, "overdue");
		await notifyCommissionInvoicePaid(payload, invoice);

		expect(triggerNotificationEvent.mock.calls.length).toBeGreaterThan(10);

		const forbidden = [
			CONFIRM_HASH,
			HANDOVER_HASH,
			BUYER_FULL_PHONE,
			VENDOR_SECRET,
			INTERNAL_NOTE,
			"codeHash",
			"rateBps",
			"RC/DLA/2020/B/9999",
		];

		for (const [args] of triggerNotificationEvent.mock.calls) {
			const body = JSON.stringify(args.payload);
			for (const marker of forbidden) {
				expect(body).not.toContain(marker);
			}
		}
	});
});
