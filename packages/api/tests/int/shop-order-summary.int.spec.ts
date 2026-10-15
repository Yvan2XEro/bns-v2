// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getShopOrderWeek } from "../../src/services/orders/shopSummary";
import { fakePayload } from "./helpers/fakePayload";

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const OWNER = "u-owner";
const STAFF = "u-staff";
const OUTSIDER = "u-outsider";
const NOW = new Date("2026-09-15T12:00:00.000Z");
const daysAgo = (days: number) =>
	new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function order(
	id: string,
	status: string,
	extra: Record<string, unknown> = {},
) {
	return {
		id,
		orderNumber: `ORD-${id}`,
		shop: "s-1",
		status,
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: { recipientName: "R", phone: "+237600000012" },
		amounts: { subtotal: 100_000, deliveryFee: 2_000, total: 102_000 },
		timestamps: {},
		createdAt: daysAgo(1),
		updatedAt: daysAgo(1),
		...extra,
	};
}

function seed() {
	const payload = fakePayload({
		users: [
			{ id: OWNER, role: "user" },
			{ id: STAFF, role: "user" },
			{ id: OUTSIDER, role: "user" },
		],
		shops: [{ id: "s-1", status: "active", owner: OWNER, level: 2 }],
		"shop-members": [
			{ id: "m-o", shop: "s-1", user: OWNER, role: "owner", status: "active" },
			{ id: "m-s", shop: "s-1", user: STAFF, role: "staff", status: "active" },
		],
		orders: [
			order("placed", "placed"),
			order("confirmed", "confirmed"),
			order("accepted", "accepted"),
			order("old-accepted", "accepted", { createdAt: daysAgo(20) }),
			order("delivered", "delivered", {
				createdAt: daysAgo(10),
				timestamps: { deliveredAt: daysAgo(2) },
				commission: { rateBps: 800, amount: 8_000 },
			}),
			order("completed", "completed", {
				timestamps: { deliveredAt: daysAgo(3) },
				amounts: { subtotal: 50_000, discount: 5_000, total: 47_000 },
				commission: { rateBps: 800, amount: 3_600 },
			}),
			order("delivered-long-ago", "completed", {
				createdAt: daysAgo(30),
				timestamps: { deliveredAt: daysAgo(25) },
				commission: { rateBps: 800, amount: 8_000 },
			}),
			order("refused", "delivery_failed", {
				timestamps: { failedAt: daysAgo(1) },
				deliveryFailure: { reason: "refused", attempts: 2 },
			}),
			order("absent", "delivery_failed", {
				timestamps: { failedAt: daysAgo(1) },
				deliveryFailure: { reason: "absent", attempts: 2 },
			}),
			{ ...order("other-shop", "confirmed"), shop: "s-2" },
		],
	});
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const asUser = (payload: ReturnType<typeof seed>, id: string) =>
	payload.auth.mockResolvedValue({ user: { id, role: "user" } });
const get = () => new Request("http://localhost/x");
const params = { params: Promise.resolve({ id: "s-1" }) };

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/shops/{id}/orders/queue", () => {
	it("counts this shop's orders to accept and to ship, whatever their age", async () => {
		const payload = seed();
		asUser(payload, STAFF);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/queue/route"
		);
		const response = await GET(get(), params);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ toAccept: 2, toShip: 2 });
	});

	it("refuses a non-member", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/queue/route"
		);
		const response = await GET(get(), params);
		expect(response.status).toBe(403);
	});
});

describe("the dashboard's seven days", () => {
	it("counts placed, delivered and refused orders on their own event's date", async () => {
		const payload = seed();
		const week = await getShopOrderWeek(payload, { id: OWNER }, "s-1", NOW);
		expect(week.orders).toBe(6);
		expect(week.delivered).toBe(2);
		expect(week.refused).toBe(1);
		expect(week.deliveredSales).toBe(145_000);
		expect(week.commission).toEqual({ amount: 11_600, rateBps: 800 });
	});

	it("leaves the commission out for a member without payments.view", async () => {
		const payload = seed();
		const week = await getShopOrderWeek(payload, { id: STAFF }, "s-1", NOW);
		expect(week.commission).toBeNull();
		expect(week.delivered).toBe(2);
	});

	it("the route refuses a non-member", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/week/route"
		);
		const response = await GET(get(), params);
		expect(response.status).toBe(403);
	});
});
