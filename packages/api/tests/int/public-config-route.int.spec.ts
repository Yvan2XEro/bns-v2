// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOST_PRICING } from "../../src/lib/boostPricing";

const findGlobal = vi.fn();
vi.mock("@payload-config", () => ({ default: {} }));
// The alias above does not resolve to the same module id as the real
// `import config from "@payload-config"` in route.ts inside this test's
// module graph, so it never intercepts on its own; mock the concrete file
// too (same workaround as public-search-route.int.spec.ts). Without it, the
// real payload.config.ts loads every collection, which is slow enough alone
// to brush the default 5s test timeout under full-suite parallel load.
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
// A plain factory, not `...(await importOriginal())`: the route only ever
// calls `getPayload`, and with the real config genuinely out of the graph
// above, nothing else needs a real export from "payload".
// `APIError` is there because `lib/paymentSettings.ts` reaches
// `lib/serviceError.ts`, which extends it at import time.
vi.mock("payload", () => ({
	APIError: class APIError extends Error {},
	getPayload: vi.fn(async () => ({ findGlobal })),
}));

describe("GET /api/public/config", () => {
	// A block body, not `() => findGlobal.mockReset()`: mockReset() returns the
	// mock itself, and vitest treats a function RETURNED from beforeEach as a
	// teardown callback, invoking findGlobal() again after each test — with
	// whatever implementation the test left behind, surfacing as a phantom
	// rejection on the "keeps shops off" case.
	beforeEach(() => {
		findGlobal.mockReset();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("exposes shopsEnabled from the settings", async () => {
		findGlobal.mockResolvedValue({ shops: { enabled: true, maxPerUser: 1 } });
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);
		expect(await (await GET()).json()).toMatchObject({ shopsEnabled: true });
	});

	it("keeps shops off when the settings cannot be read", async () => {
		findGlobal.mockRejectedValue(new Error("down"));
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);
		expect(await (await GET()).json()).toMatchObject({ shopsEnabled: false });
	});

	it("exposes ordersEnabled false and no cities when the flag is off", async () => {
		findGlobal.mockResolvedValue({
			orders: { enabled: false, launchCities: [] },
		});
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);
		expect(await (await GET()).json()).toMatchObject({
			ordersEnabled: false,
			launchCities: [],
		});
	});

	it("exposes the enabled cities with their label and fee", async () => {
		findGlobal.mockResolvedValue({
			orders: {
				enabled: true,
				launchCities: [{ key: "douala", deliveryFee: 2500 }],
				withdrawalDays: 10,
			},
		});
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);
		expect(await (await GET()).json()).toMatchObject({
			ordersEnabled: true,
			launchCities: [{ key: "douala", label: "Douala", fee: 2500 }],
			withdrawalDays: 10,
		});
	});

	it("hides ordering when the settings read throws", async () => {
		findGlobal.mockRejectedValue(new Error("down"));
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);
		expect(await (await GET()).json()).toMatchObject({
			ordersEnabled: false,
			launchCities: [],
			withdrawalDays: 15,
		});
	});

	it("answers the whole shape, payments included, from defaults", async () => {
		vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test");
		vi.stubEnv("CHAT_PUBLIC_URL", "https://chat.example");
		vi.stubEnv("NOVU_APPLICATION_IDENTIFIER", "novu-app");
		vi.stubEnv("PUBLIC_WEB_URL", "https://web.example");
		findGlobal.mockResolvedValue({ orders: {}, payments: {} });
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);
		expect(await (await GET()).json()).toEqual({
			stripePublishableKey: "pk_test",
			chatUrl: "https://chat.example",
			novuAppId: "novu-app",
			webUrl: "https://web.example",
			enabledAuthProviders: expect.any(Array),
			localAuthEnabled: true,
			shopsEnabled: false,
			verificationEnabled: false,
			ordersEnabled: false,
			launchCities: [
				{ key: "douala", label: "Douala", fee: 2000 },
				{ key: "yaounde", label: "Yaoundé", fee: 3500 },
			],
			withdrawalDays: 15,
			boostPricing: BOOST_PRICING,
			protectedPaymentEnabled: false,
			buyerProtection: { bps: 300, min: 100, max: 15_000 },
			checkoutExpiryMinutes: 30,
		});
	});

	it("keeps protected payment off and its figures at default when the settings read throws", async () => {
		findGlobal.mockRejectedValue(new Error("down"));
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);
		expect(await (await GET()).json()).toMatchObject({
			protectedPaymentEnabled: false,
			buyerProtection: { bps: 300, min: 100, max: 15_000 },
			checkoutExpiryMinutes: 30,
		});
	});

	describe("protectedPaymentEnabled", () => {
		let savedEnv: string | undefined;
		beforeEach(() => {
			savedEnv = process.env.PROTECTED_PAYMENT_ALLOWED;
		});
		afterEach(() => {
			if (savedEnv === undefined) delete process.env.PROTECTED_PAYMENT_ALLOWED;
			else process.env.PROTECTED_PAYMENT_ALLOWED = savedEnv;
		});

		const CM = {
			countryCode: "CM",
			currency: "XAF",
			provider: "notchpay",
			settlementMode: "provider_split",
			channels: ["cm.mtn", "cm.orange"],
			vatRateBps: 1925,
		};
		const GATES = ["G1", "G2", "G3", "G4", "G5", "G6"].map((gate) => ({
			gate,
			evidence: `evidence-${gate}`,
		}));
		type State = {
			flag: boolean;
			market: boolean;
			gates: boolean;
			env: boolean;
		};
		const ALL_ON: State = { flag: true, market: true, gates: true, env: true };

		async function answer(state: State, query = ""): Promise<unknown> {
			if (state.env) process.env.PROTECTED_PAYMENT_ALLOWED = "true";
			else delete process.env.PROTECTED_PAYMENT_ALLOWED;
			findGlobal.mockResolvedValue({
				payments: {
					protectedPayment: { enabled: state.flag },
					markets: [{ ...CM, enabled: state.market }],
					gates: state.gates ? GATES : GATES.slice(1),
					buyerProtection: { bps: 250, min: 200, max: 10_000 },
					checkoutExpiryMinutes: 20,
				},
			});
			const { GET } = await import(
				"../../src/app/(frontend)/api/public/config/route"
			);
			const body = (await (
				await GET(new Request(`http://api.test/api/public/config${query}`))
			).json()) as Record<string, unknown>;
			return body.protectedPaymentEnabled;
		}

		it("public config answers protectedPaymentEnabled false until everything is on", async () => {
			expect(await answer(ALL_ON)).toBe(true);
			for (const off of ["flag", "market", "gates", "env"] as const) {
				expect({
					off,
					answer: await answer({ ...ALL_ON, [off]: false }),
				}).toEqual({ off, answer: false });
			}
		});

		it("reads the caller's market from ?country= and answers false for one not listed", async () => {
			expect(await answer(ALL_ON, "?country=cm")).toBe(true);
			expect(await answer(ALL_ON, "?country=NG")).toBe(false);
		});

		it("exposes the admin's buyer protection and expiry figures", async () => {
			process.env.PROTECTED_PAYMENT_ALLOWED = "true";
			findGlobal.mockResolvedValue({
				payments: {
					buyerProtection: { bps: 250, min: 200, max: 10_000 },
					checkoutExpiryMinutes: 20,
				},
			});
			const { GET } = await import(
				"../../src/app/(frontend)/api/public/config/route"
			);
			expect(await (await GET()).json()).toMatchObject({
				protectedPaymentEnabled: false,
				buyerProtection: { bps: 250, min: 200, max: 10_000 },
				checkoutExpiryMinutes: 20,
			});
		});
	});
});
