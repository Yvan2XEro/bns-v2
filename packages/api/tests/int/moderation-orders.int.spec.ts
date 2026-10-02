// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_STATUSES } from "../../src/collections/Orders";
import { cancelOrder } from "../../src/services/moderation";
import { fakePayload } from "./helpers/fakePayload";

const MOD = { id: "mod-1", role: "moderator" };
const USER = { id: "user-1", role: "user" };

const CANCELLABLE_STATUSES = ["placed", "confirmed", "accepted", "shipped"];

function orderWorld(status: string, overrides: Record<string, unknown> = {}) {
	return fakePayload({
		orders: [
			{
				id: "o-1",
				orderNumber: "ORD-1",
				buyer: "buyer-1",
				shop: "s-1",
				status,
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				delivery: { recipientName: "Aïcha", phone: "+237600000000" },
				amounts: { total: 20_000, currency: "XAF" },
				timestamps: { placedAt: "2026-09-01T00:00:00.000Z" },
				cancellation: null,
				...overrides,
			},
		],
		"order-items": [
			{
				id: "oi-1",
				order: "o-1",
				product: "p-1",
				variant: "v-1",
				fulfillingShop: "s-1",
				unitPrice: 10_000,
				quantity: 2,
				fulfillmentStatus: "unfulfilled",
			},
		],
		"order-events": [],
		"moderation-log": [],
		"product-variants": [
			{
				id: "v-1",
				product: "p-1",
				shop: "s-1",
				trackInventory: true,
				stockOnHand: 10,
				stockReserved: 2,
			},
		],
		"stock-movements": [],
	});
}

describe("cancelOrder — the four reachable statuses, and nothing else", () => {
	for (const status of CANCELLABLE_STATUSES) {
		it(`cancels a "${status}" order`, async () => {
			const payload = orderWorld(status);
			const result = await cancelOrder(payload, MOD, "o-1", {
				reason: "staff_policy",
			});
			expect(result.status).toBe("cancelled");
			expect(payload.store.orders[0]?.status).toBe("cancelled");
		});
	}

	for (const status of ORDER_STATUSES.filter(
		(s) => !CANCELLABLE_STATUSES.includes(s),
	)) {
		it(`refuses a "${status}" order with moderation.invalidTransition`, async () => {
			const payload = orderWorld(status);
			await expect(
				cancelOrder(payload, MOD, "o-1", { reason: "staff_policy" }),
			).rejects.toMatchObject({ code: "moderation.invalidTransition" });
			// Nothing moved: the refusal is a permission/status gate, not a
			// half-applied cancellation.
			expect(payload.store.orders[0]?.status).toBe(status);
		});
	}
});

describe("cancelOrder — the reason", () => {
	it("refuses a reason outside the three staff reasons", async () => {
		const payload = orderWorld("placed");
		await expect(
			cancelOrder(payload, MOD, "o-1", { reason: "buyer_changed_mind" }),
		).rejects.toMatchObject({ code: "moderation.reasonRequired" });
		expect(payload.store.orders[0]?.status).toBe("placed");
	});

	it("refuses staff_other with no note", async () => {
		const payload = orderWorld("placed");
		await expect(
			cancelOrder(payload, MOD, "o-1", { reason: "staff_other" }),
		).rejects.toMatchObject({ code: "moderation.reasonRequired" });
		expect(payload.store.orders[0]?.status).toBe("placed");
	});

	it("accepts staff_other with a note", async () => {
		const payload = orderWorld("placed");
		const result = await cancelOrder(payload, MOD, "o-1", {
			reason: "staff_other",
			note: "Confirmed fraud ring across three accounts",
		});
		expect(result.status).toBe("cancelled");
	});
});

describe("cancelOrder — the moderation log entry", () => {
	it("carries order.cancel, targetType order and the orderNumber in metadata", async () => {
		const payload = orderWorld("placed");
		await cancelOrder(payload, MOD, "o-1", { reason: "staff_fraud" });
		expect(payload.store["moderation-log"][0]).toMatchObject({
			action: "order.cancel",
			targetType: "order",
			targetId: "o-1",
			reason: "staff_fraud",
			metadata: { orderNumber: "ORD-1" },
		});
	});

	it("is written in the same transaction as the cancellation", async () => {
		const payload = orderWorld("placed");
		await cancelOrder(payload, MOD, "o-1", { reason: "staff_fraud" });
		expect(payload.store["moderation-log"]).toHaveLength(1);
		const transactionIds = new Set(payload.writes.map((w) => w.transactionID));
		expect(transactionIds.size).toBe(1);
	});

	it("a forced failure writing the log entry leaves neither the log nor the cancellation", async () => {
		const payload = orderWorld("placed");
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "moderation-log";

		await expect(
			cancelOrder(payload, MOD, "o-1", { reason: "staff_fraud" }),
		).rejects.toThrow();

		expect(payload.store.orders[0]?.status).toBe("placed");
		expect(payload.store["moderation-log"]).toHaveLength(0);
		expect(payload.store["order-events"]).toHaveLength(0);
		expect(payload.store["stock-movements"]).toHaveLength(0);
	});
});

describe("cancelOrder — stock", () => {
	it("releases every reserved unit", async () => {
		const payload = orderWorld("placed");
		await cancelOrder(payload, MOD, "o-1", { reason: "staff_fraud" });

		const variant = payload.store["product-variants"][0];
		expect(variant.stockReserved).toBe(0);
		expect(variant.stockOnHand).toBe(10);
		expect(payload.store["stock-movements"]).toHaveLength(1);
		expect(payload.store["stock-movements"][0]).toMatchObject({
			type: "release",
			variant: "v-1",
			order: "o-1",
		});
	});
});

