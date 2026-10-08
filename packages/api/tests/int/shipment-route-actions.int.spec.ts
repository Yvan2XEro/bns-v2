// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

import { FakeCourierProvider } from "../../src/lib/delivery/fakeCourier";
import { registerCourierProvider } from "../../src/lib/delivery/registry";
import { fakePayload } from "./helpers/fakePayload";

const SHIPMENT_ID = "shipment-route-1";
const RIDER_ID = "rider-route-1";

function seed() {
	const payload = fakePayload({
		users: [
			{ id: RIDER_ID, role: "user" },
			{ id: "dispatcher", role: "user" },
			{ id: "stranger", role: "user" },
		],
		orders: [
			{ id: "order-route-1", status: "shipped", shipments: [SHIPMENT_ID] },
		],
		shipments: [
			{
				id: SHIPMENT_ID,
				shipmentNumber: "SHP-2610-000041",
				order: "order-route-1",
				storefrontShop: "shop-route-1",
				fulfillingShop: "shop-route-1",
				method: "courier",
				carrier: "courier",
				courier: "courier-route-1",
				rider: { user: RIDER_ID, name: "Rider One", phone: "+237600000041" },
				origin: { city: "douala" },
				destination: { city: "douala", phone: "+237600000042" },
				fee: 1000,
				status: "pending",
				codCollection: {
					expectedAmount: 5000,
					collectedAmount: 5000,
					collectedBy: "courier",
					remittanceStatus: "pending",
				},
			},
		],
		couriers: [
			{ id: "courier-route-1", key: "courier-route", name: "Courier" },
		],
		"courier-members": [
			{
				id: "dispatcher-member",
				courier: "courier-route-1",
				user: "dispatcher",
				role: "dispatcher",
				status: "active",
			},
			{
				id: "rider-member",
				courier: "courier-route-1",
				user: RIDER_ID,
				role: "rider",
				status: "active",
			},
		],
		"shipment-events": [],
	});
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const params = { params: Promise.resolve({ id: SHIPMENT_ID }) };
const request = (body: unknown) =>
	new Request(`http://localhost/api/shipments/${SHIPMENT_ID}/picked-up`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

describe("shipment rider action routes", () => {
	beforeEach(() => vi.clearAllMocks());

	it("records pickup and transit only for the assigned rider", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: RIDER_ID, role: "user" } });
		const { POST } = await import(
			"../../src/app/(frontend)/api/shipments/[id]/picked-up/route"
		);

		const response = await POST(
			request({ gps: { lat: 4.05, lng: 9.7 } }),
			params,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: SHIPMENT_ID,
			status: "in_transit",
		});
		expect(payload.store.shipments[0]?.status).toBe("in_transit");
		expect(payload.store["shipment-events"].map((event) => event.type)).toEqual(
			["shipment.picked_up", "shipment.in_transit"],
		);
		expect(payload.store["shipment-events"][0]?.metadata).toEqual({
			gps: { lat: 4.05, lng: 9.7 },
		});
	});

	it("rejects an unassigned rider without changing the shipment", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: "stranger", role: "user" } });
		const { POST } = await import(
			"../../src/app/(frontend)/api/shipments/[id]/picked-up/route"
		);

		const response = await POST(request({}), params);

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			code: "shipment.notAssigned",
		});
		expect(payload.store.shipments[0]?.status).toBe("pending");
		expect(payload.store["shipment-events"]).toHaveLength(0);
	});

	it("rejects malformed GPS before creating any shipment event", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: RIDER_ID, role: "user" } });
		const { POST } = await import(
			"../../src/app/(frontend)/api/shipments/[id]/picked-up/route"
		);

		const response = await POST(
			request({ gps: { lat: 91, lng: 9.7 } }),
			params,
		);

		expect(response.status).toBe(400);
		expect(payload.store.shipments[0]?.status).toBe("pending");
		expect(payload.store["shipment-events"]).toHaveLength(0);
	});

	it("allows only the assigned courier dispatcher to declare COD remittance", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: "stranger", role: "user" } });
		const { POST } = await import(
			"../../src/app/(frontend)/api/courier/shipments/[id]/cod-remitted/route"
		);
		const denied = await POST(request({ note: "Paid" }), params);
		expect(denied.status).toBe(403);
		expect(
			(await payload.findByID({ collection: "shipments", id: SHIPMENT_ID }))
				.codCollection?.remittanceStatus,
		).toBe("pending");
		expect(payload.store["shipment-events"]).toHaveLength(0);

		payload.auth.mockResolvedValue({
			user: { id: "dispatcher", role: "user" },
		});
		const accepted = await POST(request({ note: "Paid" }), params);
		expect(accepted.status).toBe(200);
		expect(
			(await payload.findByID({ collection: "shipments", id: SHIPMENT_ID }))
				.codCollection?.remittanceStatus,
		).toBe("declared_remitted");
		expect(payload.store["shipment-events"].map((event) => event.type)).toEqual(
			["shipment.cod_remittance_declared"],
		);
	});

	it("requires dispatcher authorization and rider phone-sharing consent", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: "stranger", role: "user" } });
		const { POST } = await import(
			"../../src/app/(frontend)/api/courier/shipments/[id]/assign/route"
		);
		const denied = await POST(request({ riderUserId: RIDER_ID }), params);
		expect(denied.status).toBe(403);
		expect(
			(await payload.findByID({ collection: "shipments", id: SHIPMENT_ID }))
				.rider?.user,
		).toBe(RIDER_ID);

		payload.auth.mockResolvedValue({
			user: { id: "dispatcher", role: "user" },
		});
		const noConsent = await POST(request({ riderUserId: RIDER_ID }), params);
		expect(noConsent.status).toBe(409);
		expect((await noConsent.json()).code).toBe("shipment.riderConsentMissing");
		expect(payload.store["shipment-events"]).toHaveLength(0);
	});

	it("validates remittance decisions and limits confirmation to shop managers", async () => {
		const payload = fakePayload({
			users: [
				{ id: "shop-owner", role: "user" },
				{ id: "stranger", role: "user" },
			],
			shops: [{ id: "shop-route-1", status: "active", level: 2 }],
			"shop-members": [
				{
					id: "shop-owner-member",
					shop: "shop-route-1",
					user: "shop-owner",
					role: "owner",
					status: "active",
				},
			],
			shipments: [
				{
					id: SHIPMENT_ID,
					shipmentNumber: "SHP-2610-000041",
					order: "order-route-1",
					storefrontShop: "shop-route-1",
					fulfillingShop: "shop-route-1",
					method: "courier",
					carrier: "courier",
					status: "delivered",
					codCollection: {
						expectedAmount: 5000,
						collectedAmount: 5000,
						collectedBy: "courier",
						remittanceStatus: "declared_remitted",
					},
				},
			],
			"shipment-events": [],
			reports: [],
		});
		getPayloadMock.mockResolvedValue(payload);
		const { POST } = await import(
			"../../src/app/(frontend)/api/shipments/[id]/cod-remittance/route"
		);
		const post = (body: unknown) =>
			POST(
				new Request(
					`http://localhost/api/shipments/${SHIPMENT_ID}/cod-remittance`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					},
				),
				params,
			);

		payload.auth.mockResolvedValue({
			user: { id: "shop-owner", role: "user" },
		});
		const malformed = await post({ action: "settle" });
		expect(malformed.status).toBe(400);
		expect(
			(await payload.findByID({ collection: "shipments", id: SHIPMENT_ID }))
				.codCollection?.remittanceStatus,
		).toBe("declared_remitted");

		payload.auth.mockResolvedValue({ user: { id: "stranger", role: "user" } });
		const denied = await post({ action: "confirm" });
		expect(denied.status).toBe(403);
		expect(
			(await payload.findByID({ collection: "shipments", id: SHIPMENT_ID }))
				.codCollection?.remittanceStatus,
		).toBe("declared_remitted");

		payload.auth.mockResolvedValue({
			user: { id: "shop-owner", role: "user" },
		});
		const confirmed = await post({ action: "confirm" });
		expect(confirmed.status).toBe(200);
		expect(
			(await payload.findByID({ collection: "shipments", id: SHIPMENT_ID }))
				.codCollection?.remittanceStatus,
		).toBe("confirmed");
	});

	it("flags the live shipment when its courier refuses cancellation on carrier switch", async () => {
		const fake = new FakeCourierProvider();
		fake.scriptResult("cancel", [{ cancelled: false }]);
		const unregister = registerCourierProvider("yango", () => fake);
		const payload = fakePayload(
			{
				users: [{ id: "shop-owner", role: "user" }],
				shops: [
					{
						id: "shop-route-1",
						owner: "shop-owner",
						name: "Shop",
						status: "active",
					},
				],
				"shop-members": [
					{
						id: "shop-owner-member",
						shop: "shop-route-1",
						user: "shop-owner",
						role: "owner",
						status: "active",
					},
				],
				orders: [
					{
						id: "order-route-1",
						shop: "shop-route-1",
						status: "accepted",
						paymentMethod: "cod",
						paymentStatus: "cod_pending",
						shipments: [SHIPMENT_ID],
						amounts: { total: 5000 },
					},
				],
				"order-items": [],
				shipments: [
					{
						id: SHIPMENT_ID,
						shipmentNumber: "SHP-2610-000041",
						order: "order-route-1",
						storefrontShop: "shop-route-1",
						fulfillingShop: "shop-route-1",
						method: "courier",
						carrier: "courier",
						courier: "courier-route-1",
						provider: "yango",
						providerShipmentId: "provider-shipment-1",
						origin: { city: "douala" },
						destination: { city: "douala", phone: "+237600000042" },
						fee: 1000,
						status: "pending",
					},
				],
				couriers: [
					{
						id: "courier-route-1",
						key: "yango-route",
						name: "Yango",
						provider: "yango",
						status: "active",
						scopes: ["same_city"],
						cities: ["douala"],
						tariffs: [],
					},
				],
				"shipment-events": [],
			},
			{
				globals: {
					"app-settings": {
						delivery: { zonesEnabled: true, couriersEnabled: true },
					},
				},
			},
		);
		getPayloadMock.mockResolvedValue(payload);
		payload.auth.mockResolvedValue({
			user: { id: "shop-owner", role: "user" },
		});
		const { POST } = await import(
			"../../src/app/(frontend)/api/shipments/[id]/carrier/route"
		);

		try {
			const response = await POST(
				new Request(`http://localhost/api/shipments/${SHIPMENT_ID}/carrier`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ carrier: "self" }),
				}),
				params,
			);

			expect(response.status).toBe(409);
			expect((await response.json()).code).toBe("courier.cancelRefused");
			expect(
				fake.calls.filter((call) => call.method === "cancel"),
			).toHaveLength(1);
			expect(payload.store.shipments).toHaveLength(1);
			expect(payload.store.shipments[0]).toMatchObject({
				status: "pending",
				flags: ["courier_cancel_refused"],
			});
			expect(payload.store["shipment-events"]).toHaveLength(0);
		} finally {
			unregister();
		}
	});
});
