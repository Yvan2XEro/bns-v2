// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { hashHandoverCode } from "../../src/lib/orderCodes";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { withTransaction } from "../../src/lib/transactions";
import type { Shipment } from "../../src/payload-types";
import {
	assertRiderLinkRateLimit,
	createRiderLink,
	resolveRiderLink,
	revokeRiderLink,
	riderLinkHandover,
	riderLinkPickedUp,
	riderLinkView,
} from "../../src/services/delivery/riderLinks";
import { fakePayload } from "./helpers/fakePayload";

const { sendSms } = vi.hoisted(() => ({
	sendSms: vi.fn<typeof import("../../src/services/smsProvider").sendSms>(
		async () => undefined,
	),
}));
vi.mock("../../src/services/smsProvider", () => ({
	sendSms,
}));
vi.mock("../../src/services/orders/risk", () => ({
	recordDelivered: vi.fn(async () => undefined),
	recordRefusal: vi.fn(async () => undefined),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async () => undefined),
}));

const shipment: Shipment = {
	id: "shipment-rider-link-1",
	shipmentNumber: "SHP-2610-000021",
	order: "order-rider-link-1",
	storefrontShop: "shop-rider-link-1",
	fulfillingShop: "shop-rider-link-1",
	method: "seller_delivery",
	carrier: "self",
	rider: { name: "Paul", phone: "+237600000021" },
	origin: { landmark: "Bonapriso" },
	destination: {
		city: "douala",
		district: "douala.akua",
		landmark: "Rue 1",
	},
	fee: 1200,
	status: "pending",
	createdAt: "2026-10-04T10:00:00.000Z",
	updatedAt: "2026-10-04T10:00:00.000Z",
};

function payload() {
	return fakePayload(
		{
			shipments: [shipment],
			orders: [
				{
					id: "order-rider-link-1",
					orderNumber: "ORD-2610-000021",
					buyer: "buyer-1",
					shop: "shop-rider-link-1",
					status: "shipped",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					delivery: {
						recipientName: "Aicha Nguema",
						phone: "+237600000099",
						city: "douala",
						district: "douala.akua",
						landmark: "Rue 1",
						gps: { lat: 4.05, lng: 9.7 },
					},
					amounts: { total: 15000 },
				},
			],
			"order-items": [
				{
					id: "order-item-rider-link-1",
					order: "order-rider-link-1",
					product: "product-1",
					quantity: 2,
					unitPrice: 7500,
					snapshot: { title: "Lampe solaire" },
				},
			],
			shops: [
				{
					id: "shop-rider-link-1",
					name: "Atelier Douala",
					city: "douala",
				},
			],
		},
		{
			globals: {
				"app-settings": {
					delivery: { zonesEnabled: true, riderLinksEnabled: true },
				},
			},
		},
	);
}

