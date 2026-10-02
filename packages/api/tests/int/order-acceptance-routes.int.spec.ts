// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendSms = vi.fn();
vi.mock("../../src/services/smsProvider", () => ({
	sendSms: (...args: unknown[]) => sendSms(...args),
}));

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

import { withTransaction } from "../../src/lib/transactions";
import { issueConfirmationCode } from "../../src/services/orders/confirmation";
import { fakePayload } from "./helpers/fakePayload";

const OWNER = "owner-1";
const STAFF = "staff-1";
const BUYER = "buyer-1";
const OUTSIDER = "outsider-1";

const FUTURE = (ms = 60_000) => new Date(Date.now() + ms).toISOString();

function baseOrder(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "order-1",
		orderNumber: "BNS-2610-000001",
		shop: "shop-1",
		buyer: BUYER,
		status: "confirmed",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: {
			method: "seller_delivery",
			recipientName: "Aicha",
			phone: "+237600000099",
			city: "douala",
		},
		amounts: { subtotal: 15000, deliveryFee: 0, total: 15000, currency: "XAF" },
		deadlines: {},
		timestamps: {},
		contract: { locale: "fr" },
		confirmation: {},
		handover: {},
		cancellation: {},
		...overrides,
	};
}

function seed(order: Record<string, unknown> = baseOrder()) {
	const payload = fakePayload({
		users: [
			{ id: OWNER, role: "user" },
			{ id: STAFF, role: "user" },
			{ id: BUYER, role: "user" },
			{ id: OUTSIDER, role: "user" },
		],
		shops: [
			{ id: "shop-1", status: "active", owner: OWNER, level: 2, stats: {} },
		],
		"shop-members": [
			{
				id: "m-owner",
				shop: "shop-1",
				user: OWNER,
				role: "owner",
				status: "active",
			},
			{
				id: "m-staff",
				shop: "shop-1",
				user: STAFF,
				role: "staff",
				status: "active",
			},
		],
		orders: [order],
		"order-items": [
			{
				id: "item-1",
				order: "order-1",
				product: "product-1",
				variant: "variant-1",
				fulfillingShop: "shop-1",
				unitPrice: 15000,
				quantity: 1,
				fulfillmentStatus: "unfulfilled",
			},
		],
		"order-events": [],
		"product-variants": [
			{
				id: "variant-1",
				product: "product-1",
				shop: "shop-1",
				optionValues: {},
				price: 15000,
				trackInventory: true,
				stockOnHand: 5,
				stockReserved: 1,
			},
		],
		"stock-movements": [],
		"buyer-phone-scores": [],
	});
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const asUser = (payload: ReturnType<typeof seed>, id: string, role = "user") =>
	payload.auth.mockResolvedValue({ user: { id, role } });

const post = (url: string, body?: Record<string, unknown>) =>
	new Request(`http://localhost${url}`, {
		method: "POST",
		...(body
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

describe("POST /api/orders/{id}/accept", () => {
	it("moves the order to accepted for an owner", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/accept/route"
		);
		const response = await POST(post("/x"), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe("accepted");
	});

	it("refuses the buyer with shop.notMember", async () => {
		const payload = seed();
		asUser(payload, BUYER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/accept/route"
		);
		const response = await POST(post("/x"), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe("shop.notMember");
	});

	it("refuses a stranger with order.notFound", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/accept/route"
		);
		const response = await POST(post("/x"), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(404);
		expect((await response.json()).code).toBe("order.notFound");
	});
});

describe("POST /api/orders/{id}/decline", () => {
	it("400s on a missing reason before ever touching the service", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/decline/route"
		);
		const response = await POST(post("/x", {}), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(400);
	});

	it("declines with a reason and returns the cancelled view", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/decline/route"
		);
		const response = await POST(post("/x", { reason: "seller_out_of_stock" }), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(200);
		expect((await response.json()).status).toBe("cancelled");
	});

	it("409s a decline that arrives too late (already shipped)", async () => {
		const payload = seed(baseOrder({ status: "shipped" }));
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/decline/route"
		);
		const response = await POST(post("/x", { reason: "seller_out_of_stock" }), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe("order.invalidTransition");
	});
});

describe("POST /api/orders/{id}/seller-cancel", () => {
	it("refuses staff with shop.forbidden", async () => {
		const payload = seed(baseOrder({ status: "accepted" }));
		asUser(payload, STAFF);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/seller-cancel/route"
		);
		const response = await POST(
			post("/x", { reason: "seller_other", note: "cannot fulfil" }),
			{ params: Promise.resolve({ id: "order-1" }) },
		);
		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe("shop.forbidden");
	});

	it("lets the owner cancel an accepted order", async () => {
		const payload = seed(baseOrder({ status: "accepted" }));
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/seller-cancel/route"
		);
		const response = await POST(
			post("/x", { reason: "seller_other", note: "cannot fulfil" }),
			{ params: Promise.resolve({ id: "order-1" }) },
		);
		expect(response.status).toBe(200);
		expect((await response.json()).status).toBe("cancelled");
	});
});

describe("POST /api/orders/{id}/cancel", () => {
	it("lets the buyer cancel and never exposes a handover or confirmation code", async () => {
		const payload = seed(baseOrder({ status: "placed" }));
		asUser(payload, BUYER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/cancel/route"
		);
		const response = await POST(post("/x", {}), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe("cancelled");
		expect(body.handover).toBeUndefined();
		expect(body.confirmation).toBeUndefined();
	});
});

describe("POST /api/orders/{id}/ship", () => {
	it("ships an accepted order and never exposes the handover code hash", async () => {
		const payload = seed(baseOrder({ status: "accepted" }));
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/ship/route"
		);
		const response = await POST(post("/x"), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe("shipped");
		expect(JSON.stringify(body)).not.toMatch(/codeHash/);
	});
});

describe("POST /api/orders/{id}/confirm-by-call", () => {
	it("confirms and accepts in one call, before confirmBy", async () => {
		const payload = seed(
			baseOrder({ status: "placed", deadlines: { confirmBy: FUTURE() } }),
		);
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/confirm-by-call/route"
		);
		const response = await POST(post("/x"), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(200);
		expect((await response.json()).status).toBe("accepted");
	});
});

describe("POST /api/orders/{id}/confirm", () => {
	it("is the buyer's alone: an owner gets order.notFound", async () => {
		const payload = seed(baseOrder({ status: "placed" }));
		asUser(payload, OWNER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/confirm/route"
		);
		const response = await POST(post("/x", { code: "123456" }), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(404);
		expect((await response.json()).code).toBe("order.notFound");
	});

	it("confirms the order for the buyer with a valid code", async () => {
		const payload = seed(baseOrder({ status: "placed" }));
		const order = await payload.findByID({
			collection: "orders",
			id: "order-1",
			overrideAccess: true,
		});
		const { code } = await withTransaction(payload, (req) =>
			issueConfirmationCode(req, order, { resend: false }),
		);
		asUser(payload, BUYER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/confirm/route"
		);
		const response = await POST(post("/x", { code }), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(200);
		expect((await response.json()).status).toBe("confirmed");
	});
});

describe("POST /api/orders/{id}/confirmation-code/resend", () => {
	it("never returns the plaintext code", async () => {
		const payload = seed(baseOrder({ status: "placed" }));
		asUser(payload, BUYER);
		const { POST } = await import(
			"../../src/app/(frontend)/api/orders/[id]/confirmation-code/resend/route"
		);
		const response = await POST(post("/x"), {
			params: Promise.resolve({ id: "order-1" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.code).toBeUndefined();
		expect(body.expiresAt).toBeTruthy();
	});
});
