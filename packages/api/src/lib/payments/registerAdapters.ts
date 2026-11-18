import { ERROR_CODES } from "../errors";
import type { PaymentEnv } from "../paymentSettings";
import { ServiceError } from "../serviceError";
import { registerMarketplaceProvider } from "./marketplaceRegistry";
import { NotchPayMarketplaceProvider } from "./notchpayMarketplace";

const CONFIG_KEYS = [
	"NOTCHPAY_PUBLIC_KEY",
	"NOTCHPAY_PRIVATE_KEY",
	"NOTCHPAY_HASH_KEY",
] as const;

export function notchpayConfigured(env: PaymentEnv = process.env): boolean {
	return CONFIG_KEYS.every((key) => Boolean(env[key]));
}

const instances = new Map<string, NotchPayMarketplaceProvider>();

function notchpayFor(env: PaymentEnv): NotchPayMarketplaceProvider {
	const [publicKey, privateKey, hashKey] = CONFIG_KEYS.map((k) => env[k]);
	if (!publicKey || !privateKey || !hashKey) {
		throw new ServiceError(ERROR_CODES.paymentProviderUnavailable, 503);
	}
	const baseUrl = env.NOTCHPAY_BASE_URL || undefined;
	const memoKey = JSON.stringify([publicKey, privateKey, hashKey, baseUrl]);
	let instance = instances.get(memoKey);
	if (!instance) {
		instance = new NotchPayMarketplaceProvider({
			publicKey,
			privateKey,
			hashKey,
			baseUrl,
		});
		instances.set(memoKey, instance);
	}
	return instance;
}

/** Registers every adapter whose env is complete; idempotent; returns the undo. */
export function registerConfiguredAdapters(
	env: PaymentEnv = process.env,
): () => void {
	if (!notchpayConfigured(env)) return () => undefined;
	return registerMarketplaceProvider("notchpay", notchpayFor);
}
