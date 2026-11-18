import type { CourierProviderId } from "./types";

export type CourierMethod =
	| "quote"
	| "create"
	| "cancel"
	| "verifyWebhook"
	| "getStatus";

export class CourierNotConfiguredError extends Error {
	constructor(readonly provider: CourierProviderId) {
		super(`Courier provider is not configured: ${provider}`);
		this.name = "CourierNotConfiguredError";
	}
}

export class CourierCapabilityError extends Error {
	constructor(
		readonly provider: CourierProviderId,
		readonly method: CourierMethod,
	) {
		super(`${provider} does not support ${method}`);
		this.name = "CourierCapabilityError";
	}
}

export class CourierUnavailableError extends Error {
	constructor(readonly courierKey: string) {
		super(`No courier tariff is available for ${courierKey}`);
		this.name = "CourierUnavailableError";
	}
}