describe("cancelOrder — permission, not status", () => {
	it("refuses a non-moderator with moderation.forbidden and touches nothing", async () => {
		const payload = orderWorld("placed");
		await expect(
			cancelOrder(payload, USER, "o-1", { reason: "staff_fraud" }),
		).rejects.toMatchObject({ code: "moderation.forbidden" });
		expect(payload.store.orders[0]?.status).toBe("placed");
		expect(payload.store["moderation-log"]).toHaveLength(0);
	});
});

// ─── GET/POST /api/moderation/orders/[id] ─────────────────────────────────

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

function routeWorld() {
	const payload = fakePayload({
		users: [
			{ id: MOD.id, role: "moderator" },
			{ id: USER.id, role: "user" },
		],
		orders: [
			{
				id: "o-sheet",
				orderNumber: "ORD-SHEET",
				buyer: "buyer-1",
				shop: "s-1",
				status: "shipped",
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				delivery: {
					recipientName: "Aïcha",
					phone: "+237600000000",
					city: "douala",
				},
				amounts: { total: 20_000, currency: "XAF" },
				timestamps: {},
				commission: { rateBps: 500, amount: 1_000 },
				risk: { phoneTier: "watch", refusalsAtPlacement: 3 },
			},
		],
		"order-items": [
			{
				id: "oi-sheet",
				order: "o-sheet",
				product: "p-1",
				variant: "v-1",
				fulfillingShop: "s-1",
				unitPrice: 10_000,
				quantity: 2,
				fulfillmentStatus: "unfulfilled",
			},
		],
		"order-events": [
			{
				id: "oe-both",
				order: "o-sheet",
				type: "order.placed",
				visibility: "both",
				createdAt: "2026-09-01T00:00:00.000Z",
			},
			{
				id: "oe-staff",
				order: "o-sheet",
				type: "order.note_added",
				visibility: "staff",
				createdAt: "2026-09-02T00:00:00.000Z",
			},
		],
		"moderation-log": [],
		"product-variants": [
			{
				id: "v-1",
				product: "p-1",
				shop: "s-1",
				trackInventory: true,
				stockOnHand: 10,
				stockReserved: 2,
			},
		],
		"stock-movements": [],
	});
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const asUser = (
	payload: ReturnType<typeof routeWorld>,
	id: string,
	role: string,
) => payload.auth.mockResolvedValue({ user: { id, role } });

const req = (url: string, init?: RequestInit) =>
	new Request(`http://localhost${url}`, init);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/moderation/orders/{id}", () => {
	it("shows the parties, the amounts, the staff timeline, the tier and the phone score counts — never commission, a phone hash or raw refusal rows", async () => {
		const payload = routeWorld();
		asUser(payload, MOD.id, "moderator");
		const { GET } = await import(
			"../../src/app/(frontend)/api/moderation/orders/[id]/route"
		);

		const response = await GET(req("/x"), {
			params: Promise.resolve({ id: "o-sheet" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json();

		expect(body.buyer).toEqual({ id: "buyer-1", name: null });
		expect(body.shop).toMatchObject({ id: "s-1" });
		expect(body.amounts).toMatchObject({ total: 20_000 });
		expect(body.timeline.map((e: { id: string }) => e.id).sort()).toEqual([
			"oe-both",
			"oe-staff",
		]);
		expect(body.risk).toEqual({ phoneTier: "watch", refusalsAtPlacement: 3 });

		expect(body.commission).toBeUndefined();
		const raw = JSON.stringify(body);
		expect(raw).not.toContain("phoneHash");
		expect(raw).not.toContain('refusals":[');
	});

	it("refuses a non-moderator with moderation.forbidden", async () => {
		const payload = routeWorld();
		asUser(payload, USER.id, "user");
		const { GET } = await import(
			"../../src/app/(frontend)/api/moderation/orders/[id]/route"
		);
		const response = await GET(req("/x"), {
			params: Promise.resolve({ id: "o-sheet" }),
		});
		expect(response.status).toBe(403);
		const body = await response.json();
		expect(body.code).toBe("moderation.forbidden");
	});
});

describe("POST /api/moderation/orders/{id}", () => {
	it("cancels the order for a moderator", async () => {
		const payload = routeWorld();
		payload.store.orders[0].status = "placed";
		asUser(payload, MOD.id, "moderator");
		const { POST } = await import(
			"../../src/app/(frontend)/api/moderation/orders/[id]/route"
		);
		const response = await POST(
			req("/x", {
				method: "POST",
				body: JSON.stringify({ action: "cancel", reason: "staff_fraud" }),
			}),
			{ params: Promise.resolve({ id: "o-sheet" }) },
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe("cancelled");
	});

	it("refuses a non-moderator with moderation.forbidden", async () => {
		const payload = routeWorld();
		asUser(payload, USER.id, "user");
		const { POST } = await import(
			"../../src/app/(frontend)/api/moderation/orders/[id]/route"
		);
		const response = await POST(
			req("/x", {
				method: "POST",
				body: JSON.stringify({ action: "cancel", reason: "staff_fraud" }),
			}),
			{ params: Promise.resolve({ id: "o-sheet" }) },
		);
		expect(response.status).toBe(403);
	});
});
