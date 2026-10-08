// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	getDeliverySettings,
	riderLinksActive,
} from "../../src/lib/deliverySettings";
import { fakePayload } from "./helpers/fakePayload";

describe("getDeliverySettings", () => {
	it("fails closed when the global cannot be read", async () => {
		const payload = fakePayload();
		payload.failWhen = (method) => method === "findGlobal";

		expect(await getDeliverySettings(payload)).toEqual({
			zonesEnabled: false,
			couriersEnabled: false,
			riderLinksEnabled: false,
			intercityEnabled: false,
			maxAttempts: 2,
			rescheduleHours: 48,
			pickupHoldDaysDefault: 7,
			gpsFarThresholdMeters: 300,
			providers: { yango: { enabled: false } },
		});
	});

	it("reads defaults when the delivery group has not been configured", async () => {
		const settings = await getDeliverySettings(fakePayload());

		expect(settings).toEqual({
			zonesEnabled: false,
			couriersEnabled: false,
			riderLinksEnabled: true,
			intercityEnabled: false,
			maxAttempts: 2,
			rescheduleHours: 48,
			pickupHoldDaysDefault: 7,
			gpsFarThresholdMeters: 300,
			providers: { yango: { enabled: false } },
		});
	});

	it("reads enabled flags and drops invalid numeric settings to safe defaults", async () => {
		const payload = fakePayload(
			{},
			{
				globals: {
					"app-settings": {
						delivery: {
							zonesEnabled: true,
							couriersEnabled: true,
							riderLinksEnabled: true,
							intercityEnabled: true,
							maxAttempts: 99,
							rescheduleHours: 24,
							pickupHoldDaysDefault: 10,
							gpsFarThresholdMeters: 500,
							providers: { yango: { enabled: true } },
						},
					},
				},
			},
		);

		expect(await getDeliverySettings(payload)).toEqual({
			zonesEnabled: true,
			couriersEnabled: true,
			riderLinksEnabled: true,
			intercityEnabled: true,
			maxAttempts: 2,
			rescheduleHours: 24,
			pickupHoldDaysDefault: 10,
			gpsFarThresholdMeters: 500,
			providers: { yango: { enabled: true } },
		});
	});

	it("only activates rider links when both rider links and zones are enabled", () => {
		expect(
			riderLinksActive({
				zonesEnabled: false,
				riderLinksEnabled: true,
				couriersEnabled: false,
				intercityEnabled: false,
				maxAttempts: 2,
				rescheduleHours: 48,
				pickupHoldDaysDefault: 7,
				gpsFarThresholdMeters: 300,
				providers: { yango: { enabled: false } },
			}),
		).toBe(false);
	});
});
