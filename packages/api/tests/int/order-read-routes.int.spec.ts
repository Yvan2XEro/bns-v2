// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildContractSnapshot,
	type ContractSnapshotInput,
	snapshotHash,
} from "../../src/lib/orderContract";
import { fakePayload } from "./helpers/fakePayload";

/**
 * Runs the real services (`access/orderAccess`, `services/orders/queries`,
 * `services/orders/serialize`) against the in-memory Payload fake, only
 * mocking `getPayload` so `requireUser` resolves it instead of opening
 * Mongo — same shape as `team-routes-permissions.int.spec.ts`. Every
 * status/code/body asserted here comes from the real authorisation and
 * shaping code, not from a mocked service.
 */
const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const BUYER_A = "u-buyer-a";
const BUYER_B = "u-buyer-b";
const OWNER = "u-owner";
const MANAGER = "u-manager";
const STAFF = "u-staff";
const OUTSIDER = "u-outsider";
const MODERATOR = "u-mod";

const isoAt = (minute: number) =>
	new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();

function delivery(recipientName: string, phone = "+237600000012") {
	return {
		recipientName,
		phone,
		city: "douala",
		district: "Akwa",
		landmark: null,
		instructions: null,
	};
}

function amounts(total = 11_000) {
	return {
		subtotal: total - 1_000,
		deliveryFee: 1_000,
		total,
		currency: "XAF",
	};
}

const contractInput: ContractSnapshotInput = {
	termsVersion: "2026-09",
	locale: "fr",
	seller: {
		name: "Boutique Test",
		handle: "boutique-test",
		city: "Douala",
		phone: "+237600000001",
		rccm: null,
		niu: null,
	},
	platform: {
		legalName: "BuyNSellem",
		supportEmail: "support@buynsellem.com",
		supportPhone: "+237600000099",
	},
	items: [
		{
			title: "Robe wax",
			variantLabel: "Taille M",
			condition: "new",
			imageUrl: null,
			attributes: [],
			unitPrice: 10_000,
			quantity: 1,
			lineSubtotal: 10_000,
		},
	],
	amounts: { subtotal: 10_000, deliveryFee: 1_000, total: 11_000 },
	delivery: {
		areaText: { fr: "Douala", en: "Douala" },
		etaText: { fr: "24h", en: "24h" },
	},
	acceptHours: 24,
	withdrawalDays: 14,
	salesTermsTemplate: { fr: "Conditions FR", en: "Terms EN" },
};

const receiptSnapshot = buildContractSnapshot(contractInput);
const receiptHash = snapshotHash(receiptSnapshot);

/** All eleven statuses, each one order, all under shop s-1, buyer BUYER_A. */
const STATUS_ORDER_IDS: Record<string, string> = {
	placed: "o-placed",
	confirmed: "o-confirmed",
	paid: "o-paid",
	accepted: "o-accepted",
	shipped: "o-shipped",
	delivered: "o-delivered",
	completed: "o-completed",
	cancelled: "o-cancelled",
	delivery_failed: "o-failed",
	returned: "o-returned",
	disputed: "o-disputed",
};

function baseOrders() {
	return Object.entries(STATUS_ORDER_IDS).map(([status, id], i) => ({
		id,
		orderNumber: `ORD-${status.toUpperCase()}`,
		buyer: BUYER_A,
		shop: "s-1",
		status,
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		delivery: delivery(`Recipient ${status}`),
		amounts: amounts(),
		timestamps: {},
		createdAt: isoAt(i + 1),
		updatedAt: isoAt(i + 1),
	}));
}

