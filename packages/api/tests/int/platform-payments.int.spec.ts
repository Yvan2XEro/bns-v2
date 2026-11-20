// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderName } from "../../src/lib/payments/types";
import {
	CAMPAY_RETURN_PATH,
	openCheckout,
	platformPaymentSettingsOf,
	platformProviderOrder,
	platformReturnUrl,
} from "../../src/lib/platformPayments";
import { startBoostPurchase } from "../../src/services/boostPurchase";
import { fakePayload } from "./helpers/fakePayload";

const NOTCHPAY = { NOTCHPAY_PUBLIC_KEY: "pk" };
const CAMPAY = { CAMPAY_PERMANENT_TOKEN: "t", CAMPAY_WEBHOOK_KEY: "k" };

describe("platform payment settings", () => {
	it("defaults to NotchPay with failover, and ignores unknown values", () => {
		expect(platformPaymentSettingsOf(undefined)).toEqual({
			provider: "notchpay",
			failover: true,
		});
		expect(
			platformPaymentSettingsOf({ provider: "paypal", failover: "yes" }),
		).toEqual({
			provider: "notchpay",
			failover: true,
		});
		expect(
			platformPaymentSettingsOf({ provider: "campay", failover: false }),
		).toEqual({
			provider: "campay",
			failover: false,
		});
	});
});

describe("platformProviderOrder", () => {
	const campayFirst = { provider: "campay", failover: true } as const;
	it("tries the primary, then the other when failover is on", () => {
		expect(
			platformProviderOrder(campayFirst, { ...NOTCHPAY, ...CAMPAY }),
		).toEqual(["campay", "notchpay"]);
	});
	it("tries the primary alone when failover is off", () => {
		expect(
			platformProviderOrder(
				{ ...campayFirst, failover: false },
				{ ...NOTCHPAY, ...CAMPAY },
			),
		).toEqual(["campay"]);
	});
	it("skips a provider whose keys are not set", () => {
		expect(platformProviderOrder(campayFirst, NOTCHPAY)).toEqual(["notchpay"]);
		// CamPay without its webhook key is not offered: its callbacks would all be refused.
		expect(
			platformProviderOrder(campayFirst, { CAMPAY_PERMANENT_TOKEN: "t" }),
		).toEqual([]);
	});
});

describe("openCheckout", () => {
	const payload = { logger: { error: vi.fn() } } as never;
	const ok = (name: string) => ({
		createPayment: vi.fn(async () => ({
			checkoutUrl: `https://${name}`,
			providerReference: name,
		})),
	});
	const down = () => ({
		createPayment: vi.fn(async () => {
			throw new Error("503");
		}),
	});

	it("falls through to the next provider when one refuses", async () => {
		const providers: Record<string, ReturnType<typeof ok>> = {
			campay: down() as never,
			notchpay: ok("np"),
		};
		const build = vi.fn((name: ProviderName) => ({ provider: name }) as never);
		const result = await openCheckout({
			order: ["campay", "notchpay"],
			getProvider: (name) => providers[name] as never,
			build,
			payload,
			scope: "[test]",
		});
		expect(result).toEqual({
			provider: "notchpay",
			checkout: { checkoutUrl: "https://np", providerReference: "np" },
		});
		expect(build.mock.calls.map(([name]) => name)).toEqual([
			"campay",
			"notchpay",
		]);
	});

	it("throws the last refusal when every provider refuses", async () => {
		await expect(
			openCheckout({
				order: ["notchpay", "campay"],
				getProvider: () => {
					throw new Error("not configured");
				},
				build: () => ({}) as never,
				payload,
				scope: "[test]",
			}),
		).rejects.toThrow("not configured");
	});
});

describe("platformReturnUrl", () => {
	it("keeps NotchPay's callback and sends CamPay to the return page with our reference", () => {
		expect(
			platformReturnUrl(
				"notchpay",
				"https://api.test",
				"PI-1",
				"/seller/payments",
				"/np/callback",
			),
		).toBe("https://api.test/np/callback");
		const url = new URL(
			platformReturnUrl(
				"campay",
				"https://api.test",
				"PI-1",
				"/seller/payments",
				"/np/callback",
			),
		);
		expect(url.pathname).toBe(CAMPAY_RETURN_PATH);
		expect(url.searchParams.get("ref")).toBe("PI-1");
		expect(url.searchParams.get("next")).toBe("/seller/payments");
	});
});

describe("boost purchase with failover", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("opens the payment with CamPay when NotchPay refuses, and records CamPay", async () => {
		for (const [k, v] of Object.entries({ ...NOTCHPAY, ...CAMPAY }))
			vi.stubEnv(k, v);
		const payload = fakePayload(
			{
				users: [{ id: "u-1", phoneVerifiedAt: "2026-09-01T00:00:00.000Z" }],
				listings: [
					{ id: "l-1", title: "Bike", seller: "u-1", status: "published" },
				],
			},
			{ uniques: { "payment-intents": [["idempotencyKey"]] } },
		);
		const calls: { name: ProviderName; callbackUrl: string }[] = [];
		const getProvider = (name: ProviderName) =>
			({
				id: name,
				createPayment: vi.fn(async (params: { callbackUrl: string }) => {
					calls.push({ name, callbackUrl: params.callbackUrl });
					if (name === "notchpay") throw new Error("NotchPay (503)");
					return {
						checkoutUrl: "https://campay.test/pay/1",
						providerReference: "cp-uuid-1",
					};
				}),
				verifyWebhook: vi.fn(),
				parseWebhookEvent: vi.fn(),
				verifyPayment: vi.fn(),
			}) as never;

		const result = await startBoostPurchase(
			payload,
			{
				userId: "u-1",
				email: "seller@example.com",
				listingId: "l-1",
				duration: "14",
				providerName: "notchpay",
				serverUrl: "https://api.test",
			},
			{ getProvider },
		);

		expect(result).toMatchObject({
			provider: "campay",
			checkoutUrl: "https://campay.test/pay/1",
		});
		expect(calls.map((c) => c.name)).toEqual(["notchpay", "campay"]);
		const campayReturn = new URL(calls[1]?.callbackUrl ?? "");
		expect(campayReturn.searchParams.get("provider")).toBe("campay");
		const intent = payload.store["payment-intents"][0];
		expect(campayReturn.searchParams.get("ref")).toBe(String(intent.reference));
		expect(intent).toMatchObject({
			provider: "campay",
			providerReference: "cp-uuid-1",
			status: "pending",
		});
		expect(payload.store["boost-payments"][0]).toMatchObject({
			paymentProvider: "campay",
		});
	});
});
