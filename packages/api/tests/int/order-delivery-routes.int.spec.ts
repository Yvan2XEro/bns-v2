// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the real services (`access/orderAccess`, `services/orders/delivery`,
 * `services/orders/handover`, `services/orders/queries`) against the
 * in-memory Payload fake, only mocking `getPayload` so `requireUser`
 * resolves it instead of opening Mongo — same shape as
 * `order-read-routes.int.spec.ts`. Every status/code/body asserted here
 * comes from the real route and service code, not from a mocked service.
 */
const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const sendSms = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

import { can } from "../../src/access/shopRoles";
import { withTransaction } from "../../src/lib/transactions";
import type { Order } from "../../src/payload-types";
import { issueHandoverCode } from "../../src/services/orders/handover";
import { type Doc, type FakePayload, fakePayload } from "./helpers/fakePayload";

const OWNER = "u-owner";
const STAFF = "u-staff";
const BUYER = "u-buyer";
const OUTSIDER = "u-outsider";

function delivery(recipientName: string, phone = "+237600000012") {
	return { recipientName, phone, city: "douala" };
}

function amounts(total = 46_000) {
	return { subtotal: 45_000, deliveryFee: 1_000, total, currency: "XAF" };
}

const TERMINAL_STATUSES = [
	"delivery_failed",
	"cancelled",
	"completed",
	"delivered",
] as const;

function terminalOrder(status: string, id: string): Doc {
	return {
		id,
		orderNumber: `ORD-${id.toUpperCase()}`,
		buyer: BUYER,
		shop: "s-1",
		status,
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: delivery(`Recipient ${id}`),
		amounts: amounts(),
		handover: {},
		deliveryFailure: {},
		contract: { locale: "fr" },
	};
}

function shippedOrder(id: string, overrides: Doc = {}): Doc {
	return {
		id,
		orderNumber: `ORD-${id.toUpperCase()}`,
		buyer: BUYER,
		shop: "s-1",
		status: "shipped",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: delivery(`Recipient ${id}`),
		amounts: amounts(),
		handover: {},
		deliveryFailure: {},
		contract: { locale: "fr" },
		...overrides,
	};
}

function variant(id: string): Doc {
	return {
		id,
		product: "p-1",
		shop: "s-1",
		optionValues: {},
		price: 45_000,
		trackInventory: true,
		stockOnHand: 5,
		stockReserved: 1,
	};
}

function item(id: string, order: string, variantId: string): Doc {
	return {
		id,
		order,
		product: "p-1",
		variant: variantId,
		fulfillingShop: "s-1",
		snapshot: { title: "Phone", categoryId: null },
		unitPrice: 45_000,
		quantity: 1,
		lineSubtotal: 45_000,
		commissionRateBps: 800,
		fulfillmentStatus: "shipped",
	};
}

function seed() {
	const payload = fakePayload({
		users: [
			{ id: OWNER, role: "user" },
			{ id: STAFF, role: "user" },
			{ id: BUYER, role: "user" },
			{ id: OUTSIDER, role: "user" },
		],
		shops: [{ id: "s-1", status: "active", owner: OWNER, level: 2 }],
		"shop-members": [
			{
				id: "m-owner",
				shop: "s-1",
				user: OWNER,
				role: "owner",
				status: "active",
			},
			{
				id: "m-staff",
				shop: "s-1",
				user: STAFF,
				role: "staff",
				status: "active",
			},
		],
		orders: [
			...TERMINAL_STATUSES.map((status) =>
				terminalOrder(status, `o-${status}`),
			),
			shippedOrder("o-locked"),
			shippedOrder("o-confirm"),
			shippedOrder("o-staff"),
			shippedOrder("o-regen", {
				handover: { attempts: 5, lockedAt: "2026-10-01T00:00:00.000Z" },
			}),
		],
		products: [{ id: "p-1", shop: "s-1", title: "Phone" }],
		"product-variants": [
			variant("v-confirm"),
			variant("v-staff"),
			variant("v-regen"),
		],
		"order-items": [
			item("oi-confirm", "o-confirm", "v-confirm"),
			item("oi-staff", "o-staff", "v-staff"),
			item("oi-regen", "o-regen", "v-regen"),
		],
		"stock-movements": [],
		"commission-lines": [],
		"order-events": [],
	});
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const asUser = (payload: ReturnType<typeof seed>, id: string, role = "user") =>
	payload.auth.mockResolvedValue({ user: { id, role } });

const orderDoc = (payload: FakePayload, id: string): Order =>
	structuredClone(
		payload.store.orders.find((o) => o.id === id),
	) as unknown as Order;

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string, body?: unknown) =>
	new Request(`http://localhost${url}`, {
		method: "POST",
		...(body !== undefined
			? {
					body: JSON.stringify(body),
					headers: { "content-type": "application/json" },
				}
			: {}),
	});

beforeEach(() => {
	vi.clearAllMocks();
	sendSms.mockResolvedValue({ status: "sent" });
	process.env.ORDER_PHONE_PEPPER = "test-pepper";
});

afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
});

