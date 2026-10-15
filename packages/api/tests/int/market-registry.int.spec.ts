// @vitest-environment node
import type { Payload } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketCities } from "../../src/collections/MarketCities";
import { Markets } from "../../src/collections/Markets";
import { ERROR_CODES } from "../../src/lib/errors";
import {
	getLiveMarket,
	getMarket,
	getMarkets,
	marketIsOpen,
	marketOfShop,
} from "../../src/lib/markets";
import { SETTLEMENT_MODE_REFUSALS } from "../../src/lib/paymentSettings";
import { registerMarketplaceProvider } from "../../src/lib/payments/marketplaceRegistry";
import type { Shop } from "../../src/payload-types";
import { fakePayload } from "./helpers/fakePayload";
import { runBeforeChange } from "./helpers/runBeforeChange";

const market = (overrides: Record<string, unknown> = {}) => ({
	countryCode: "CM",
	name: "Cameroun",
	status: "draft",
	currency: { code: "XAF", minorUnit: 0, rounding: "half_up" },
	phone: {
		pattern: "^\\+2376\\d{8}$",
		examples: { valid: ["+237600000000"], invalid: ["+2376000000"] },
	},
	timezone: "Africa/Douala",
	payments: { provider: "notchpay", settlementMode: "provider_split" },
	...overrides,
});

const save = (
	seed: Record<string, object[]>,
	data: Record<string, unknown>,
	originalDoc?: Record<string, unknown>,
) =>
	runBeforeChange(Markets, {
		data,
		originalDoc,
		operation: originalDoc ? "update" : "create",
		req: { payload: fakePayload({ markets: [], ...seed }) },
	});

const production = { NODE_ENV: "production" };
let restoreEnv: Array<() => void> = [];
const withProductionEnv = () => {
	const before = { ...process.env };
	Object.assign(process.env, production, { PAYMENTS_PROVIDER: "" });
	restoreEnv.push(() => {
		Object.assign(process.env, { NODE_ENV: before.NODE_ENV });
		process.env.PAYMENTS_PROVIDER = before.PAYMENTS_PROVIDER;
	});
};
afterEach(() => {
	for (const undo of restoreEnv) undo();
	restoreEnv = [];
});

describe("markets save refusals", () => {
	it("accepts a well-formed draft", async () => {
		await expect(save({}, market())).resolves.toBeDefined();
	});

	it("refuses a duplicate country", async () => {
		await expect(
			save({ markets: [{ id: "m1", countryCode: "CM" }] }, market()),
		).rejects.toThrow("A market for CM already exists.");
	});

	it("refuses a phone pattern that does not compile", async () => {
		await expect(
			save({}, market({ phone: { pattern: "(", examples: {} } })),
		).rejects.toThrow("not a valid regular expression");
	});

	it("refuses a phone pattern that fails its own valid example", async () => {
		await expect(
			save(
				{},
				market({
					phone: {
						pattern: "^\\+2376\\d{8}$",
						examples: { valid: ["+2376000000"], invalid: [] },
					},
				}),
			),
		).rejects.toThrow("does not match its own valid example: +2376000000");
	});

	it("refuses a phone pattern that matches its own invalid example", async () => {
		await expect(
			save(
				{},
				market({
					phone: {
						pattern: "^\\+237\\d+$",
						examples: { valid: ["+237600000000"], invalid: ["+2376000000"] },
					},
				}),
			),
		).rejects.toThrow("matches its own invalid example: +2376000000");
	});

	it("refuses an unknown timezone", async () => {
		await expect(
			save({}, market({ timezone: "Africa/Doula" })),
		).rejects.toThrow('"Africa/Doula" is not an IANA timezone.');
	});

	it("refuses a settlement mode other than provider_split with the P5 prose", async () => {
		await expect(
			save(
				{},
				market({
					payments: {
						provider: "notchpay",
						settlementMode: "platform_collects",
					},
				}),
			),
		).rejects.toThrow(SETTLEMENT_MODE_REFUSALS.platform_collects);
		await expect(
			save(
				{},
				market({
					payments: {
						provider: "notchpay",
						settlementMode: "platform_collects",
					},
				}),
			),
		).rejects.toThrow("Regulation 04/18");
	});

	it("keeps the country code immutable", async () => {
		await expect(
			save({}, { countryCode: "GA" }, { id: "m1", ...market() }),
		).rejects.toThrow("country code cannot change");
	});

	it("starts as a draft and moves along the pinned transitions only", async () => {
		await expect(save({}, market({ status: "live" }))).rejects.toThrow(
			"starts as a draft",
		);
		await expect(
			save(
				{ markets: [{ id: "m1", countryCode: "CM" }] },
				{ status: "live" },
				{ id: "m1", ...market(), status: "draft" },
			),
		).rejects.toThrow("cannot move from draft to live");
		await expect(
			save(
				{ markets: [{ id: "m1", countryCode: "CM" }] },
				{ status: "review" },
				{ id: "m1", ...market(), status: "draft" },
			),
		).resolves.toBeDefined();
	});
});

