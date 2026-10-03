// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppSettings } from "../../src/globals/AppSettings";
import { ERROR_CODES } from "../../src/lib/errors";
import {
	getPaymentSettings,
	isProtectedPaymentOpen,
	resolveSettlement,
} from "../../src/lib/paymentSettings";
import { ServiceError } from "../../src/lib/serviceError";
import { fakePayload } from "./helpers/fakePayload";

const settingsGlobal = (payments: Record<string, unknown>) =>
	fakePayload({}, { globals: { "app-settings": { payments } } });

const CM = {
	countryCode: "CM",
	currency: "XAF",
	provider: "notchpay",
	settlementMode: "provider_split",
	channels: ["cm.mtn", "cm.orange"],
	vatRateBps: 1925,
	enabled: false,
};

const gate = (id: string) => ({
	gate: id,
	clearedAt: "2026-10-01T00:00:00.000Z",
	clearedBy: "Product owner",
	evidence: `evidence-${id}`,
	note: null,
});
const ALL_GATES = ["G1", "G2", "G3", "G4", "G5", "G6"].map(gate);

const SAVED_ORIGINAL = { orders: { vatRateBps: 1925 }, payments: {} };

type Hook = (args: {
	data: Record<string, unknown>;
	originalDoc?: Record<string, unknown>;
}) => unknown;
/** Every hook of the global in order, the way Payload runs them on a save. */
const beforeChange: Hook = (args) => {
	let data = args.data;
	for (const hook of (AppSettings.hooks?.beforeChange ??
		[]) as unknown as Hook[])
		data = hook({ ...args, data }) as Record<string, unknown>;
	return data;
};

/** The hook's refusal message, or null when it let the save through. */
function refusalOf(
	payments: Record<string, unknown>,
	orders: Record<string, unknown> = { vatRateBps: 1925 },
): string | null {
	try {
		beforeChange({ data: { payments, orders }, originalDoc: SAVED_ORIGINAL });
		return null;
	} catch (error) {
		return (error as Error).message;
	}
}

let savedEnv: string | undefined;
beforeEach(() => {
	savedEnv = process.env.PROTECTED_PAYMENT_ALLOWED;
	process.env.PROTECTED_PAYMENT_ALLOWED = "true";
});
afterEach(() => {
	if (savedEnv === undefined) delete process.env.PROTECTED_PAYMENT_ALLOWED;
	else process.env.PROTECTED_PAYMENT_ALLOWED = savedEnv;
});

describe("getPaymentSettings", () => {
	it("fails closed when the global is unreadable or the group absent", async () => {
		const unreadable = fakePayload();
		unreadable.failWhen = (method) => method === "findGlobal";
		for (const payload of [unreadable, fakePayload()]) {
			const settings = await getPaymentSettings(payload);
			expect(settings.protectedPayment.enabled).toBe(false);
			expect(settings.markets).toEqual([]);
			expect(settings.gates).toEqual([]);
		}
	});

	it("seeds nothing and reads the CM defaults when the admin saved none", async () => {
		const settings = await getPaymentSettings(settingsGlobal({}));
		expect(settings).toEqual({
			protectedPayment: { enabled: false },
			releaseModel: "provider_hold",
			markets: [CM],
			buyerProtection: { bps: 300, min: 100, max: 15_000 },
			checkoutExpiryMinutes: 30,
			payoutAccountChangeHoldHours: 72,
			minPayout: 1000,
			maxOrderAmount: 1_000_000,
			exposureCaps: { level2: 500_000, level3: 2_000_000 },
			earlyRelease: { enabled: false },
			providerFeeBearer: "platform",
			gates: [],
		});
	});

	it("drops a market row it cannot trust and keeps the sane ones", async () => {
		const settings = await getPaymentSettings(
			settingsGlobal({
				markets: [
					{ ...CM, channels: ["cm.mtn", "cm.pigeon"] },
					{ ...CM, countryCode: "cameroon" },
					{ ...CM, countryCode: "CM", currency: "EUR" },
				],
				buyerProtection: { bps: -5, min: 900, max: 100 },
			}),
		);
		// The duplicate CM row loses to the first; the unknown channel is dropped.
		expect(settings.markets).toEqual([{ ...CM, channels: ["cm.mtn"] }]);
		// min above max is not a range: both bounds fall back together.
		expect(settings.buyerProtection).toEqual({
			bps: 300,
			min: 100,
			max: 15_000,
		});
	});

	it("reads gate rows by their evidence id", async () => {
		const settings = await getPaymentSettings(
			settingsGlobal({
				gates: [
					{ ...gate("G1"), evidence: { id: "doc-1" } },
					{ gate: "G9", evidence: "x" },
				],
			}),
		);
		expect(settings.gates).toEqual([
			{
				gate: "G1",
				clearedAt: "2026-10-01T00:00:00.000Z",
				clearedBy: "Product owner",
				evidence: "doc-1",
				note: null,
			},
		]);
	});
});