// Review Focus 2: a matrix of 4 terminal statuses × 5 routes = 20 refusals,
// one assertion that nothing happened across the whole matrix. The five
// routes' modules are imported for the first time here, each paying its
// own cold dynamic-import cost (AGENTS.md's note on the first dynamic
// import), so the matrix gets a longer budget than the suite's default.
describe("every delivery route is refused on a terminal order, with no side effect", () => {
	it("answers 409 order.invalidTransition for all 20 combinations, with zero growth", async () => {
		const payload = seed();
		asUser(payload, OWNER);

		const { POST: handover } = await import(
			"../../src/app/(frontend)/api/orders/[id]/handover/route"
		);
		const { POST: confirmReceipt } = await import(
			"../../src/app/(frontend)/api/orders/[id]/confirm-receipt/route"
		);
		const { POST: declareDelivered } = await import(
			"../../src/app/(frontend)/api/orders/[id]/declare-delivered/route"
		);
		const { POST: markFailed } = await import(
			"../../src/app/(frontend)/api/orders/[id]/mark-delivery-failed/route"
		);
		const { POST: attemptFailed } = await import(
			"../../src/app/(frontend)/api/orders/[id]/delivery-attempt-failed/route"
		);

		const before = {
			movements: payload.store["stock-movements"].length,
			lines: payload.store["commission-lines"].length,
			events: payload.store["order-events"].length,
		};

		for (const status of TERMINAL_STATUSES) {
			const id = `o-${status}`;

			asUser(payload, OWNER);
			const h = await handover(post("/x", { code: "0000" }), params(id));
			expect(h.status).toBe(409);
			expect((await h.json()).code).toBe("order.invalidTransition");

			asUser(payload, BUYER);
			const c = await confirmReceipt(post("/x"), params(id));
			expect(c.status).toBe(409);
			expect((await c.json()).code).toBe("order.invalidTransition");

			asUser(payload, OWNER);
			const d = await declareDelivered(post("/x", {}), params(id));
			expect(d.status).toBe(409);
			expect((await d.json()).code).toBe("order.invalidTransition");

			asUser(payload, OWNER);
			const m = await markFailed(post("/x", { reason: "other" }), params(id));
			expect(m.status).toBe(409);
			expect((await m.json()).code).toBe("order.invalidTransition");

			asUser(payload, OWNER);
			const a = await attemptFailed(
				post("/x", { reason: "timeout" }),
				params(id),
			);
			expect(a.status).toBe(409);
			expect((await a.json()).code).toBe("order.invalidTransition");
		}

		expect(payload.store["stock-movements"]).toHaveLength(before.movements);
		expect(payload.store["commission-lines"]).toHaveLength(before.lines);
		expect(payload.store["order-events"]).toHaveLength(before.events);
	}, 30_000);
});

describe("POST /api/orders/{id}/handover", () => {
	it("the fifth wrong code locks the order and answers order.handoverLocked with the two fallbacks", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/handover/route"
		);

		let last: Response | undefined;
		for (let i = 0; i < 5; i++) {
			last = await POST(post("/x", { code: "9999" }), params("o-locked"));
		}
		expect(last?.status).toBe(429);
		const body = await last?.json();
		expect(body.code).toBe("order.handoverLocked");
		expect(body.details.handover).toEqual({ locked: true });
		expect(body.details.attemptsLeft).toBe(0);
	}, 20_000);

	it("a staff member of the shop may run the handover (orders.process) but the role has no orders.cancel", async () => {
		const payload = seed();
		const { code } = await withTransaction(payload, (req) =>
			issueHandoverCode(req, orderDoc(payload, "o-staff"), {
				regenerate: false,
			}),
		);

		asUser(payload, STAFF);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/handover/route"
		);
		const res = await POST(post("/x", { code }), params("o-staff"));
		expect(res.status).toBe(200);
		const order = payload.store.orders.find((o) => o.id === "o-staff");
		expect(order?.status).toBe("delivered");

		// "but not cancel": staff's permission set has `orders.process` but
		// never `orders.cancel` — there is no cancel route in this task, so the
		// boundary is checked at the source (`access/shopRoles.ts`) rather than
		// against a route this task does not own.
		expect(can("staff", "orders.process")).toBe(true);
		expect(can("staff", "orders.cancel")).toBe(false);
	});
});

describe("POST /api/orders/{id}/handover-code/regenerate", () => {
	it("a buyer regeneration resets the attempts and the next code works", async () => {
		const payload = seed();
		asUser(payload, BUYER);
		const { POST: regenerate } = await import(
			"../../src/app/(frontend)/api/orders/[id]/handover-code/regenerate/route"
		);
		const res = await regenerate(post("/x"), params("o-regen"));
		expect(res.status).toBe(200);
		const { code } = await res.json();
		expect(code).toMatch(/^\d{4}$/);

		const order = payload.store.orders.find((o) => o.id === "o-regen");
		expect((order?.handover as Doc).attempts).toBe(0);
		expect((order?.handover as Doc).lockedAt).toBeFalsy();

		asUser(payload, OWNER);
		const { POST: handover } = await import(
			"../../src/app/(frontend)/api/orders/[id]/handover/route"
		);
		const handoverRes = await handover(post("/x", { code }), params("o-regen"));
		expect(handoverRes.status).toBe(200);
		expect(
			(payload.store.orders.find((o) => o.id === "o-regen") as Doc).status,
		).toBe("delivered");
	});
});

describe("POST /api/orders/{id}/confirm-receipt", () => {
	it("is the buyer's alone: a shop member gets order.notFound, not 403", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/confirm-receipt/route"
		);
		const res = await POST(post("/x"), params("o-confirm"));
		expect(res.status).toBe(404);
		expect((await res.json()).code).toBe("order.notFound");
	});

	it("delivers the order for the buyer — the path the audience test is paired with", async () => {
		const payload = seed();
		asUser(payload, BUYER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/confirm-receipt/route"
		);
		const res = await POST(post("/x"), params("o-confirm"));
		expect(res.status).toBe(200);
		expect(
			(payload.store.orders.find((o) => o.id === "o-confirm") as Doc).status,
		).toBe("delivered");
	});
});
