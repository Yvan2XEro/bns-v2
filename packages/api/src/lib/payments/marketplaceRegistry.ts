import { ERROR_CODES } from "../errors";
import {
	type PaymentEnv,
	type PaymentProviderId,
	type PaymentSettings,
	resolveSettlement,
} from "../paymentSettings";
import { ServiceError } from "../serviceError";
import { FakeMarketplaceProvider } from "./fakeMarketplace";
import type { MarketplaceProvider } from "./marketplace";

/**
 * The one place a `MarketplaceProvider` instance comes from. Services, routes
 * and jobs call `getMarketplaceProvider`; none of them imports an adapter.
 *
 * No real adapter is registered in this phase: a future one calls
 * `registerMarketplaceProvider` at module load and must first pass
 * `runMarketplaceContract` (tests/int/marketplace-contract.int.spec.ts).
 */
export type MarketplaceProviderFactory = (
	env: PaymentEnv,
) => MarketplaceProvider;

const factories = new Map<PaymentProviderId, MarketplaceProviderFactory>();
let sharedFake: FakeMarketplaceProvider | undefined;

/** Returns the function that removes this registration. */
export function registerMarketplaceProvider(
	name: PaymentProviderId,
	factory: MarketplaceProviderFactory,
): () => void {
	factories.set(name, factory);
	return () => {
		if (factories.get(name) === factory) factories.delete(name);
	};
}

/**
 * Whether enabling protected payment would have a provider to stand on:
 * a registered real adapter for `name`, or the explicit fake override. The
 * settings hook asks this before letting the flag through — the constraint
 * "the flag cannot be enabled while no adapter is registered" lives here,
 * not in prose.
 */
export function hasMarketplaceProvider(
	name: PaymentProviderId,
	env: PaymentEnv = process.env,
): boolean {
	return factories.has(name) || usesFakeMarketplace(env);
}

export function usesFakeMarketplace(env: PaymentEnv = process.env): boolean {
	return env.PAYMENTS_PROVIDER === "fake" || env.NODE_ENV !== "production";
}

/**
 * The settings hook's half of the hexagonal bargain: enabling protected
 * payment (globally or per market) is refused while the named provider has
 * no registered adapter and the fake override is not explicitly on. Shaped
 * like `paymentSettingsRefusal` — a sentence or null — so the hook treats
 * both the same way.
 */
export function adapterPresenceRefusal(
	payments: unknown,
	env: PaymentEnv = process.env,
): null | string {
	const p = (payments ?? {}) as {
		protectedPayment?: { enabled?: unknown };
		markets?: Array<{ enabled?: unknown; provider?: unknown }>;
	};
	const enabling =
		p.protectedPayment?.enabled === true ||
		(p.markets ?? []).some((m) => m.enabled === true);
	if (!enabling) return null;
	const providers = new Set(
		(p.markets ?? [])
			.map((m) => m.provider)
			.filter((x): x is PaymentProviderId => typeof x === "string"),
	);
	for (const name of providers) {
		if (!hasMarketplaceProvider(name, env)) {
			return `Protected payment cannot be enabled: no payment adapter is registered for "${name}" and PAYMENTS_PROVIDER=fake is not set. Build and register the adapter first.`;
		}
	}
	return null;
}

/** The single fake every non-production caller shares, so a webhook verifies against the instance that signed it. */
export function sharedFakeMarketplace(): FakeMarketplaceProvider {
	sharedFake ??= new FakeMarketplaceProvider();
	return sharedFake;
}

/**
 * Without a country, the first market row names the provider: the launch
 * market, the same convention as the public config route. Webhooks and
 * reconciliation have no buyer country to offer.
 */
export function getMarketplaceProvider(
	settings: PaymentSettings,
	options: { countryCode?: string; env?: PaymentEnv } = {},
): MarketplaceProvider {
	const env = options.env ?? process.env;
	if (usesFakeMarketplace(env)) return sharedFakeMarketplace();
	const name =
		options.countryCode === undefined
			? settings.markets[0]?.provider
			: resolveSettlement(settings, options.countryCode).provider;
	const factory = name === undefined ? undefined : factories.get(name);
	if (!factory)
		throw new ServiceError(ERROR_CODES.paymentProviderUnavailable, 503);
	return factory(env);
}