describe("resolveSettlement", () => {
	it('resolveSettlement returns the CM row and throws payment.marketUnavailable for "NG"', async () => {
		const settings = await getPaymentSettings(settingsGlobal({}));
		expect(resolveSettlement(settings, "CM")).toEqual(CM);
		expect(resolveSettlement(settings, "cm")).toEqual(CM);

		let thrown: unknown = null;
		try {
			resolveSettlement(settings, "NG");
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(ServiceError);
		expect((thrown as ServiceError).code).toBe(
			ERROR_CODES.paymentMarketUnavailable,
		);
		expect((thrown as ServiceError).status).toBe(400);
	});
});

describe("AppSettings beforeChange — payments", () => {
	it("lets the shipped defaults save", () => {
		expect(refusalOf({ markets: [CM] })).toBeNull();
		// The hook ran and handed the data back untouched.
		const out = beforeChange({
			data: { payments: { markets: [CM] } },
			originalDoc: SAVED_ORIGINAL,
		}) as { payments: unknown };
		expect(out.payments).toEqual({ markets: [CM] });
	});

	it("beforeChange refuses settlementMode direct_to_seller and platform_collects", () => {
		const seller = refusalOf({
			markets: [{ ...CM, settlementMode: "direct_to_seller" }],
		});
		expect(seller).toContain('Market CM: settlementMode "direct_to_seller"');
		expect(seller).toContain(
			"The seller has the money before delivery, so there is no protection: it is the mobile-money deposit pattern behind the scams the product exists to stop.",
		);

		const platform = refusalOf({
			markets: [{ ...CM, settlementMode: "platform_collects" }],
		});
		expect(platform).toContain('Market CM: settlementMode "platform_collects"');
		expect(platform).toContain(
			"BuyNSellem would hold and transmit third-party funds: a payment service under Regulation 04/18 art. 5, closable under art. 84.",
		);
	});

	it("beforeChange refuses enabling protectedPayment without gate evidence rows", () => {
		expect(
			refusalOf({ protectedPayment: { enabled: true }, markets: [CM] }),
		).toBe(
			"Protected payment cannot be enabled until the gate record holds evidence for G1, G2, G3, G4, G5, G6 (G3 because releaseModel is provider_hold).",
		);

		// A row without evidence does not count; the message names what is left.
		const partial = refusalOf({
			protectedPayment: { enabled: true },
			markets: [CM],
			gates: [gate("G1"), gate("G2"), { ...gate("G4"), evidence: null }],
		});
		expect(partial).toBe(
			"Protected payment cannot be enabled until the gate record holds evidence for G3, G4, G5, G6 (G3 because releaseModel is provider_hold).",
		);

		// provider_schedule does not need G3.
		expect(
			refusalOf({
				protectedPayment: { enabled: true },
				releaseModel: "provider_schedule",
				markets: [CM],
				gates: ["G1", "G2", "G4", "G5"].map(gate),
			}),
		).toBe(
			"Protected payment cannot be enabled until the gate record holds evidence for G6.",
		);

		// Enabling a market alone is enabling, too.
		expect(
			refusalOf({
				markets: [{ ...CM, enabled: true }],
				gates: ["G1", "G2", "G4", "G5", "G6"].map(gate),
			}),
		).toBe(
			"Protected payment cannot be enabled until the gate record holds evidence for G3 (G3 because releaseModel is provider_hold).",
		);

		// Every gate filed: the save goes through.
		expect(
			refusalOf({
				protectedPayment: { enabled: true },
				markets: [{ ...CM, enabled: true }],
				gates: ALL_GATES,
			}),
		).toBeNull();
	});

	it("beforeChange refuses enabling without PROTECTED_PAYMENT_ALLOWED=true in the env", () => {
		const everything = {
			protectedPayment: { enabled: true },
			markets: [{ ...CM, enabled: true }],
			gates: ALL_GATES,
		};
		expect(refusalOf(everything)).toBeNull();

		for (const value of [undefined, "false", "1"]) {
			if (value === undefined) delete process.env.PROTECTED_PAYMENT_ALLOWED;
			else process.env.PROTECTED_PAYMENT_ALLOWED = value;
			expect(refusalOf(everything)).toBe(
				"Protected payment cannot be enabled: PROTECTED_PAYMENT_ALLOWED=true is not set on the API.",
			);
		}
		// Leaving it off never needs the env var.
		delete process.env.PROTECTED_PAYMENT_ALLOWED;
		expect(refusalOf({ markets: [CM] })).toBeNull();
	});

	// Pins the WIRING, not just the function: a first version of this guard
	// was unit-tested green while the hook never called it.
	it("beforeChange refuses enabling in production while no adapter is registered", () => {
		const everything = {
			protectedPayment: { enabled: true },
			markets: [{ ...CM, enabled: true }],
			gates: ALL_GATES,
		};
		const savedNodeEnv = process.env.NODE_ENV;
		const savedProvider = process.env.PAYMENTS_PROVIDER;
		try {
			process.env.NODE_ENV = "production";
			delete process.env.PAYMENTS_PROVIDER;
			expect(refusalOf(everything)).toContain(
				'no payment adapter is registered for "notchpay"',
			);
			// The explicit staging override stands in for an adapter.
			process.env.PAYMENTS_PROVIDER = "fake";
			expect(refusalOf(everything)).toBeNull();
		} finally {
			process.env.NODE_ENV = savedNodeEnv;
			if (savedProvider === undefined) delete process.env.PAYMENTS_PROVIDER;
			else process.env.PAYMENTS_PROVIDER = savedProvider;
		}
	});

	it("beforeChange refuses a market vatRateBps different from orders.vatRateBps for the same country", () => {
		expect(refusalOf({ markets: [{ ...CM, vatRateBps: 1800 }] })).toBe(
			"Market CM: vatRateBps 1800 differs from orders.vatRateBps 1925; COD and protected-payment invoices would diverge.",
		);
		// The orders side counts as much as the market side.
		expect(refusalOf({ markets: [CM] }, { vatRateBps: 1800 })).toBe(
			"Market CM: vatRateBps 1925 differs from orders.vatRateBps 1800; COD and protected-payment invoices would diverge.",
		);
		// A save that leaves orders out compares against the stored figure.
		let message: string | null = null;
		try {
			beforeChange({
				data: { payments: { markets: [{ ...CM, vatRateBps: 1000 }] } },
				originalDoc: SAVED_ORIGINAL,
			});
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toBe(
			"Market CM: vatRateBps 1000 differs from orders.vatRateBps 1925; COD and protected-payment invoices would diverge.",
		);
	});

	it("refuses a country listed twice", () => {
		expect(refusalOf({ markets: [CM, { ...CM }] })).toBe(
			"Market CM is listed more than once.",
		);
	});
});

describe("isProtectedPaymentOpen", () => {
	it("re-checks the gates and the env on read, not only on save", async () => {
		const settings = await getPaymentSettings(
			settingsGlobal({
				protectedPayment: { enabled: true },
				markets: [{ ...CM, enabled: true }],
				gates: ALL_GATES,
			}),
		);
		expect(
			isProtectedPaymentOpen(settings, "CM", {
				PROTECTED_PAYMENT_ALLOWED: "true",
			}),
		).toBe(true);
		expect(isProtectedPaymentOpen(settings, "CM", {})).toBe(false);
		expect(
			isProtectedPaymentOpen(settings, "NG", {
				PROTECTED_PAYMENT_ALLOWED: "true",
			}),
		).toBe(false);
	});
});