describe("rider link token lifecycle", () => {
	it("returns a share URL once and persists only its SHA-256 hash", async () => {
		const api = payload();
		sendSms.mockClear();
		const previousUrl = process.env.PUBLIC_WEB_URL;
		process.env.PUBLIC_WEB_URL = "https://bns.example.test";
		try {
			const created = await withTransaction(api, (req) =>
				createRiderLink(req, shipment),
			);
			const token = new URL(created.url).pathname.split("/").at(-1);
			const row = api.store.shipments?.[0];

			expect(created.url).toMatch(
				/^https:\/\/bns\.example\.test\/r\/[A-Za-z0-9_-]+$/,
			);
			expect(token).toBeTruthy();
			expect(Buffer.from(token ?? "", "base64url")).toHaveLength(32);
			expect(row?.riderLink).toMatchObject({
				tokenHash: createHash("sha256")
					.update(token ?? "")
					.digest("hex"),
				expiresAt: expect.any(String),
				revokedAt: null,
			});
			expect(JSON.stringify(row?.riderLink)).not.toContain(token);
			expect(api.store["shipment-events"]).toMatchObject([
				{ type: "shipment.rider_link_created", actorType: "seller" },
			]);
			expect(sendSms).toHaveBeenCalledWith(
				api,
				expect.objectContaining({
					to: "+237600000021",
					message: `BuyNSellem: livraison SHP-2610-000021 pour Atelier Douala, douala.akua. Détails et code client: ${created.url}`,
				}),
			);
		} finally {
			if (previousUrl === undefined)
				Reflect.deleteProperty(process.env, "PUBLIC_WEB_URL");
			else process.env.PUBLIC_WEB_URL = previousUrl;
		}
	});

	it("rotates the token and invalidates its predecessor", async () => {
		const api = payload();
		const first = await withTransaction(api, (req) =>
			createRiderLink(req, shipment),
		);
		const second = await withTransaction(api, (req) =>
			createRiderLink(req, first.shipment),
		);
		const firstToken = new URL(first.url).pathname.split("/").at(-1) ?? "";
		const secondToken = new URL(second.url).pathname.split("/").at(-1) ?? "";

		expect(secondToken).not.toBe(firstToken);
		await expect(resolveRiderLink(api, firstToken)).rejects.toMatchObject({
			code: "shipment.riderLinkInvalid",
			status: 404,
		});
		expect(await resolveRiderLink(api, secondToken)).toMatchObject({
			id: shipment.id,
		});
	});

	it("rejects revoked, expired, and terminal shipment links with the same 404", async () => {
		const revokedApi = payload();
		const created = await withTransaction(revokedApi, (req) =>
			createRiderLink(req, shipment),
		);
		const token = new URL(created.url).pathname.split("/").at(-1) ?? "";
		await withTransaction(revokedApi, (req) =>
			revokeRiderLink(req, created.shipment),
		);
		await expect(resolveRiderLink(revokedApi, token)).rejects.toMatchObject({
			code: "shipment.riderLinkInvalid",
			status: 404,
		});

		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-04T10:00:00.000Z"));
		try {
			const expiredApi = payload();
			const expired = await withTransaction(expiredApi, (req) =>
				createRiderLink(req, shipment),
			);
			const expiredToken =
				new URL(expired.url).pathname.split("/").at(-1) ?? "";
			expect(expiredApi.store.shipments?.[0]?.riderLink).toMatchObject({
				tokenHash: createHash("sha256").update(expiredToken).digest("hex"),
				expiresAt: "2026-10-07T10:00:00.000Z",
			});
			vi.setSystemTime(new Date("2026-10-07T10:00:00.000Z"));
			await expect(
				resolveRiderLink(expiredApi, expiredToken),
			).rejects.toMatchObject({
				code: "shipment.riderLinkInvalid",
				status: 404,
			});
		} finally {
			vi.useRealTimers();
		}

		const terminalApi = payload();
		const terminal = await withTransaction(terminalApi, (req) =>
			createRiderLink(req, shipment),
		);
		const terminalToken =
			new URL(terminal.url).pathname.split("/").at(-1) ?? "";
		const terminalRow = terminalApi.store.shipments?.[0];
		if (terminalRow) terminalRow.status = "delivered";
		await expect(
			resolveRiderLink(terminalApi, terminalToken),
		).rejects.toMatchObject({
			code: "shipment.riderLinkInvalid",
			status: 404,
		});
	});

	it("enforces the 30-per-token and 60-per-IP hourly limits", async () => {
		const store = new MemoryCounterStore(() =>
			Date.parse("2026-10-04T10:00:00Z"),
		);
		for (let call = 0; call < 30; call += 1) {
			await expect(
				assertRiderLinkRateLimit(store, "token-1", "192.0.2.1"),
			).resolves.toBeUndefined();
		}
		await expect(
			assertRiderLinkRateLimit(store, "token-1", "192.0.2.1"),
		).rejects.toMatchObject({ code: "generic.rateLimited", status: 429 });

		const ipStore = new MemoryCounterStore(() =>
			Date.parse("2026-10-04T10:00:00Z"),
		);
		for (let call = 0; call < 60; call += 1) {
			await expect(
				assertRiderLinkRateLimit(ipStore, `token-${call}`, "192.0.2.2"),
			).resolves.toBeUndefined();
		}
		await expect(
			assertRiderLinkRateLimit(ipStore, "token-61", "192.0.2.2"),
		).rejects.toMatchObject({ code: "generic.rateLimited", status: 429 });
	});

	it("projects only the rider contract, with item quantities and the exact COD total", async () => {
		const api = payload();
		const view = await riderLinkView(api, shipment);

		expect(view).toEqual({
			shopName: "Atelier Douala",
			shipmentNumber: "SHP-2610-000021",
			origin: { landmark: "Bonapriso" },
			destination: {
				recipientFirstName: "Aicha",
				phone: "+237600000099",
				city: "douala",
				district: "douala.akua",
				landmark: "Rue 1",
				gps: { lat: 4.05, lng: 9.7 },
				mapsUrl: "https://www.google.com/maps/search/?api=1&query=4.05,9.7",
			},
			expectedCod: 15000,
			items: [{ title: "Lampe solaire", quantity: 2 }],
			attempts: [],
			allowedActions: ["picked_up"],
		});
		expect(JSON.stringify(view)).not.toContain("Aicha Nguema");
		expect(JSON.stringify(view)).not.toContain('"fee"');
		expect(JSON.stringify(view)).not.toContain('"unitPrice"');
	});

	it("does not advertise pickup after the shipment has entered transit", async () => {
		const api = payload();
		const inTransit: Shipment = { ...shipment, status: "in_transit" };
		expect((await riderLinkView(api, inTransit)).allowedActions).toEqual([
			"attempt",
			"handover",
			"photo",
		]);
	});

	it("refuses link creation when either delivery feature gate is disabled", async () => {
		const api = fakePayload(
			{ shipments: [shipment] },
			{
				globals: {
					"app-settings": {
						delivery: { zonesEnabled: true, riderLinksEnabled: false },
					},
				},
			},
		);
		await expect(
			withTransaction(api, (req) => createRiderLink(req, shipment)),
		).rejects.toMatchObject({
			code: "shipment.invalidTransition",
			status: 409,
		});
		expect(api.store.shipments?.[0]?.riderLink).toBeUndefined();
	});

	it("refuses creation and hides an existing token after carrier changes to a partner", async () => {
		const api = payload();
		const created = await withTransaction(api, (req) =>
			createRiderLink(req, shipment),
		);
		const token = new URL(created.url).pathname.split("/").at(-1) ?? "";
		const row = api.store.shipments?.[0];
		if (row) row.carrier = "courier";

		await expect(resolveRiderLink(api, token)).rejects.toMatchObject({
			code: "shipment.riderLinkInvalid",
			status: 404,
		});
		const partnerShipment: Shipment = {
			...created.shipment,
			carrier: "courier",
		};
		await expect(
			withTransaction(api, (req) => createRiderLink(req, partnerShipment)),
		).rejects.toMatchObject({
			code: "shipment.invalidTransition",
			status: 409,
		});
	});

	it("records link pickup and the rider leaving for delivery as separate transitions", async () => {
		const pending: Shipment = {
			...shipment,
			riderLink: {
				tokenHash: "hashed-link-token",
				createdAt: "2026-10-04T10:00:00.000Z",
				expiresAt: "2026-10-07T10:00:00.000Z",
			},
		};
		const api = payload();
		const row = api.store.shipments?.[0];
		if (row) row.status = "pending";

		const inTransit = await withTransaction(api, async (req) => {
			const pickedUp = await riderLinkPickedUp(req, pending, {
				lat: 4.05,
				lng: 9.7,
			});
			return riderLinkPickedUp(req, pickedUp, {
				lat: 4.051,
				lng: 9.701,
			});
		});

		expect(inTransit.status).toBe("in_transit");
		expect(inTransit.pickedUpAt).toEqual(expect.any(String));
		expect(inTransit.inTransitAt).toEqual(expect.any(String));
		expect(api.store["shipment-events"]).toMatchObject([
			{ type: "shipment.picked_up", actorType: "rider_link" },
			{ type: "shipment.in_transit", actorType: "rider_link" },
		]);
	});

	it("records COD collection as rider when the OTP is handed over through a link", async () => {
		const secret = "rider-link-handover-secret";
		const orderId = "order-rider-link-handover";
		const handoverCode = "4821";
		const inTransitShipment: Shipment = {
			...shipment,
			order: orderId,
			status: "in_transit",
			riderLink: {
				tokenHash: "hashed-link-token",
				createdAt: "2026-10-04T10:00:00.000Z",
				expiresAt: "2026-10-07T10:00:00.000Z",
			},
		};
		const api = fakePayload(
			{
				orders: [
					{
						id: orderId,
						orderNumber: "ORD-2610-000022",
						shop: "shop-rider-link-1",
						buyer: "buyer-1",
						status: "shipped",
						paymentMethod: "cod",
						paymentStatus: "cod_pending",
						amounts: { total: 15000 },
						delivery: { recipientName: "Aicha", phone: "+237600000099" },
						handover: {
							codeHash: hashHandoverCode(secret, orderId, handoverCode),
							attempts: 0,
						},
						timestamps: { acceptedAt: "2026-10-04T10:00:00.000Z" },
					},
				],
				shipments: [inTransitShipment],
			},
			{ secret },
		);

		const delivered = await withTransaction(api, (req) =>
			riderLinkHandover(req, inTransitShipment, { code: handoverCode }),
		);

		expect(delivered.status).toBe("delivered");
		expect(delivered.codCollection).toMatchObject({
			collectedBy: "rider",
			expectedAmount: 15000,
			remittanceStatus: "pending",
		});
	});
});