describe("markets going live", () => {
	const stored = { id: "m1", ...market(), status: "review" };
	const evidence = { regulatoryReview: { evidence: "ev1" } };
	const city = { id: "c1", market: "m1", key: "douala", active: true };
	const seed = { markets: [{ id: "m1", countryCode: "CM" }] };

	it("goes live with evidence, an adapter and an active city", async () => {
		await expect(
			save(
				{ ...seed, "market-cities": [city] },
				{ status: "live", ...evidence },
				stored,
			),
		).resolves.toBeDefined();
	});

	it("refuses live without evidence", async () => {
		await expect(
			save({ ...seed, "market-cities": [city] }, { status: "live" }, stored),
		).rejects.toThrow("without counsel's review filed as evidence");
	});

	it("refuses live without a registered adapter", async () => {
		withProductionEnv();
		await expect(
			save(
				{ ...seed, "market-cities": [city] },
				{ status: "live", ...evidence },
				stored,
			),
		).rejects.toThrow('no payment adapter is registered for "notchpay"');
		const unregister = registerMarketplaceProvider("notchpay", () => {
			throw new Error("unused");
		});
		try {
			await expect(
				save(
					{ ...seed, "market-cities": [city] },
					{ status: "live", ...evidence },
					stored,
				),
			).resolves.toBeDefined();
		} finally {
			unregister();
		}
	});

	it("refuses live with zero active cities", async () => {
		await expect(
			save(
				{ ...seed, "market-cities": [{ ...city, active: false }] },
				{ status: "live", ...evidence },
				stored,
			),
		).rejects.toThrow("without an active city");
	});
});

describe("markets currency", () => {
	const stored = {
		id: "m1",
		...market(),
		status: "live",
		regulatoryReview: { evidence: "ev1" },
	};
	const edit = { currency: { code: "GNF", minorUnit: 0, rounding: "half_up" } };
	const seed = (status: string) => ({
		markets: [{ id: "m1", countryCode: "CM" }],
		"market-cities": [{ id: "c1", market: "m1", key: "douala", active: true }],
		orders: [{ id: "o1", market: "m1", status }],
	});

	it("refuses a currency edit while a non-terminal order exists", async () => {
		await expect(save(seed("placed"), edit, stored)).rejects.toThrow(
			"currency cannot change while orders in this market are still open",
		);
	});

	it("allows it once the order is cancelled", async () => {
		await expect(save(seed("cancelled"), edit, stored)).resolves.toBeDefined();
	});

	it("ignores orders of another market", async () => {
		await expect(
			save(
				{
					markets: [{ id: "m1", countryCode: "CM" }],
					"market-cities": [
						{ id: "c1", market: "m1", key: "douala", active: true },
					],
					orders: [{ id: "o1", market: "m2", status: "placed" }],
				},
				edit,
				stored,
			),
		).resolves.toBeDefined();
	});
});

describe("market-cities", () => {
	const saveCity = (
		seed: Record<string, object[]>,
		data: Record<string, unknown>,
	) =>
		runBeforeChange(MarketCities, {
			data,
			req: { payload: fakePayload({ markets: [], ...seed }) },
		});
	const existing = { id: "c1", market: "m1", key: "douala" };

	it("refuses a duplicate key within a market", async () => {
		await expect(
			saveCity(
				{ "market-cities": [existing] },
				{ market: "m1", key: "douala" },
			),
		).rejects.toThrow('The city "douala" already exists in this market.');
	});

	it("accepts the same key in another market", async () => {
		await expect(
			saveCity(
				{ "market-cities": [existing] },
				{ market: "m2", key: "douala" },
			),
		).resolves.toBeDefined();
	});

	it("refuses duplicate district slugs and declares the compound unique index", async () => {
		await expect(
			saveCity(
				{},
				{
					market: "m1",
					key: "douala",
					districts: [
						{ slug: "douala.akwa", label: "Akwa" },
						{ slug: "douala.akwa", label: "Akwa 2" },
					],
				},
			),
		).rejects.toThrow("District slugs must be unique");
		expect(MarketCities.indexes).toContainEqual({
			fields: ["market", "key"],
			unique: true,
		});
	});
});

