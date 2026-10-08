// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

/**
 * `GET`/`PATCH /api/shops/{id}/order-settings`, the route that answers the
 * plan's `OrderSettingsView`. The real services run against the in-memory
 * Payload fake; only `getPayload` is mocked, so every status and code below
 * comes from `requireShopPermission` deciding for real.
 *
 * The bodies are asserted whole (`toEqual`, not `toMatchObject`): the two
 * server-derived fields, `caps` and `cityDefaultFee`, are the reason this
 * route exists, and a serialiser that silently stopped emitting one would
 * satisfy any partial match.
 */

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const OWNER = "u-owner";
const MANAGER = "u-mgr";
const STAFF = "u-staff";
const OUTSIDER = "u-outsider";

type Over = {
	shop?: Record<string, unknown>;
	orderSettings?: Record<string, unknown> | undefined;
	launchCities?: Array<{ key: string; deliveryFee: number }>;
	deliveryZonesEnabled?: boolean;
};

function seed(over: Over = {}) {
	const payload = fakePayload(
		{
			users: [
				{ id: OWNER, role: "user", name: "Aicha" },
				{ id: MANAGER, role: "user", name: "Bruno" },
				{ id: STAFF, role: "user", name: "Clara" },
				{ id: OUTSIDER, role: "user", name: "Dede" },
			],
			shops: [
				{
					id: "s-1",
					handle: "chez-awa",
					name: "Chez Awa",
					owner: OWNER,
					status: "active",
					level: 2,
					levelExpiresAt: null,
					location: { city: "douala" },
					orderSettings:
						over.orderSettings === undefined
							? {
									codEnabled: true,
									sellerDeliveryEnabled: true,
									deliveryFee: 1500,
									deliveryEtaText: "24-48h",
									pickupEnabled: true,
									pickupPoint: {
										address: "Rue Njo-Njo, Bonapriso",
										landmark: "Face pharmacie",
										gps: { lat: 4.03, lng: 9.7 },
										hours: "08h-18h",
									},
									salesTermsExtra: "Retour sous 7 jours",
								}
							: over.orderSettings,
					...over.shop,
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
					id: "m-mgr",
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
		},
		{
			uniques: { "shop-members": [["shop", "user"]] },
			globals: {
				"app-settings": {
					delivery: { zonesEnabled: over.deliveryZonesEnabled === true },
					orders: {
						enabled: true,
						launchCities: over.launchCities ?? [
							{ key: "douala", deliveryFee: 2000 },
							{ key: "yaounde", deliveryFee: 3500 },
						],
					},
				},
			},
		},
	);
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const asUser = (payload: ReturnType<typeof seed>, id: string | null) =>
	payload.auth.mockResolvedValue({ user: id ? { id, role: "user" } : null });

const get = () => new Request("http://localhost/x");
const patch = (body: unknown) =>
	new Request("http://localhost/x", {
		method: "PATCH",
		body: JSON.stringify(body),
	});
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * Imported once at module scope, not inside the first test: the route pulls
 * in the shop services and every collection behind them, a one-time load
 * measured in seconds that otherwise lands entirely on whichever test runs
 * first and times it out under a parallel suite run.
 */
const { GET, PATCH } = await import(
	"../../src/app/(frontend)/api/shops/[id]/order-settings/route"
);

const FULL_VIEW = {
	codEnabled: true,
	sellerDeliveryEnabled: true,
	deliveryFee: 1500,
	deliveryEtaText: "24-48h",
	pickupEnabled: true,
	pickupPoint: {
		address: "Rue Njo-Njo, Bonapriso",
		landmark: "Face pharmacie",
		gps: { lat: 4.03, lng: 9.7 },
		hours: "08h-18h",
	},
	salesTermsExtra: "Retour sous 7 jours",
	caps: { maxOrderTotal: 500_000, maxDailyOrders: 100, maxOpenOrders: 200 },
	cityDefaultFee: 2000,
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/shops/{id}/order-settings", () => {
	it("answers the whole OrderSettingsView, caps and city default included", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const response = await GET(get(), params("s-1"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(FULL_VIEW);
	});

	// The caps follow the *effective* level, the figure checkout enforces, so
	// a level-2 shop whose `levelExpiresAt` has passed is shown level-1
	// ceilings rather than the ones its stored level would suggest.
	it("drops to the level-1 caps once the shop's level has expired", async () => {
		const payload = seed({
			shop: { levelExpiresAt: "2026-01-01T00:00:00.000Z" },
		});
		// The owner, not the manager: an expired level-2 also takes `teamMembers`
		// away, so a manager's own role resolves to null there.
		asUser(payload, OWNER);
		const body = await (await GET(get(), params("s-1"))).json();

		expect(body.caps).toEqual({
			maxOrderTotal: 150_000,
			maxDailyOrders: 20,
			maxOpenOrders: 30,
		});
	});

	it("answers null caps for a shop whose level grants no cash on delivery", async () => {
		const payload = seed({ shop: { status: "suspended" } });
		asUser(payload, OWNER);
		const body = await (await GET(get(), params("s-1"))).json();

		expect(body.caps).toBeNull();
		expect(body.codEnabled).toBe(true);
	});

	it("takes the city default from the settings global, not from the city table", async () => {
		const payload = seed({
			launchCities: [{ key: "douala", deliveryFee: 2600 }],
		});
		asUser(payload, OWNER);
		expect(
			(await (await GET(get(), params("s-1"))).json()).cityDefaultFee,
		).toBe(2600);
	});

	it("falls back to the launch city's own default when the global lists no fee", async () => {
		const payload = seed({ launchCities: [] });
		asUser(payload, OWNER);
		expect(
			(await (await GET(get(), params("s-1"))).json()).cityDefaultFee,
		).toBe(2000);
	});

	it("answers null cityDefaultFee for a shop outside the launch cities", async () => {
		const payload = seed({ shop: { location: { city: "kribi" } } });
		asUser(payload, OWNER);
		expect(
			(await (await GET(get(), params("s-1"))).json()).cityDefaultFee,
		).toBeNull();
	});

	it("reads an empty group as COD off, seller delivery on and no pickup point", async () => {
		const payload = seed({ orderSettings: {} });
		asUser(payload, OWNER);
		expect(await (await GET(get(), params("s-1"))).json()).toEqual({
			codEnabled: false,
			sellerDeliveryEnabled: true,
			deliveryFee: null,
			deliveryEtaText: null,
			pickupEnabled: false,
			pickupPoint: null,
			salesTermsExtra: null,
			caps: { maxOrderTotal: 500_000, maxDailyOrders: 100, maxOpenOrders: 200 },
			cityDefaultFee: 2000,
		});
	});

	it("drops a pickup point with no address, and a half-captured GPS pair", async () => {
		const payload = seed({
			orderSettings: {
				pickupEnabled: true,
				pickupPoint: { landmark: "Face pharmacie", gps: { lat: 4.03 } },
			},
		});
		asUser(payload, OWNER);
		const body = await (await GET(get(), params("s-1"))).json();
		expect(body.pickupPoint).toBeNull();

		const withAddress = seed({
			orderSettings: {
				pickupEnabled: true,
				pickupPoint: { address: "Akwa", gps: { lat: 4.03 } },
			},
		});
		asUser(withAddress, OWNER);
		expect(
			(await (await GET(get(), params("s-1"))).json()).pickupPoint,
		).toEqual({
			address: "Akwa",
			landmark: null,
			gps: null,
			hours: null,
		});
	});

	it("answers 401 without a session", async () => {
		const payload = seed();
		asUser(payload, null);
		const response = await GET(get(), params("s-1"));

		expect(response.status).toBe(401);
		expect((await response.json()).code).toBe("generic.unauthorized");
	});

	it("refuses a staff member, who has no payments.view", async () => {
		const payload = seed();
		asUser(payload, STAFF);
		const response = await GET(get(), params("s-1"));

		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe("shop.forbidden");
	});

	it("refuses someone who is not a member at all", async () => {
		const payload = seed();
		asUser(payload, OUTSIDER);
		const response = await GET(get(), params("s-1"));

		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe("shop.notMember");
	});

	it("answers shop.notFound for a shop that does not exist", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const response = await GET(get(), params("s-404"));

		expect(response.status).toBe(404);
		expect((await response.json()).code).toBe("shop.notFound");
	});
});

describe("PATCH /api/shops/{id}/order-settings", () => {
	it("refuses enabling COD when the shop has no active delivery option", async () => {
		const payload = seed({
			orderSettings: { codEnabled: false },
			deliveryZonesEnabled: true,
		});
		asUser(payload, OWNER);
		const response = await PATCH(patch({ codEnabled: true }), params("s-1"));

		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe("delivery.noActiveOption");
		expect(payload.store.shops[0].orderSettings).toMatchObject({
			codEnabled: false,
		});
	});

	it("allows enabling COD when the shop has an active COD delivery zone", async () => {
		const payload = seed({
			orderSettings: { codEnabled: false },
			deliveryZonesEnabled: true,
		});
		await payload.create({
			collection: "delivery-zones",
			overrideAccess: true,
			data: {
				shop: "s-1",
				name: "City zone",
				scope: "same_city",
				city: "douala",
				method: "seller_delivery",
				fee: 1500,
				etaMinHours: 24,
				etaMaxHours: 48,
				codAllowed: true,
				active: true,
			},
		});
		asUser(payload, OWNER);

		const response = await PATCH(patch({ codEnabled: true }), params("s-1"));

		expect(response.status).toBe(200);
		expect(payload.store.shops[0].orderSettings).toMatchObject({
			codEnabled: true,
		});
	});

	it("writes the keys it was given, keeps the rest, and answers the fresh view", async () => {
		const payload = seed();
		asUser(payload, MANAGER);
		const response = await PATCH(
			patch({ codEnabled: false, deliveryFee: 3000 }),
			params("s-1"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			...FULL_VIEW,
			codEnabled: false,
			deliveryFee: 3000,
		});
		expect(payload.store.shops[0].orderSettings).toMatchObject({
			codEnabled: false,
			deliveryFee: 3000,
			deliveryEtaText: "24-48h",
			salesTermsExtra: "Retour sous 7 jours",
		});
	});

	it("clears a field the caller sent as null without touching its neighbours", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const body = await (
			await PATCH(patch({ deliveryFee: null }), params("s-1"))
		).json();

		expect(body.deliveryFee).toBeNull();
		expect(body.deliveryEtaText).toBe("24-48h");
		expect(body.cityDefaultFee).toBe(2000);
	});

	it("replaces the pickup point it is given and keeps the fields it omits", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const body = await (
			await PATCH(
				patch({ pickupPoint: { address: "Marche Mboppi", hours: "09h-17h" } }),
				params("s-1"),
			)
		).json();

		expect(body.pickupPoint).toEqual({
			address: "Marche Mboppi",
			landmark: "Face pharmacie",
			gps: { lat: 4.03, lng: 9.7 },
			hours: "09h-17h",
		});
	});

	it("drops the pickup point entirely when sent null", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const body = await (
			await PATCH(patch({ pickupPoint: null }), params("s-1"))
		).json();

		expect(body.pickupPoint).toBeNull();
	});

	it("refuses a fee above the collection's 20 000 ceiling", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const response = await PATCH(patch({ deliveryFee: 25_000 }), params("s-1"));

		expect(response.status).toBe(400);
		expect((await response.json()).code).toBe("generic.validation");
		expect(payload.store.shops[0].orderSettings).toMatchObject({
			deliveryFee: 1500,
		});
	});

	it("refuses a key that is not part of the group", async () => {
		const payload = seed();
		asUser(payload, OWNER);
		const response = await PATCH(
			patch({ codEnabled: true, ordersRestrictedAt: null }),
			params("s-1"),
		);

		expect(response.status).toBe(400);
		expect((await response.json()).code).toBe("generic.validation");
	});

	it("refuses a staff member, who has no settings.edit", async () => {
		const payload = seed();
		asUser(payload, STAFF);
		const response = await PATCH(patch({ codEnabled: false }), params("s-1"));

		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe("shop.forbidden");
		expect(payload.store.shops[0].orderSettings).toMatchObject({
			codEnabled: true,
		});
	});

	it("refuses a write to a shop that is not active", async () => {
		const payload = seed({ shop: { status: "suspended" } });
		asUser(payload, OWNER);
		const response = await PATCH(patch({ codEnabled: false }), params("s-1"));

		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe("shop.inactive");
		expect(payload.store.shops[0].orderSettings).toMatchObject({
			codEnabled: true,
		});
	});

	it("answers 401 without a session and writes nothing", async () => {
		const payload = seed();
		asUser(payload, null);
		const response = await PATCH(patch({ codEnabled: false }), params("s-1"));

		expect(response.status).toBe(401);
		expect(payload.store.shops[0].orderSettings).toMatchObject({
			codEnabled: true,
		});
	});
});
