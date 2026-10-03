// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
	type PaymentSettings,
} from "../../src/lib/paymentSettings";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import {
	getMarketplaceProvider,
	registerMarketplaceProvider,
	sharedFakeMarketplace,
} from "../../src/lib/payments/marketplaceRegistry";
import { ServiceError } from "../../src/lib/serviceError";
import { runMarketplaceContract } from "./helpers/marketplaceContract";

export {
	fakeContractDriver,
	type MarketplaceContractDriver,
	runMarketplaceContract,
} from "./helpers/marketplaceContract";

const settings: PaymentSettings = {
	...PAYMENT_DEFAULTS,
	markets: DEFAULT_MARKETS,
};

let savedEnv: NodeJS.ProcessEnv;
beforeEach(() => {
	savedEnv = { ...process.env };
});
afterEach(() => {
	process.env = savedEnv;
});

function setEnv(values: Record<string, string | undefined>) {
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

function refusalOf(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}
	throw new Error("expected getMarketplaceProvider to throw, it returned");
}

describe("getMarketplaceProvider", () => {
	it("serves the one shared fake under test, whatever the market's provider", () => {
		setEnv({ NODE_ENV: "test", PAYMENTS_PROVIDER: undefined });
		const provider = getMarketplaceProvider(settings);
		expect(provider).toBeInstanceOf(FakeMarketplaceProvider);
		expect(provider.id).toBe("fake");
		expect(getMarketplaceProvider(settings, { countryCode: "CM" })).toBe(
			provider,
		);
		expect(provider).toBe(sharedFakeMarketplace());
	});

	it("serves the fake in production when PAYMENTS_PROVIDER=fake (staging)", () => {
		setEnv({ NODE_ENV: "production", PAYMENTS_PROVIDER: "fake" });
		expect(getMarketplaceProvider(settings)).toBe(sharedFakeMarketplace());
	});

	it("refuses with payment.providerUnavailable (503) in production with no adapter registered", () => {
		setEnv({ NODE_ENV: "production", PAYMENTS_PROVIDER: undefined });
		for (const run of [
			() => getMarketplaceProvider(settings),
			() => getMarketplaceProvider(settings, { countryCode: "CM" }),
			() => getMarketplaceProvider({ ...settings, markets: [] }),
		]) {
			const error = refusalOf(run);
			expect(error).toBeInstanceOf(ServiceError);
			expect(error).toMatchObject({
				code: ERROR_CODES.paymentProviderUnavailable,
				status: 503,
			});
		}
	});

	it("an env passed explicitly decides, not process.env", () => {
		setEnv({ NODE_ENV: "test", PAYMENTS_PROVIDER: undefined });
		const error = refusalOf(() =>
			getMarketplaceProvider(settings, { env: { NODE_ENV: "production" } }),
		);
		expect(error).toMatchObject({ status: 503 });
	});

	it("a registered adapter wins in production, built from the env, and unregisters cleanly", () => {
		setEnv({ NODE_ENV: "production", PAYMENTS_PROVIDER: undefined });
		const dummy = new FakeMarketplaceProvider();
		const envs: Array<string | undefined> = [];
		const unregister = registerMarketplaceProvider("notchpay", (env) => {
			envs.push(env.NODE_ENV);
			return dummy;
		});
		try {
			expect(getMarketplaceProvider(settings)).toBe(dummy);
			expect(getMarketplaceProvider(settings, { countryCode: "cm" })).toBe(
				dummy,
			);
			expect(dummy).not.toBe(sharedFakeMarketplace());
			expect(envs).toEqual(["production", "production"]);
		} finally {
			unregister();
		}
		expect(refusalOf(() => getMarketplaceProvider(settings))).toMatchObject({
			status: 503,
		});
	});

	it("a registered adapter does not displace the fake outside production", () => {
		setEnv({ NODE_ENV: "development", PAYMENTS_PROVIDER: undefined });
		const unregister = registerMarketplaceProvider(
			"notchpay",
			() => new FakeMarketplaceProvider(),
		);
		try {
			expect(getMarketplaceProvider(settings)).toBe(sharedFakeMarketplace());
		} finally {
			unregister();
		}
	});

	it("a country with no market row is the market's refusal, not a provider outage", () => {
		setEnv({ NODE_ENV: "production", PAYMENTS_PROVIDER: undefined });
		const error = refusalOf(() =>
			getMarketplaceProvider(settings, { countryCode: "SN" }),
		);
		expect(error).toMatchObject({
			code: ERROR_CODES.paymentMarketUnavailable,
			status: 400,
		});
	});
});

runMarketplaceContract(() => new FakeMarketplaceProvider());