describe("the market loader", () => {
	const stored = (overrides: Record<string, unknown> = {}) => ({
		id: "m1",
		countryCode: "CM",
		name: "Cameroun",
		status: "live",
		currency: { code: "XAF", minorUnit: 0, rounding: "half_up" },
		formatting: [
			{
				locale: "fr",
				symbol: "FCFA",
				position: "after",
				groupSeparator: "\u202f",
				decimalSeparator: ",",
			},
		],
		phone: { pattern: "^\\+2376\\d{8}$", displayExample: "+237 6 00 00 00 00" },
		timezone: "Africa/Douala",
		languages: ["fr", "en"],
		vatRateBps: 1925,
		payments: {
			provider: "notchpay",
			settlementMode: "provider_split",
			channels: ["cm.mtn"],
			enabled: true,
		},
		features: { cod: true, protectedPayment: false },
		amounts: {
			minPayout: 1000,
			maxOrderAmount: 1_000_000,
			exposureLevel2: 500_000,
			exposureLevel3: 2_000_000,
			buyerProtectionMin: 100,
			buyerProtectionMax: 15_000,
			defaultDeliveryFeeFallback: 1500,
		},
		moneyCalendar: {
			releaseHourLocal: 10,
			reconcileHourLocal: 2,
			vatPeriod: "calendar_month",
		},
		updatedAt: "2026-10-09T10:00:00.000Z",
		...overrides,
	});
	const payloadOf = (seed: Record<string, object[]>) =>
		fakePayload({ markets: [], ...seed }) as unknown as Payload;

	it("serves a valid row whole", async () => {
		const [cm] = await getMarkets(payloadOf({ markets: [stored()] }));
		expect(cm.currency).toEqual({
			code: "XAF",
			minorUnit: 0,
			rounding: "half_up",
		});
		expect(cm.formats).toEqual([
			{
				locale: "fr",
				symbol: "FCFA",
				position: "after",
				groupSeparator: "\u202f",
				decimalSeparator: ",",
				minorUnit: 0,
			},
		]);
		expect(cm.features.cod).toBe(true);
		expect(cm.features.boosts).toBe(false);
		expect(cm.amounts.defaultDeliveryFeeFallback).toBe(1500);
	});

	const broken: Array<[string, Record<string, unknown>]> = [
		["countryCode", { countryCode: "cm" }],
		["currency.code", { currency: { minorUnit: 0, rounding: "half_up" } }],
		[
			"currency.code shape",
			{ currency: { code: "xaf", minorUnit: 0, rounding: "half_up" } },
		],
		[
			"minorUnit",
			{ currency: { code: "XAF", minorUnit: 7, rounding: "half_up" } },
		],
		["rounding", { currency: { code: "XAF", minorUnit: 0, rounding: "ceil" } }],
		["phone.pattern", { phone: { pattern: "(", displayExample: "x" } }],
		["timezone", { timezone: "Africa/Doula" }],
		["vatRateBps", { vatRateBps: 10_001 }],
		[
			"payments.provider",
			{ payments: { provider: "stripe", settlementMode: "provider_split" } },
		],
		[
			"payments.settlementMode",
			{
				payments: { provider: "notchpay", settlementMode: "platform_collects" },
			},
		],
		["amounts", { amounts: { minPayout: 1000 } }],
		["status", { status: "open" }],
	];

	it.each(
		broken,
	)("drops a row with a bad %s, never repairs it", async (_name, patch) => {
		const good = payloadOf({ markets: [stored()] });
		expect(await getMarkets(good)).toHaveLength(1);
		const bad = payloadOf({ markets: [stored(patch)] });
		expect(await getMarkets(bad)).toHaveLength(0);
		await expect(getMarket(bad, "CM")).rejects.toMatchObject({
			code: ERROR_CODES.marketUnknown,
		});
		await expect(getLiveMarket(bad, "CM")).rejects.toMatchObject({
			code: ERROR_CODES.marketUnknown,
		});
	});

	it("refuses a country listed twice", async () => {
		const payload = payloadOf({ markets: [stored(), stored({ id: "m2" })] });
		expect(await getMarkets(payload)).toHaveLength(0);
	});

	it("refuses a market that is not live", async () => {
		const payload = payloadOf({ markets: [stored({ status: "review" })] });
		expect((await getMarket(payload, "cm")).status).toBe("review");
		await expect(getLiveMarket(payload, "CM")).rejects.toMatchObject({
			code: ERROR_CODES.marketNotLive,
		});
		await expect(getMarket(payload, "GA")).rejects.toMatchObject({
			code: ERROR_CODES.marketUnknown,
		});
	});

	it("opens a feature only when the market and the global flag are both on", async () => {
		const [cm] = await getMarkets(payloadOf({ markets: [stored()] }));
		expect(marketIsOpen(cm, "cod", true)).toBe(true);
		expect(marketIsOpen(cm, "cod", false)).toBe(false);
		expect(marketIsOpen(cm, "protectedPayment", true)).toBe(false);
		expect(marketIsOpen(cm, "protectedPayment", false)).toBe(false);
		expect(marketIsOpen({ ...cm, status: "suspended" }, "cod", true)).toBe(
			false,
		);
	});

	describe("marketOfShop", () => {
		const seed = {
			markets: [stored()],
			"market-cities": [{ id: "c1", market: "m1", key: "douala" }],
		};
		const shop = (city?: string, countryCode?: string) =>
			({ id: "s1", location: { city, countryCode } }) as Shop;

		it("resolves a shop through its city's market", async () => {
			const cm = await marketOfShop(payloadOf(seed), shop("douala"));
			expect(cm.countryCode).toBe("CM");
		});

		it("refuses an unknown or missing city", async () => {
			await expect(
				marketOfShop(payloadOf(seed), shop("libreville")),
			).rejects.toMatchObject({
				code: ERROR_CODES.marketUnknown,
			});
			await expect(marketOfShop(payloadOf(seed), shop())).rejects.toMatchObject(
				{
					code: ERROR_CODES.marketUnknown,
				},
			);
		});

		it("refuses a city whose market was dropped", async () => {
			const dropped = { ...seed, markets: [stored({ timezone: "nope" })] };
			await expect(
				marketOfShop(payloadOf(dropped), shop("douala")),
			).rejects.toMatchObject({
				code: ERROR_CODES.marketUnknown,
			});
		});

		it("uses the shop's country when two markets share a city key", async () => {
			const both = {
				markets: [stored(), stored({ id: "m2", countryCode: "GA" })],
				"market-cities": [
					{ id: "c1", market: "m1", key: "douala" },
					{ id: "c2", market: "m2", key: "douala" },
				],
			};
			await expect(
				marketOfShop(payloadOf(both), shop("douala")),
			).rejects.toMatchObject({
				code: ERROR_CODES.marketUnknown,
			});
			expect(
				(await marketOfShop(payloadOf(both), shop("douala", "GA"))).id,
			).toBe("m2");
		});
	});

	describe("the 60 s cache", () => {
		afterEach(() => vi.useRealTimers());

		it("serves the old list until the hook invalidates it", async () => {
			const seeded = { markets: [stored()] };
			const payload = payloadOf(seeded);
			expect((await getMarkets(payload))[0].name).toBe("Cameroun");
			await payload.update({
				collection: "markets",
				id: "m1",
				data: { name: "Cameroon" },
			});
			expect((await getMarkets(payload))[0].name).toBe("Cameroun");
			const hook = Markets.hooks?.afterChange?.[0] as (a: unknown) => unknown;
			await hook({ doc: {}, req: { payload } });
			expect((await getMarkets(payload))[0].name).toBe("Cameroon");
		});

		it("expires on its own after 60 s", async () => {
			vi.useFakeTimers();
			const seeded = { markets: [stored()] };
			const payload = payloadOf(seeded);
			await getMarkets(payload);
			await payload.update({
				collection: "markets",
				id: "m1",
				data: { name: "Cameroon" },
			});
			vi.advanceTimersByTime(59_000);
			expect((await getMarkets(payload))[0].name).toBe("Cameroun");
			vi.advanceTimersByTime(2_000);
			expect((await getMarkets(payload))[0].name).toBe("Cameroon");
		});
	});
});
