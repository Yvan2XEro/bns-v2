// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { FakeCourierProvider } from "../../src/lib/delivery/fakeCourier";
import { registerCourierProvider } from "../../src/lib/delivery/registry";
import { withTransaction } from "../../src/lib/transactions";
import type { Shipment } from "../../src/payload-types";
import {
	assignCourierRider,
	assignShopRider,
	flagCourierCancellationRefused,
	listCourierShipments,
	switchShipmentCarrier,
} from "../../src/services/delivery/courierShipments";
import { applyShipmentTransition } from "../../src/services/delivery/shipmentTransitions";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/services/smsProvider", () => ({
	sendSms: vi.fn(async () => ({ sent: true })),
}));

const shipment: Shipment = {
	id: "shipment-courier-1",
	shipmentNumber: "SHP-2610-000031",
	order: "order-courier-1",
	storefrontShop: "shop-courier-1",
	fulfillingShop: "shop-courier-1",
	method: "courier",
	carrier: "courier",
	courier: "courier-1",
	origin: { city: "douala" },
	destination: { city: "douala", phone: "+237600000031" },
	fee: 1500,
	status: "pending",
	createdAt: "2026-10-04T10:00:00.000Z",
	updatedAt: "2026-10-04T10:00:00.000Z",
};

function payload(consent: boolean) {
	return fakePayload({
		shipments: [shipment],
		couriers: [{ id: "courier-1", key: "moto-x", name: "Moto X" }],
		"courier-members": [
			{
				id: "courier-member-1",
				courier: "courier-1",
				user: "rider-1",
				role: "rider",
				status: "active",
				...(consent
					? { phoneSharingConsentAt: "2026-10-04T09:00:00.000Z" }
					: {}),
				vehicle: "moto",
			},
		],
		users: [{ id: "rider-1", name: "Paul N.", phone: "+237600000032" }],
	});
}