function seed() {
	const payload = fakePayload({
		users: [
			{ id: BUYER_A, role: "user", name: "Alice Buyer" },
			{ id: BUYER_B, role: "user" },
			{ id: OWNER, role: "user" },
			{ id: MANAGER, role: "user" },
			{ id: STAFF, role: "user" },
			{ id: OUTSIDER, role: "user" },
			{ id: MODERATOR, role: "moderator" },
		],
		shops: [
			{
				id: "s-1",
				status: "active",
				owner: OWNER,
				level: 2,
				name: "Boutique Test",
				handle: "boutique-test",
				location: { city: "douala" },
				contact: { phone: "+237600000001" },
			},
		],
		"shop-members": [
			{
				id: "m-owner",
				shop: "s-1",
				user: OWNER,
				role: "owner",
				status: "active",
			},
			{
				id: "m-manager",
				shop: "s-1",
				user: MANAGER,
				role: "manager",
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
			...baseOrders(),
			{
				id: "o-buyer-b",
				orderNumber: "ORD-BUYER-B",
				buyer: BUYER_B,
				shop: "s-1",
				status: "placed",
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				delivery: delivery("Zoe Special"),
				amounts: amounts(),
				timestamps: {},
				createdAt: isoAt(50),
				updatedAt: isoAt(50),
			},
			{
				id: "o-receipt",
				orderNumber: "ORD-RECEIPT",
				buyer: BUYER_A,
				shop: "s-1",
				status: "placed",
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				delivery: delivery("Receipt Recipient"),
				amounts: amounts(),
				timestamps: {},
				contract: { snapshot: receiptSnapshot, snapshotHash: receiptHash },
				createdAt: isoAt(60),
				updatedAt: isoAt(60),
			},
		],
		"order-items": [
			{
				id: "oi-placed-1",
				order: "o-placed",
				product: "p-1",
				variant: "v-1",
				fulfillingShop: "s-1",
				snapshot: { title: "Item" },
				unitPrice: 10_000,
				quantity: 1,
				lineSubtotal: 10_000,
				fulfillmentStatus: "unfulfilled",
			},
		],
		"order-events": [
			{
				id: "oe-placed-both",
				order: "o-placed",
				type: "order.placed",
				visibility: "both",
				createdAt: isoAt(1),
			},
			{
				id: "oe-placed-staff",
				order: "o-placed",
				type: "order.note_added",
				visibility: "staff",
				createdAt: isoAt(1),
			},
		],
	});
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const asUser = (payload: ReturnType<typeof seed>, id: string, role = "user") =>
	payload.auth.mockResolvedValue({ user: { id, role } });

const get = (url: string) => new Request(`http://localhost${url}`);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/shops/{id}/orders — the six tabs", () => {
	const cases: Array<{ tab: string; statuses: string[] }> = [
		{ tab: "to_accept", statuses: ["placed", "confirmed", "paid"] },
		{ tab: "to_ship", statuses: ["accepted"] },
		{ tab: "shipped", statuses: ["shipped"] },
		{ tab: "delivered", statuses: ["delivered", "completed"] },
		{ tab: "cancelled", statuses: ["cancelled"] },
		{ tab: "failed", statuses: ["delivery_failed"] },
	];

	for (const { tab, statuses } of cases) {
		it(`"${tab}" returns exactly the orders in {${statuses.join(", ")}}`, async () => {
			const payload = seed();
			asUser(payload, OWNER);
			const { GET } = await import(
				"../../src/app/(frontend)/api/shops/[id]/orders/route"
			);
			const response = await GET(get(`/x?tab=${tab}`), {
				params: Promise.resolve({ id: "s-1" }),
			});
			expect(response.status).toBe(200);
			const body = await response.json();
			const gotIds = (body.docs as Array<{ id: string }>)
				.map((d) => d.id)
				.sort();
			// "to_accept" also carries the extra buyer-b/receipt placed orders
			// seeded above; restrict the comparison to the eleven base statuses'
			// ids plus whatever this tab actually owns among them.
			const baseExpected = Object.entries(STATUS_ORDER_IDS)
				.filter(([s]) => statuses.includes(s))
				.map(([, id]) => id)
				.sort();
			for (const id of baseExpected) expect(gotIds).toContain(id);
			// And nothing from a status this tab does NOT own.
			const otherStatusIds = Object.entries(STATUS_ORDER_IDS)
				.filter(([s]) => !statuses.includes(s))
				.map(([, id]) => id);
			for (const id of otherStatusIds) expect(gotIds).not.toContain(id);
		});
	}
});

