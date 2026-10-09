// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { MarketCities } from "../../src/collections/MarketCities";
import { Markets } from "../../src/collections/Markets";
import { SETTLEMENT_MODE_REFUSALS } from "../../src/lib/paymentSettings";
import { registerMarketplaceProvider } from "../../src/lib/payments/marketplaceRegistry";
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
		req: { payload: fakePayload(seed) },
	});

const production = { NODE_ENV: "production" };
let restoreEnv: Array<() => void> = [];
const withProductionEnv = () => {
	const before = { ...process.env };
	Object.assign(process.env, production, { PAYMENTS_PROVIDER: "" });
	restoreEnv.push(() => {
		process.env.NODE_ENV = before.NODE_ENV;
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
			req: { payload: fakePayload(seed) },
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
