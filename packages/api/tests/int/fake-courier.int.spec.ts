// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FakeCourierProvider } from "../../src/lib/delivery/fakeCourier";
import type {
	CourierQuoteParams,
	CourierStatusSnapshot,
	CreateCourierShipmentParams,
} from "../../src/lib/delivery/types";

const quoteParams: CourierQuoteParams = {
	courierKey: "manual-moto",
	scope: "same_city",
	origin: { contactName: "Shop", phone: "+237670000001", city: "douala" },
	destination: {
		contactName: "Buyer",
		phone: "+237670000002",
		city: "douala",
		district: "akwa",
	},
	parcel: { itemsCount: 2, weightGrams: 3000, declaredValue: 50_000 },
	cod: { amount: 52_000, currency: "XAF" },
	readyAt: new Date("2026-10-04T09:00:00.000Z"),
};

describe("FakeCourierProvider", () => {
	it("fails closed when an operation has no scripted result and records the rejection", async () => {
		const fake = new FakeCourierProvider();

		await expect(fake.quote(quoteParams)).rejects.toThrow(
			"fakeCourier: no scripted outcome left for quote",
		);
		expect(fake.calls).toEqual([
			{ method: "quote", args: [quoteParams], rejected: true },
		]);
	});

	it("returns the scripted quote and journals an immutable copy of the call", async () => {
		const fake = new FakeCourierProvider();
		const quote = {
			providerQuoteId: "quote-1",
			amount: 1800,
			currency: "XAF" as const,
			etaMinHours: 2,
			etaMaxHours: 5,
		};
		fake.scriptResult("quote", [quote]);

		await expect(fake.quote(quoteParams)).resolves.toEqual(quote);

		expect(fake.callsTo("quote")).toEqual([
			[
				{
					...quoteParams,
					destination: { ...quoteParams.destination, district: "akwa" },
				},
			],
		]);
	});

	it("scripts shipment creation and advances status snapshots in order", async () => {
		const fake = new FakeCourierProvider();
		const shipmentParams: CreateCourierShipmentParams = {
			...quoteParams,
			reference: "SHP-2610-000001",
			callbackUrl: "https://api.example.test/webhook/manual",
			storefrontName: "Storefront",
		};
		const snapshot: CourierStatusSnapshot = {
			reference: shipmentParams.reference,
			providerShipmentId: "manual-1",
			providerStatus: "picked_up",
			status: "picked_up",
			occurredAt: new Date("2026-10-04T10:00:00.000Z"),
		};
		const nextSnapshot: CourierStatusSnapshot = {
			...snapshot,
			status: "in_transit",
			providerStatus: "in_transit",
			occurredAt: new Date("2026-10-04T11:00:00.000Z"),
		};
		fake
			.scriptResult("create", [
				{ providerShipmentId: "manual-1", status: "pending" },
			])
			.script(shipmentParams.reference, [snapshot, nextSnapshot]);

		const created = await fake.create(shipmentParams);
		expect(created).toEqual({
			providerShipmentId: "manual-1",
			status: "pending",
		});
		expect(await fake.getStatus("manual-1")).toEqual(snapshot);
		expect(await fake.getStatus("manual-1")).toEqual(nextSnapshot);
		await expect(
			fake.cancel({ providerShipmentId: "manual-1", reason: "too late" }),
		).resolves.toEqual({ cancelled: false });
		expect(fake.callsTo("create")).toEqual([[shipmentParams]]);
		expect(fake.callsTo("getStatus")).toEqual([["manual-1"], ["manual-1"]]);
	});

	it("rejects configured failures and verifies signed webhook bytes", async () => {
		const fake = new FakeCourierProvider();
		fake.failWhen("cancel");
		await expect(
			fake.cancel({ providerShipmentId: "manual-1", reason: "test" }),
		).rejects.toThrow("fakeCourier: scripted failure for cancel");
		expect(fake.calls).toHaveLength(1);
		expect(fake.calls[0]?.rejected).toBe(true);

		const emitted = fake.emit({
			reference: "SHP-2610-000001",
			providerShipmentId: "manual-1",
			providerStatus: "delivered",
			status: "delivered",
			occurredAt: new Date("2026-10-04T12:00:00.000Z"),
			providerEventId: "event-1",
			type: "shipment.delivered",
		});
		await expect(
			fake.verifyWebhook(emitted.rawBody, emitted.headers),
		).resolves.toEqual(emitted.event);
		await expect(
			fake.verifyWebhook(`${emitted.rawBody} `, emitted.headers),
		).rejects.toThrow("fakeCourier: invalid webhook signature");
	});
});