describe("GET /api/shops/{id}/orders — counts agree with the rows", () => {
	it("every tab's count equals the number of rows that tab actually returns", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		for (const tab of [
			"to_accept",
			"to_ship",
			"shipped",
			"delivered",
			"cancelled",
			"failed",
		]) {
			const response = await GET(get(`/x?tab=${tab}`), {
				params: Promise.resolve({ id: "s-1" }),
			});
			const body = await response.json();
			expect(body.counts[tab]).toBe(body.docs.length);
		}
	});

	// The case the test above cannot see: without `q` the counts and the rows
	// are filtered identically, so they agree whatever the count query does.
	// With a search they only agree if `q` narrows both — and it did not, so
	// the tab bar read 12 while the open tab showed 3.
	it("still agrees when a search narrows the list", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		for (const tab of [
			"to_accept",
			"to_ship",
			"shipped",
			"delivered",
			"cancelled",
			"failed",
		]) {
			const response = await GET(get(`/x?tab=${tab}&q=BNS`), {
				params: Promise.resolve({ id: "s-1" }),
			});
			const body = await response.json();
			expect(body.counts[tab]).toBe(body.docs.length);
		}
	});

	it("a search that matches nothing zeroes every count", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get("/x?tab=to_accept&q=zzz-no-such-order"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		const body = await response.json();
		expect(body.docs).toHaveLength(0);
		for (const count of Object.values(body.counts)) expect(count).toBe(0);
	});
});

describe("GET /api/shops/{id}/orders — q", () => {
	it("matches the order number", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get("/x?tab=to_accept&q=ORD-PLACED"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		const body = await response.json();
		expect(body.docs.map((d: { id: string }) => d.id)).toEqual(["o-placed"]);
	});

	it("matches the recipient name", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get("/x?tab=to_accept&q=Zoe"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		const body = await response.json();
		expect(body.docs.map((d: { id: string }) => d.id)).toEqual(["o-buyer-b"]);
	});

	it("matches nothing else — a buyer id substring finds no order", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get(`/x?tab=to_accept&q=${BUYER_A}`), {
			params: Promise.resolve({ id: "s-1" }),
		});
		const body = await response.json();
		expect(body.docs).toEqual([]);
	});
});

