// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveCourierRole } from "../../src/access/courierRoles";
import {
	CourierCapabilityError,
	CourierNotConfiguredError,
	CourierUnavailableError,
	courierAdapterPresenceRefusal,
	getCourierProvider,
	listAvailableCouriers,
	ManualCourierProvider,
	registerCourierProvider,
	STATUS_MAP,
	YangoCourierProvider,
} from "../../src/lib/delivery";
import type { CourierProvider } from "../../src/lib/delivery/types";
import type { Courier } from "../../src/payload-types";
import { fakePayload } from "./helpers/fakePayload";

const manualCourier: Courier = {
	id: "courier-1",
	key: "manual-moto",
	name: "Moto delivery",
	provider: "manual",
	scopes: ["same_city"],
	cities: ["douala"],
	supportsCod: true,
	tariffs: [
		{ city: "douala", amount: 2500, etaMinHours: 4, etaMaxHours: 24 },
		{
			city: "douala",
			district: "akwa",
			amount: 1500,
			etaMinHours: 2,
			etaMaxHours: 12,
		},
	],
	status: "active",
	billingMode: "shop_account",
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-01T00:00:00.000Z",
};

const quote = {
	courierKey: manualCourier.key,
	scope: "same_city" as const,
	origin: { contactName: "Store", phone: "+237670000001", city: "douala" },
	destination: {
		contactName: "Buyer",
		phone: "+237670000002",
		city: "douala",
		district: "akwa",
	},
	parcel: { itemsCount: 1, weightGrams: 800, declaredValue: 10000 },
	readyAt: new Date("2026-10-04T09:00:00.000Z"),
};

describe("manual courier adapter", () => {
	it("chooses district tariff over whole-city tariff and exposes declared capabilities", async () => {
		const provider = new ManualCourierProvider(manualCourier, fakePayload());
		expect(provider.capabilities).toEqual({
			quote: true,
			webhooks: false,
			cancel: true,
			cod: true,
			intercity: false,
		});
		await expect(provider.quote(quote)).resolves.toEqual({
			amount: 1500,
			currency: "XAF",
			etaMinHours: 2,
			etaMaxHours: 12,
		});
		await expect(
			provider.quote({
				...quote,
				destination: { ...quote.destination, district: "bali" },
			}),
		).resolves.toMatchObject({ amount: 2500 });
		await expect(
			provider.quote({
				...quote,
				destination: { ...quote.destination, city: "yaounde" },
			}),
		).rejects.toBeInstanceOf(CourierUnavailableError);
	});

	it("permits cancellation only before pickup and has no webhook capability", async () => {
		const payload = fakePayload({
			shipments: [
				{ id: "pending-1", status: "pending" },
				{ id: "moving-1", status: "in_transit" },
			],
		});
		const provider = new ManualCourierProvider(manualCourier, payload);
		await expect(
			provider.cancel({ providerShipmentId: "pending-1", reason: "changed" }),
		).resolves.toEqual({ cancelled: true });
		await expect(
			provider.cancel({ providerShipmentId: "moving-1", reason: "changed" }),
		).resolves.toEqual({ cancelled: false });
		await expect(provider.verifyWebhook("{}", {})).rejects.toBeInstanceOf(
			CourierCapabilityError,
		);
	});
});

