// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

// vi.hoisted: getPayloadMock backs the mock factory below, which vitest
// hoists above every import in this file (including the route modules, which
// pull in "payload" itself) — a plain top-level const would still be in its
// temporal dead zone when that factory runs.
const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const CART_ROUTE = "../../src/app/(frontend)/api/cart/route";
const ITEMS_ROUTE = "../../src/app/(frontend)/api/cart/items/route";
const ITEM_ROUTE = "../../src/app/(frontend)/api/cart/items/[lineId]/route";

const BUYER = { id: "u-buyer", role: "user" };
const OTHER = { id: "u-other", role: "user" };

function seed() {
	const payload = fakePayload(
		{
			users: [
				{ id: "u-buyer", name: "Buyer" },
				{ id: "u-other", name: "Other buyer" },
				{ id: "u-owner", name: "Owner" },
			],
			shops: [
				{
					id: "s-1",
					name: "Chez Awa",
					status: "active",
					owner: "u-owner",
					ordersRestrictedAt: null,
					orderSettings: { codEnabled: true },
					location: { city: "douala" },
				},
			],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
				},
			],
			products: [
				{
					id: "p-1",
					shop: "s-1",
					title: "AirPods",
					status: "active",
					delivery: { codAllowed: true },
				},
			],
			listings: [
				{
					id: "l-1",
					title: "AirPods Pro",
					status: "published",
					shop: "s-1",
					product: "p-1",
				},
			],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: "s-1",
					price: 10_000,
					trackInventory: true,
					stockOnHand: 5,
					stockReserved: 0,
					archivedAt: null,
				},
			],
			carts: [
				{
					id: "cart-other",
					user: "u-other",
					status: "active",
					items: [
						{
							id: "line-other",
							listing: "l-1",
							product: "p-1",
							variant: "v-1",
							shop: "s-1",
							quantity: 1,
							priceAtAdd: 10_000,
						},
					],
				},
			],
		},
		{
			uniques: { carts: [["user", "status"]] },
			globals: {
				"app-settings": {
					orders: {
						enabled: true,
						launchCities: [{ key: "douala", deliveryFee: 2000 }],
					},
				},
			},
		},
	);
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

function authAs(payload: ReturnType<typeof seed>, user: typeof BUYER | null) {
	payload.auth.mockResolvedValue({ user });
}

const postJson = (url: string, body: unknown) =>
	new Request(url, {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "content-type": "application/json" },
	});
const patchJson = (url: string, body: unknown) =>
	new Request(url, {
		method: "PATCH",
		body: JSON.stringify(body),
		headers: { "content-type": "application/json" },
	});
const params = (lineId: string) => ({ params: Promise.resolve({ lineId }) });

describe("every cart route requires a signed-in user", () => {
	it("GET /api/cart answers 401 for a signed-out caller", async () => {
		const payload = seed();
		authAs(payload, null);
		const { GET } = await import(CART_ROUTE);
		expect((await GET(new Request("http://x/api/cart"))).status).toBe(401);
	});

	it("DELETE /api/cart answers 401 for a signed-out caller", async () => {
		const payload = seed();
		authAs(payload, null);
		const { DELETE } = await import(CART_ROUTE);
		expect(
			(await DELETE(new Request("http://x/api/cart", { method: "DELETE" })))
				.status,
		).toBe(401);
	});

	it("POST /api/cart/items answers 401 for a signed-out caller", async () => {
		const payload = seed();
		authAs(payload, null);
		const { POST } = await import(ITEMS_ROUTE);
		expect(
			(
				await POST(
					postJson("http://x/api/cart/items", {
						listingId: "l-1",
						variantId: "v-1",
						quantity: 1,
					}),
				)
			).status,
		).toBe(401);
	});

	it("PATCH /api/cart/items/{lineId} answers 401 for a signed-out caller", async () => {
		const payload = seed();
		authAs(payload, null);
		const { PATCH } = await import(ITEM_ROUTE);
		expect(
			(
				await PATCH(
					patchJson("http://x/api/cart/items/line-other", { quantity: 2 }),
					params("line-other"),
				)
			).status,
		).toBe(401);
	});

	it("DELETE /api/cart/items/{lineId} answers 401 for a signed-out caller", async () => {
		const payload = seed();
		authAs(payload, null);
		const { DELETE } = await import(ITEM_ROUTE);
		expect(
			(
				await DELETE(
					new Request("http://x/api/cart/items/line-other", {
						method: "DELETE",
					}),
					params("line-other"),
				)
			).status,
		).toBe(401);
	});
});

describe("a cart belongs to its owner and nobody else", () => {
	it("another user's lineId answers 404 on PATCH, not 403", async () => {
		const payload = seed();
		authAs(payload, BUYER);
		const { PATCH } = await import(ITEM_ROUTE);
		const res = await PATCH(
			patchJson("http://x/api/cart/items/line-other", { quantity: 2 }),
			params("line-other"),
		);
		expect(res.status).toBe(404);
		expect((await res.json()).code).toBe("generic.notFound");
	});

	it("another user's lineId answers 404 on DELETE, not 403", async () => {
		const payload = seed();
		authAs(payload, BUYER);
		const { DELETE } = await import(ITEM_ROUTE);
		const res = await DELETE(
			new Request("http://x/api/cart/items/line-other", {
				method: "DELETE",
			}),
			params("line-other"),
		);
		expect(res.status).toBe(404);
		expect((await res.json()).code).toBe("generic.notFound");
	});

	it("the owner can act on their own lineId", async () => {
		const payload = seed();
		authAs(payload, OTHER);
		const { DELETE } = await import(ITEM_ROUTE);
		const res = await DELETE(
			new Request("http://x/api/cart/items/line-other", {
				method: "DELETE",
			}),
			params("line-other"),
		);
		expect(res.status).toBe(200);
	});
});