describe("GET /api/shops/{id}/orders — cursor pagination", () => {
	function seedPagination() {
		const orders = Array.from({ length: 25 }, (_, i) => ({
			id: `o-page-${i}`,
			orderNumber: `ORD-PAGE-${i}`,
			buyer: BUYER_A,
			shop: "s-page",
			status: "placed",
			paymentMethod: "cod",
			paymentStatus: "cod_pending",
			delivery: delivery(`Page recipient ${i}`),
			amounts: amounts(),
			timestamps: {},
			createdAt: isoAt(i + 1),
			updatedAt: isoAt(i + 1),
		}));
		const payload = fakePayload({
			users: [{ id: OWNER, role: "user" }],
			shops: [{ id: "s-page", status: "active", owner: OWNER, level: 2 }],
			"shop-members": [
				{
					id: "m-owner-page",
					shop: "s-page",
					user: OWNER,
					role: "owner",
					status: "active",
				},
			],
			orders,
		});
		getPayloadMock.mockResolvedValue(payload);
		return payload;
	}

	it("paginates 25 orders across two pages without repeating or skipping one", async () => {
		const payload = seedPagination();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const first = await GET(get("/x?tab=to_accept"), {
			params: Promise.resolve({ id: "s-page" }),
		});
		const firstBody = await first.json();
		expect(firstBody.docs).toHaveLength(20);
		expect(firstBody.nextCursor).not.toBeNull();

		const second = await GET(
			get(
				`/x?tab=to_accept&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
			),
			{ params: Promise.resolve({ id: "s-page" }) },
		);
		const secondBody = await second.json();
		expect(secondBody.docs).toHaveLength(5);
		expect(secondBody.nextCursor).toBeNull();

		const firstIds = firstBody.docs.map((d: { id: string }) => d.id);
		const secondIds = secondBody.docs.map((d: { id: string }) => d.id);
		expect(new Set([...firstIds, ...secondIds]).size).toBe(25);
		expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false);
	});
});

describe("GET /api/shops/{id}/orders — permissions", () => {
	it("a staff member (orders.view) may list, and sees no commission column", async () => {
		const payload = seed();
		asUser(payload, STAFF);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get("/x?tab=to_accept"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.docs.length).toBeGreaterThan(0);
		for (const row of body.docs) expect("commission" in row).toBe(false);
	});

	it("an owner's list rows also carry no commission column — lists never do", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get("/x?tab=to_accept"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		const body = await response.json();
		for (const row of body.docs) expect("commission" in row).toBe(false);
	});

	it("a non-member gets shop.notMember", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get("/x?tab=to_accept"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "shop.notMember" });
	});

	it("an unknown tab is a 400, not a silent all-orders list", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get("/x?tab=everything"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		expect(response.status).toBe(400);
	});

	it("a missing tab is also a 400", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		expect(response.status).toBe(400);
	});
});

describe("the wire shape, through the real routes", () => {
	/**
	 * `serialize.ts` is pinned field for field by
	 * `order-serialize.int.spec.ts`; these three cover the other half — that
	 * `queries.ts` actually loads the shop, the buyer and the items the
	 * contract's rows and blocks are built from. A loader wired up wrongly
	 * sends a correct shape full of empty strings.
	 */
	it("a buyer's list row is exactly the contract's OrderListEntry", async () => {
		const payload = seed();
		asUser(payload, BUYER_A);
		const { GET } = await import("../../src/app/(frontend)/api/orders/route");
		const response = await GET(get("/x?role=buyer&status=placed"));
		expect(response.status).toBe(200);
		const body = await response.json();
		const row = (body.docs as Array<{ id: string }>).find(
			(d) => d.id === "o-placed",
		);
		expect(row).toEqual({
			id: "o-placed",
			orderNumber: "ORD-PLACED",
			status: "placed",
			placedAt: isoAt(1),
			total: 11_000,
			itemCount: 1,
			firstItemTitle: "Item",
			firstItemImageUrl: null,
			shopName: "Boutique Test",
			deliveryFailureReason: null,
		});
	});

	it("a shop queue row adds the recipient, the accept clock and the tier, and nothing else", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/orders/route"
		);
		const response = await GET(get("/x?tab=to_accept"), {
			params: Promise.resolve({ id: "s-1" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		const row = (body.docs as Array<{ id: string }>).find(
			(d) => d.id === "o-placed",
		);
		expect(row).toEqual({
			id: "o-placed",
			orderNumber: "ORD-PLACED",
			status: "placed",
			placedAt: isoAt(1),
			total: 11_000,
			itemCount: 1,
			firstItemTitle: "Item",
			firstItemImageUrl: null,
			shopName: "Boutique Test",
			deliveryFailureReason: null,
			recipientName: "Recipient placed",
			acceptBy: null,
			phoneTier: "new",
		});
	});

	it("the order view carries the shop block the contract declares, and the buyer block only for the shop", async () => {
		const payload = seed();
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/route"
		);
		const expectedShop = {
			id: "s-1",
			name: "Boutique Test",
			handle: "boutique-test",
			logoUrl: null,
			city: "douala",
			phone: "+237600000001",
		};

		asUser(payload, BUYER_A);
		const buyerBody = await (
			await GET(get("/x"), { params: Promise.resolve({ id: "o-placed" }) })
		).json();
		expect(buyerBody.shop).toEqual(expectedShop);
		expect("buyer" in buyerBody).toBe(false);

		asUser(payload, OWNER);
		const shopBody = await (
			await GET(get("/x"), { params: Promise.resolve({ id: "o-placed" }) })
		).json();
		expect(shopBody.shop).toEqual(expectedShop);
		expect(shopBody.buyer).toEqual({ id: BUYER_A, name: "Alice Buyer" });
		expect(shopBody.risk).toEqual({ phoneTier: "new", refusalsAtPlacement: 0 });
	});
});

describe("GET /api/orders — the buyer's own purchase list", () => {
	it("never includes another buyer's order", async () => {
		const payload = seed();
		asUser(payload, BUYER_A);
		const { GET } = await import("../../src/app/(frontend)/api/orders/route");
		const response = await GET(get("/x?role=buyer"));
		expect(response.status).toBe(200);
		const body = await response.json();
		const ids = body.docs.map((d: { id: string }) => d.id);
		expect(ids).not.toContain("o-buyer-b");
	});

	it("lists the calling buyer's own orders", async () => {
		const payload = seed();
		asUser(payload, BUYER_B);
		const { GET } = await import("../../src/app/(frontend)/api/orders/route");
		const response = await GET(get("/x?role=buyer"));
		const body = await response.json();
		const ids = body.docs.map((d: { id: string }) => d.id);
		expect(ids).toContain("o-buyer-b");
	});
});

describe("GET /api/orders/{id} — the order view", () => {
	it("a buyer sees their own order, with no internal event in the timeline", async () => {
		const payload = seed();
		asUser(payload, BUYER_A);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-placed" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect("commission" in body).toBe(false);
		expect("risk" in body).toBe(false);
		const eventIds = body.timeline.map((e: { id: string }) => e.id);
		expect(eventIds).toContain("oe-placed-both");
		expect(eventIds).not.toContain("oe-placed-staff");
	});

	it("a stranger gets order.notFound, never a 403", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-placed" }),
		});
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: "order.notFound" });
	});

	it("another buyer gets order.notFound for a buyer's order that is not theirs", async () => {
		const payload = seed();
		asUser(payload, BUYER_B);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-placed" }),
		});
		expect(response.status).toBe(404);
	});

	it("a staff member's payload carries no commission column", async () => {
		const payload = seed();
		asUser(payload, STAFF);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-placed" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect("commission" in body).toBe(false);
	});

	it("an owner's payload does carry the commission column", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-placed" }),
		});
		const body = await response.json();
		expect("commission" in body).toBe(true);
	});

	it("staff (the moderator role) sees no commission either", async () => {
		const payload = seed();
		asUser(payload, MODERATOR, "moderator");
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-placed" }),
		});
		const body = await response.json();
		expect("commission" in body).toBe(false);
	});
});

describe("GET /api/orders/{id}/receipt", () => {
	it("is available to the buyer", async () => {
		const payload = seed();
		asUser(payload, BUYER_A);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/receipt/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-receipt" }),
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
	});

	it("is available to the shop", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/receipt/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-receipt" }),
		});
		expect(response.status).toBe(200);
	});

	it("is available to staff", async () => {
		const payload = seed();
		asUser(payload, MODERATOR, "moderator");
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/receipt/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-receipt" }),
		});
		expect(response.status).toBe(200);
	});

	it("states the withdrawal rule while the order is undelivered", async () => {
		const payload = seed();
		asUser(payload, BUYER_A);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/receipt/route"
		);
		const response = await GET(get("/x?lang=en"), {
			params: Promise.resolve({ id: "o-receipt" }),
		});
		const html = await response.text();
		expect(html).toContain(
			"Withdrawal period: 14 days from receiving the parcel.",
		);
		expect(html).not.toContain("Withdrawal deadline");
	});

	it("prints the order's own withdrawalUntil once delivered", async () => {
		const payload = seed();
		const order = payload.store.orders.find((o) => o.id === "o-receipt");
		if (!order) throw new Error("test fixture: no o-receipt");
		order.status = "delivered";
		order.deadlines = { withdrawalUntil: "2026-10-03T14:00:00.000Z" };
		asUser(payload, BUYER_A);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/receipt/route"
		);
		const response = await GET(get("/x?lang=en"), {
			params: Promise.resolve({ id: "o-receipt" }),
		});
		const html = await response.text();
		const expected = new Intl.DateTimeFormat("en-GB", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date("2026-10-03T14:00:00.000Z"));
		expect(html).toContain(`<p>Withdrawal deadline: ${expected}</p>`);
	});

	it("answers order.notFound for a stranger — nobody else", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/receipt/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-receipt" }),
		});
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: "order.notFound" });
	});

	it("renders French by default", async () => {
		const payload = seed();
		asUser(payload, BUYER_A);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/receipt/route"
		);
		const response = await GET(get("/x"), {
			params: Promise.resolve({ id: "o-receipt" }),
		});
		const html = await response.text();
		expect(html).toContain("Recu de commande");
	});

	it("?lang=en renders English", async () => {
		const payload = seed();
		asUser(payload, BUYER_A);
		const { GET } = await import(
			"../../src/app/(frontend)/api/orders/[id]/receipt/route"
		);
		const response = await GET(get("/x?lang=en"), {
			params: Promise.resolve({ id: "o-receipt" }),
		});
		const html = await response.text();
		expect(html).toContain("Order receipt");
		expect(html).not.toContain("Recu de commande");
	});
});