describe("courier provider registry", () => {
	it("builds manual with its operational dependencies and fails closed for unconfigured Yango", async () => {
		const manual = getCourierProvider("manual", {
			courier: manualCourier,
			payload: fakePayload(),
			env: { NODE_ENV: "production" },
		});
		expect(manual.id).toBe("manual");
		const yango = getCourierProvider("yango", {
			env: { NODE_ENV: "production" },
		});
		await expect(yango.quote(quote)).rejects.toBeInstanceOf(
			CourierNotConfiguredError,
		);
		await expect(
			yango.create({
				...quote,
				reference: "SHP-1",
				callbackUrl: "https://x.test",
				storefrontName: "Shop",
			}),
		).rejects.toBeInstanceOf(CourierNotConfiguredError);
		await expect(
			yango.cancel({ providerShipmentId: "SHP-1", reason: "test" }),
		).rejects.toBeInstanceOf(CourierNotConfiguredError);
		await expect(yango.verifyWebhook("{}", {})).rejects.toBeInstanceOf(
			CourierNotConfiguredError,
		);
		await expect(yango.getStatus("SHP-1")).rejects.toBeInstanceOf(
			CourierNotConfiguredError,
		);
	});

	it("only refuses enabling partner couriers when an active provider has no configured adapter", () => {
		expect(
			courierAdapterPresenceRefusal({ couriersEnabled: false }, []),
		).toBeNull();
		expect(
			courierAdapterPresenceRefusal(
				{ couriersEnabled: true },
				[{ provider: "manual", status: "active" }],
				{ NODE_ENV: "production" },
			),
		).toBeNull();
		expect(
			courierAdapterPresenceRefusal(
				{ couriersEnabled: true },
				[{ provider: "yango", status: "active" }],
				{ NODE_ENV: "production" },
			),
		).toContain('no working adapter for "yango"');
	});

	it("uses a registered provider factory and filters availability by city, scope, COD, and capability", async () => {
		const provider: CourierProvider = {
			id: "campost",
			capabilities: {
				quote: true,
				webhooks: false,
				cancel: true,
				cod: false,
				intercity: true,
			},
			quote: async () => ({
				amount: 0,
				currency: "XAF",
				etaMinHours: 1,
				etaMaxHours: 2,
			}),
			create: async ({ reference }) => ({
				providerShipmentId: reference,
				status: "pending",
			}),
			cancel: async () => ({ cancelled: false }),
			verifyWebhook: async () => {
				throw new Error("not supported");
			},
			getStatus: async (providerShipmentId) => ({
				reference: providerShipmentId,
				providerShipmentId,
				providerStatus: "pending",
				status: "pending",
				occurredAt: new Date("2026-10-04T10:00:00.000Z"),
			}),
		};
		const unregister = registerCourierProvider("campost", () => provider);
		try {
			expect(
				getCourierProvider("campost", { env: { NODE_ENV: "production" } }),
			).toBe(provider);
			expect(
				courierAdapterPresenceRefusal(
					{ couriersEnabled: true },
					[{ provider: "campost", status: "active" }],
					{ NODE_ENV: "production" },
				),
			).toBeNull();
		} finally {
			unregister();
		}

		const payload = fakePayload({
			couriers: [
				{
					id: "courier-1",
					key: "manual-moto",
					provider: "manual",
					status: "active",
					scopes: ["same_city"],
					cities: ["douala"],
					supportsCod: true,
				},
				{
					id: "courier-2",
					key: "manual-no-cod",
					provider: "manual",
					status: "active",
					scopes: ["same_city"],
					cities: ["yaounde"],
					supportsCod: false,
				},
			],
		});
		const available = await listAvailableCouriers(payload, {
			city: "douala",
			scope: "same_city",
			cod: true,
		});
		expect(available.map(({ key }) => key)).toEqual(["manual-moto"]);
	});

	it("resolves and caches only active courier memberships", async () => {
		const payload = fakePayload({
			"courier-members": [
				{
					id: "member-active",
					courier: "courier-1",
					user: "user-1",
					role: "dispatcher",
					status: "active",
				},
				{
					id: "member-revoked",
					courier: "courier-1",
					user: "user-2",
					role: "rider",
					status: "revoked",
				},
			],
		});
		const context: Record<string, unknown> = {};
		await expect(
			resolveCourierRole(payload, "user-1", "courier-1", context),
		).resolves.toBe("dispatcher");
		await expect(
			resolveCourierRole(payload, "user-2", "courier-1", context),
		).resolves.toBeNull();
		expect(payload.reads).toHaveLength(2);
		await resolveCourierRole(payload, "user-1", "courier-1", context);
		expect(payload.reads).toHaveLength(2);
	});
});

describe("Yango placeholder", () => {
	it("keeps every capability disabled and maps unknown signed statuses to null", async () => {
		const env: NodeJS.ProcessEnv = {
			NODE_ENV: "production",
			YANGO_DELIVERY_BASE_URL: "https://yango.example.test",
			YANGO_DELIVERY_API_KEY: "api-key",
			YANGO_DELIVERY_WEBHOOK_SECRET: "secret",
		};
		const provider = new YangoCourierProvider(env);
		expect(provider.capabilities).toEqual({
			quote: false,
			webhooks: false,
			cancel: false,
			cod: false,
			intercity: false,
		});
		expect(STATUS_MAP.unknown).toBeUndefined();
		const rawBody = JSON.stringify({
			providerEventId: "evt-1",
			type: "shipment.updated",
			reference: "SHP-1",
			providerShipmentId: "y-1",
			providerStatus: "new-provider-status",
			occurredAt: "2026-10-04T10:00:00.000Z",
		});
		const signature = createHmac("sha256", "secret")
			.update(rawBody)
			.digest("hex");
		await expect(
			provider.verifyWebhook(rawBody, { "x-yango-signature": signature }),
		).resolves.toMatchObject({ status: null, providerEventId: "evt-1" });
		await expect(
			provider.verifyWebhook(rawBody, { "x-yango-signature": "0".repeat(64) }),
		).rejects.toThrow("signature is invalid");
	});
});
