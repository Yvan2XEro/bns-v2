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

export function usesFakeMarketplace(env: PaymentEnv = process.env): boolean {
	return env.PAYMENTS_PROVIDER === "fake" || env.NODE_ENV !== "production";
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
