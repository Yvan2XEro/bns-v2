// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FakeCourierProvider } from "../../src/lib/delivery/fakeCourier";
import { ManualCourierProvider } from "../../src/lib/delivery/manualCourier";
import { CourierCapabilityError } from "../../src/lib/delivery/providerErrors";
import type {
	CourierProvider,
	CourierQuoteParams,
	CourierStatusSnapshot,
	CourierWebhookEvent,
	CreateCourierShipmentParams,
} from "../../src/lib/delivery/types";
import type { Courier } from "../../src/payload-types";
import { fakePayload } from "./helpers/fakePayload";

const quoteParams: CourierQuoteParams = {
	courierKey: "manual-moto",
	scope: "same_city",
	origin: { contactName: "Store", phone: "+237670000001", city: "douala" },
	destination: {
		contactName: "Buyer",
		phone: "+237670000002",
		city: "douala",
		district: "akwa",
	},
	parcel: { itemsCount: 1, weightGrams: 800, declaredValue: 10_000 },
	readyAt: new Date("2026-10-04T09:00:00.000Z"),
};

const createParams: CreateCourierShipmentParams = {
	...quoteParams,
	reference: "shipment-1",
	callbackUrl: "https://api.example.test/webhook",
	storefrontName: "Store",
};

const shipmentSnapshot: CourierStatusSnapshot = {
	reference: createParams.reference,
	providerShipmentId: createParams.reference,
	providerStatus: "pending",
	status: "pending",
	occurredAt: new Date("2026-10-04T09:00:00.000Z"),
};

const webhookEvent: CourierWebhookEvent = {
	...shipmentSnapshot,
	providerEventId: "event-1",
	type: "shipment.created",
};

const manual: Courier = {
	id: "courier-1",
	key: "manual-moto",
	name: "Manual Moto",
	provider: "manual",
	scopes: ["same_city"],
	cities: ["douala"],
	supportsCod: true,
	tariffs: [
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

type ProviderBuilder = () => {
	provider: CourierProvider;
	webhook?: { rawBody: string; headers: Record<string, string> };
};

export function runCourierContract(name: string, build: ProviderBuilder): void {
	describe(`${name} CourierProvider contract`, () => {
		it("quotes, creates, reads status idempotently, and respects declared capabilities", async () => {
			const { provider, webhook } = build();
			const quote = await provider.quote(quoteParams);
			expect(quote.amount).toBe(1500);
			expect(quote.currency).toBe("XAF");

			const created = await provider.create(createParams);
			expect(created.providerShipmentId).toBe(createParams.reference);
			expect(created.status).toBe("pending");

			const firstStatus = await provider.getStatus(created.providerShipmentId);
			const secondStatus = await provider.getStatus(created.providerShipmentId);
			expect(firstStatus).toEqual(secondStatus);

			if (provider.capabilities.cancel) {
				await expect(
					provider.cancel({
						providerShipmentId: created.providerShipmentId,
						reason: "test",
					}),
				).resolves.toMatchObject({ cancelled: true });
			} else {
				await expect(
					provider.cancel({
						providerShipmentId: created.providerShipmentId,
						reason: "test",
					}),
				).rejects.toBeInstanceOf(CourierCapabilityError);
			}

			if (provider.capabilities.webhooks && webhook) {
				await expect(
					provider.verifyWebhook(webhook.rawBody, webhook.headers),
				).resolves.toEqual(webhookEvent);
				await expect(
					provider.verifyWebhook(`${webhook.rawBody} `, webhook.headers),
				).rejects.toThrow();
			} else {
				await expect(provider.verifyWebhook("{}", {})).rejects.toBeInstanceOf(
					CourierCapabilityError,
				);
			}
		});
	});
}

runCourierContract("fake", () => {
	const fake = new FakeCourierProvider();
	fake
		.scriptResult("quote", [
			{
				amount: 1500,
				currency: "XAF",
				etaMinHours: 2,
				etaMaxHours: 12,
			},
		])
		.scriptResult("create", [
			{ providerShipmentId: createParams.reference, status: "pending" },
		])
		.scriptResult("cancel", [{ cancelled: true }])
		.script(createParams.reference, [shipmentSnapshot, shipmentSnapshot]);
	return { provider: fake, webhook: fake.emit(webhookEvent) };
});

runCourierContract("manual", () => {
	const payload = fakePayload({
		shipments: [
			{
				id: createParams.reference,
				status: "pending",
				updatedAt: "2026-10-04T09:00:00.000Z",
			},
		],
	});
	return {
		provider: new ManualCourierProvider(manual, payload),
	};
});