describe("courier shipment assignment", () => {
	it("requires recorded phone-sharing consent before assigning a rider", async () => {
		const api = payload(false);
		await expect(
			withTransaction(api, (req) =>
				assignCourierRider(req, shipment, "rider-1", "dispatcher-1"),
			),
		).rejects.toMatchObject({
			code: "shipment.riderConsentMissing",
			status: 409,
		});
		expect(api.store.shipments?.[0]?.rider).toBeUndefined();
	});

	it("copies the consenting courier member identity into the shipment assignment", async () => {
		const api = payload(true);
		const assigned = await withTransaction(api, (req) =>
			assignCourierRider(req, shipment, "rider-1", "dispatcher-1"),
		);
		expect(assigned.rider).toMatchObject({
			user: "rider-1",
			name: "Paul N.",
			phone: "+237600000032",
			vehicle: "moto",
			assignedBy: "dispatcher-1",
			assignedAt: expect.any(String),
		});
		expect(api.store["shipment-events"]).toMatchObject([
			{ type: "shipment.rider_assigned", actor: "dispatcher-1" },
		]);
	});

	it("scopes dispatcher rows to their courier and riders to their own assignments", async () => {
		const own: Shipment = {
			...shipment,
			id: "shipment-own",
			rider: { user: "rider-1", name: "Paul N.", phone: "+237600000032" },
		};
		const other: Shipment = {
			...shipment,
			id: "shipment-other",
			courier: "courier-2",
			rider: { user: "someone-else", name: "Other", phone: "+237600000033" },
		};
		const api = fakePayload({
			shipments: [own, other],
			couriers: [
				{ id: "courier-1", key: "moto-x", name: "Moto X" },
				{ id: "courier-2", key: "moto-y", name: "Moto Y" },
			],
			"courier-members": [
				{
					id: "dispatcher-member",
					courier: "courier-1",
					user: "dispatcher-1",
					role: "dispatcher",
					status: "active",
				},
				{
					id: "rider-member",
					courier: "courier-1",
					user: "rider-1",
					role: "rider",
					status: "active",
				},
			],
		});
		const dispatchRows = await listCourierShipments(api, "dispatcher-1", {});
		const riderRows = await listCourierShipments(api, "rider-1", {});
		expect(dispatchRows.docs.map((row) => row.id)).toEqual(["shipment-own"]);
		expect(riderRows.docs.map((row) => row.id)).toEqual(["shipment-own"]);
	});

	it("does not expose courier shipments to an unassigned account", async () => {
		const api = fakePayload({ shipments: [shipment] });
		await expect(
			listCourierShipments(api, "stranger", {}),
		).rejects.toMatchObject({
			code: "shipment.notAssigned",
			status: 403,
		});
	});

	it("keeps exactly one live shipment when cancellation races with rider pickup", async () => {
		const original: Shipment = { ...shipment, rider: { user: "rider-1" } };
		const api = fakePayload({
			shipments: [original],
			orders: [
				{
					id: "order-courier-1",
					orderNumber: "ORD-1",
					shop: "shop-courier-1",
					status: "accepted",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: {
						method: "courier",
						recipientName: "Buyer",
						phone: "+237600000031",
						city: "douala",
					},
					amounts: { total: 9000 },
				},
			],
			"order-items": [
				{
					id: "order-item-1",
					order: "order-courier-1",
					product: "product-1",
					variant: "variant-1",
					fulfillingShop: "shop-courier-1",
					unitPrice: 9000,
					quantity: 1,
					fulfillmentStatus: "unfulfilled",
				},
			],
			couriers: [
				{
					id: "courier-1",
					key: "moto-x",
					name: "Moto X",
					provider: "manual",
					status: "active",
					scopes: ["same_city"],
					cities: ["douala"],
					tariffs: [],
				},
			],
		});
		const results = await Promise.allSettled([
			withTransaction(api, (req) =>
				switchShipmentCarrier(
					req,
					original,
					{ carrier: "self" },
					"SHP-2610-000036",
				),
			),
			withTransaction(api, (req) =>
				applyShipmentTransition(req, original, "picked_up", {
					type: "shipment.picked_up",
					actorType: "rider",
					actor: "rider-1",
					visibility: "both",
					occurredAt: new Date().toISOString(),
				}),
			),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const live = api.store.shipments?.filter(
			(row) => row.status !== "cancelled",
		);
		expect(live).toHaveLength(1);
		expect(["pending", "picked_up"]).toContain(live?.[0]?.status);
	});

	it("switches a pending shipment by cancelling and replacing it in one transaction", async () => {
		const api = fakePayload({
			shipments: [shipment],
			orders: [{ id: "order-courier-1", shipments: [shipment.id] }],
			couriers: [
				{
					id: "courier-1",
					key: "moto-x",
					name: "Moto X",
					provider: "manual",
					status: "active",
					scopes: ["same_city"],
					cities: ["douala"],
					tariffs: [],
				},
			],
		});
		const result = await withTransaction(api, (req) =>
			switchShipmentCarrier(
				req,
				shipment,
				{ carrier: "self" },
				"SHP-2610-000032",
			),
		);
		expect(result.shipment).toMatchObject({
			id: expect.not.stringMatching(shipment.id),
			shipmentNumber: "SHP-2610-000032",
			carrier: "self",
			status: "pending",
		});
		expect(api.store.shipments?.map((row) => row.status)).toEqual([
			"cancelled",
			"pending",
		]);
		const live = api.store.shipments?.filter(
			(row) => row.status !== "cancelled",
		);
		expect(live).toHaveLength(1);
	});

	it("refuses a carrier change once pickup has started", async () => {
		await expect(
			withTransaction(payload(true), (req) =>
				switchShipmentCarrier(
					req,
					{ ...shipment, status: "picked_up" },
					{ carrier: "self" },
					"SHP-2610-000033",
				),
			),
		).rejects.toMatchObject({
			code: "shipment.invalidTransition",
			status: 409,
		});
	});

	it("keeps the ten most recent external riders and deduplicates by phone", async () => {
		const selfShipment: Shipment = {
			...shipment,
			carrier: "self",
			method: "seller_delivery",
			courier: null,
			fulfillingShop: "shop-courier-1",
		};
		const api = fakePayload({
			shipments: [selfShipment],
			shops: [{ id: "shop-courier-1", name: "Shop", orderSettings: {} }],
		});
		for (let index = 0; index < 11; index += 1) {
			await withTransaction(api, (req) =>
				assignShopRider(
					req,
					selfShipment,
					{
						name: `Rider ${index}`,
						phone: `+2376000000${String(index).padStart(2, "0")}`,
					},
					"seller-1",
				),
			);
		}
		await withTransaction(api, (req) =>
			assignShopRider(
				req,
				selfShipment,
				{ name: "Newest Name", phone: "+237600000010" },
				"seller-1",
			),
		);
		const riders = (
			await api.findByID({
				collection: "shops",
				id: String(api.store.shops?.[0]?.id),
			})
		).orderSettings?.recentExternalRiders;
		expect(riders).toHaveLength(10);
		expect(riders?.[0]).toMatchObject({
			name: "Newest Name",
			phone: "+237600000010",
		});
		expect(
			riders?.filter((rider) => rider.phone === "+237600000010"),
		).toHaveLength(1);
		expect(riders?.some((rider) => rider.phone === "+237600000000")).toBe(
			false,
		);
	});

	it("quotes and creates a courier shipment after commit with the storefront name", async () => {
		const fake = new FakeCourierProvider();
		fake.scriptResult("quote", [
			{
				amount: 2400,
				currency: "XAF",
				etaMinHours: 4,
				etaMaxHours: 8,
				providerQuoteId: "quote-1",
			},
		]);
		fake.scriptResult("create", [
			{
				providerShipmentId: "provider-shipment-1",
				status: "pending",
				trackingCode: "TRACK-1",
			},
		]);
		const unregister = registerCourierProvider("yango", () => fake);
		const selfShipment: Shipment = {
			...shipment,
			courier: null,
			carrier: "self",
			origin: { name: "Warehouse", city: "douala" },
			destination: {
				recipientName: "Buyer",
				phone: "+237600000031",
				city: "douala",
			},
		};
		const api = fakePayload(
			{
				shipments: [selfShipment],
				orders: [
					{
						id: "order-courier-1",
						paymentMethod: "cod",
						amounts: { total: 24000 },
						shipments: [shipment.id],
					},
				],
				shops: [{ id: "shop-courier-1", name: "Storefront Shop" }],
				couriers: [
					{
						id: "courier-yango",
						key: "yango-main",
						name: "Yango",
						provider: "yango",
						status: "active",
						scopes: ["same_city"],
						cities: ["douala"],
						tariffs: [],
					},
				],
			},
			{
				globals: {
					"app-settings": {
						delivery: { zonesEnabled: true, couriersEnabled: true },
					},
				},
			},
		);
		try {
			const result = await withTransaction(api, (req) =>
				switchShipmentCarrier(
					req,
					selfShipment,
					{ carrier: "courier", courierId: "courier-yango" },
					"SHP-2610-000034",
				),
			);
			expect(result.quote).toMatchObject({
				amount: 2400,
				providerQuoteId: "quote-1",
			});
			expect(fake.callsTo("create")).toHaveLength(1);
			expect(fake.callsTo("create")[0]?.[0]).toMatchObject({
				courierKey: "yango-main",
				storefrontName: "Storefront Shop",
				reference: "SHP-2610-000034",
				providerQuoteId: "quote-1",
				callbackUrl: expect.stringMatching(
					/\/api\/public\/delivery\/webhook\/yango$/,
				),
			});
			expect(
				api.store.shipments?.find(
					(row) => String(row.id) === String(result.shipment.id),
				),
			).toMatchObject({
				providerShipmentId: "provider-shipment-1",
				trackingCode: "TRACK-1",
			});
		} finally {
			unregister();
		}
	});

	it("retries provider creation for an already-selected courier after a failed attempt", async () => {
		const fake = new FakeCourierProvider();
		fake.scriptResult("quote", [
			{ amount: 2400, currency: "XAF", etaMinHours: 4, etaMaxHours: 8 },
			{ amount: 2400, currency: "XAF", etaMinHours: 4, etaMaxHours: 8 },
		]);
		fake.scriptResult("create", [
			{ providerShipmentId: "provider-recovered", status: "pending" },
		]);
		fake.failWhen("create");
		const unregister = registerCourierProvider("yango", () => fake);
		const selfShipment: Shipment = {
			...shipment,
			courier: null,
			carrier: "self",
			origin: { name: "Warehouse", city: "douala" },
			destination: {
				recipientName: "Buyer",
				phone: "+237600000031",
				city: "douala",
			},
		};
		const api = fakePayload(
			{
				shipments: [selfShipment],
				orders: [
					{
						id: "order-courier-1",
						paymentMethod: "cod",
						amounts: { total: 24000 },
						shipments: [selfShipment.id],
					},
				],
				shops: [{ id: "shop-courier-1", name: "Storefront Shop" }],
				couriers: [
					{
						id: "courier-yango",
						key: "yango-main",
						name: "Yango",
						provider: "yango",
						status: "active",
						scopes: ["same_city"],
						cities: ["douala"],
						tariffs: [],
					},
				],
			},
			{
				globals: {
					"app-settings": {
						delivery: { zonesEnabled: true, couriersEnabled: true },
					},
				},
			},
		);
		try {
			const first = await withTransaction(api, (req) =>
				switchShipmentCarrier(
					req,
					selfShipment,
					{ carrier: "courier", courierId: "courier-yango" },
					"SHP-2610-000037",
				),
			);
			expect(fake.callsTo("create")).toHaveLength(1);
			expect(
				api.store.shipments?.find(
					(row) => String(row.id) === String(first.shipment.id),
				)?.providerShipmentId,
			).toBeUndefined();

			fake.clearFailure("create");
			const retried = await withTransaction(api, (req) =>
				switchShipmentCarrier(
					req,
					first.shipment,
					{ carrier: "courier", courierId: "courier-yango" },
					"unused-replacement-number",
				),
			);
			expect(retried.shipment.id).toBe(first.shipment.id);
			expect(fake.callsTo("create")).toHaveLength(2);
			expect(
				api.store.shipments?.find(
					(row) => String(row.id) === String(first.shipment.id),
				)?.providerShipmentId,
			).toBe("provider-recovered");
		} finally {
			unregister();
		}
	});

	it("keeps the original live shipment when the courier refuses cancellation", async () => {
		const fake = new FakeCourierProvider();
		fake.scriptResult("cancel", [{ cancelled: false }]);
		const unregister = registerCourierProvider("yango", () => fake);
		const providerShipment: Shipment = {
			...shipment,
			provider: "yango",
			providerShipmentId: "provider-shipment-9",
		};
		const api = fakePayload({
			shipments: [providerShipment],
			orders: [{ id: "order-courier-1", shipments: [shipment.id] }],
			couriers: [
				{
					id: "courier-1",
					key: "yango-main",
					name: "Yango",
					provider: "yango",
					status: "active",
					scopes: ["same_city"],
					cities: ["douala"],
					tariffs: [],
				},
			],
		});
		try {
			await expect(
				withTransaction(api, (req) =>
					switchShipmentCarrier(
						req,
						providerShipment,
						{ carrier: "self" },
						"SHP-2610-000035",
					),
				),
			).rejects.toMatchObject({ code: "courier.cancelRefused", status: 409 });
			await flagCourierCancellationRefused(api, String(providerShipment.id));
			expect(api.store.shipments).toHaveLength(1);
			expect(api.store.shipments?.[0]).toMatchObject({
				status: "pending",
				flags: ["courier_cancel_refused"],
			});
		} finally {
			unregister();
		}
	});
});
