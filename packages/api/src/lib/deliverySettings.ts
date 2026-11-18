import type { Payload } from "payload";

export interface DeliverySettings {
	zonesEnabled: boolean;
	couriersEnabled: boolean;
	riderLinksEnabled: boolean;
	intercityEnabled: boolean;
	maxAttempts: number;
	rescheduleHours: number;
	pickupHoldDaysDefault: number;
	gpsFarThresholdMeters: number;
	providers: { yango: { enabled: boolean } };
}

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
	zonesEnabled: false,
	couriersEnabled: false,
	riderLinksEnabled: true,
	intercityEnabled: false,
	maxAttempts: 2,
	rescheduleHours: 48,
	pickupHoldDaysDefault: 7,
	gpsFarThresholdMeters: 300,
	providers: { yango: { enabled: false } },
};

const CLOSED_DELIVERY_SETTINGS: DeliverySettings = {
	...DEFAULT_DELIVERY_SETTINGS,
	zonesEnabled: false,
	couriersEnabled: false,
	riderLinksEnabled: false,
	intercityEnabled: false,
	providers: { yango: { enabled: false } },
};

function integerSetting(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
		? parsed
		: fallback;
}

export async function getDeliverySettings(
	payload: Payload,
): Promise<DeliverySettings> {
	try {
		const global = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		const delivery = (global as { delivery?: Record<string, unknown> })
			.delivery;
		const providers = delivery?.providers as
			| { yango?: { enabled?: unknown } }
			| undefined;
		return {
			zonesEnabled: delivery?.zonesEnabled === true,
			couriersEnabled: delivery?.couriersEnabled === true,
			riderLinksEnabled:
				delivery?.riderLinksEnabled === undefined
					? DEFAULT_DELIVERY_SETTINGS.riderLinksEnabled
					: delivery.riderLinksEnabled === true,
			intercityEnabled: delivery?.intercityEnabled === true,
			maxAttempts: integerSetting(delivery?.maxAttempts, 2, 1, 5),
			rescheduleHours: integerSetting(delivery?.rescheduleHours, 48, 1, 168),
			pickupHoldDaysDefault: integerSetting(
				delivery?.pickupHoldDaysDefault,
				7,
				1,
				30,
			),
			gpsFarThresholdMeters: integerSetting(
				delivery?.gpsFarThresholdMeters,
				300,
				0,
				10_000,
			),
			providers: {
				yango: { enabled: providers?.yango?.enabled === true },
			},
		};
	} catch {
		return { ...CLOSED_DELIVERY_SETTINGS };
	}
}

export function riderLinksActive(settings: DeliverySettings): boolean {
	return settings.riderLinksEnabled && settings.zonesEnabled;
}
