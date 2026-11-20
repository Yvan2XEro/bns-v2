import type { Payload } from "payload";
import { campayConfigured } from "./payments/campayConfig";
import type {
	CreatePaymentParams,
	CreatePaymentResult,
	PaymentProvider,
	ProviderName,
} from "./payments/types";

/**
 * The money BuyNSellem collects for itself — boosts, commission invoices,
 * reseller charges — and which provider opens the checkout
 * (`AppSettings.platformPayments`). Protected payment, where the money is a
 * buyer's and goes to a seller, is not this: it has its own marketplace
 * provider (lib/paymentSettings.ts).
 *
 * The admin picks the primary; with failover on, the other provider opens the
 * checkout when the primary is not configured or refuses. Whichever opens it
 * is recorded on the intent, and that one settles it (webhook, return page,
 * reconciliation).
 */

export const PLATFORM_PROVIDERS = ["notchpay", "campay"] as const;
export type PlatformProviderId = (typeof PLATFORM_PROVIDERS)[number];

export interface PlatformPaymentSettings {
	provider: PlatformProviderId;
	failover: boolean;
}

export const PLATFORM_PAYMENT_DEFAULTS: PlatformPaymentSettings = {
	provider: "notchpay",
	failover: true,
};

type Env = Readonly<Record<string, string | undefined>>;

export function platformPaymentSettingsOf(
	raw: unknown,
): PlatformPaymentSettings {
	const value = (raw ?? {}) as { provider?: unknown; failover?: unknown };
	const provider = (PLATFORM_PROVIDERS as readonly unknown[]).includes(
		value.provider,
	)
		? (value.provider as PlatformProviderId)
		: PLATFORM_PAYMENT_DEFAULTS.provider;
	const failover =
		typeof value.failover === "boolean"
			? value.failover
			: PLATFORM_PAYMENT_DEFAULTS.failover;
	return { provider, failover };
}

/** Defaults when the settings cannot be read: a payment still opens. */
export async function getPlatformPaymentSettings(
	payload: Payload,
): Promise<PlatformPaymentSettings> {
	try {
		const settings = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		return platformPaymentSettingsOf(
			(settings as { platformPayments?: unknown }).platformPayments,
		);
	} catch {
		return PLATFORM_PAYMENT_DEFAULTS;
	}
}

export function platformProviderConfigured(
	name: PlatformProviderId,
	env: Env = process.env,
): boolean {
	if (name === "campay") return campayConfigured(env);
	return Boolean(env.NOTCHPAY_PUBLIC_KEY);
}

/** The providers to try, in order: the primary, then (failover on) the other; configured ones only. */
export function platformProviderOrder(
	settings: PlatformPaymentSettings,
	env: Env = process.env,
): PlatformProviderId[] {
	const other = PLATFORM_PROVIDERS.find((p) => p !== settings.provider);
	const candidates =
		settings.failover && other
			? [settings.provider, other]
			: [settings.provider];
	return candidates.filter((name) => platformProviderConfigured(name, env));
}

/**
 * The order for this payment. With no provider configured at all, the
 * primary alone: opening it then fails as it always has, with the
 * provider's own "not configured" error.
 */
export async function resolvePlatformProviders(
	payload: Payload,
	env: Env = process.env,
): Promise<PlatformProviderId[]> {
	const settings = await getPlatformPaymentSettings(payload);
	const order = platformProviderOrder(settings, env);
	return order.length > 0 ? order : [settings.provider];
}

/**
 * Opens the checkout with the first provider that accepts it. `build` gives
 * each provider its own parameters (its return URL differs). Throws the last
 * provider's error when none does.
 */
export async function openCheckout(input: {
	order: readonly ProviderName[];
	build: (provider: ProviderName) => CreatePaymentParams;
	getProvider: (name: ProviderName) => PaymentProvider;
	payload: Payload;
	scope: string;
}): Promise<{ provider: ProviderName; checkout: CreatePaymentResult }> {
	let lastError: unknown = new Error("no payment provider to try");
	for (const name of input.order) {
		try {
			const checkout = await input
				.getProvider(name)
				.createPayment(input.build(name));
			return { provider: name, checkout };
		} catch (error) {
			lastError = error;
			input.payload.logger.error({
				msg: `${input.scope} ${name} could not open the payment`,
				provider: name,
				err: error,
			});
		}
	}
	throw lastError;
}

export const CAMPAY_RETURN_PATH = "/api/public/payments/campay/return";

/**
 * Where the payer's browser comes back. NotchPay keeps its settlement
 * callback; CamPay comes back to a page that reads the payment back from
 * CamPay with our reference, then sends the payer on to `next` (a web path).
 */
export function platformReturnUrl(
	provider: ProviderName,
	serverUrl: string,
	reference: string,
	next: string,
	notchpayPath: string,
): string {
	if (provider !== "campay") return new URL(notchpayPath, serverUrl).toString();
	const url = new URL(CAMPAY_RETURN_PATH, serverUrl);
	url.searchParams.set("ref", reference);
	url.searchParams.set("next", next);
	return url.toString();
}
