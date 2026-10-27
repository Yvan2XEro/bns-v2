// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatMoney } from "../../src/contracts/money";
import {
	districtLabel,
	LAUNCH_CITIES,
	LAUNCH_CITY_KEYS,
} from "../../src/lib/launchCities";
import { getMarketCities } from "../../src/lib/marketCities";
import { getMarket, type Market } from "../../src/lib/markets";
import { formatXaf } from "../../src/lib/orderFormat";
import { getOrderSettings } from "../../src/lib/orderSettings";
import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
} from "../../src/lib/paymentSettings";
import { seedMarkets } from "../../src/seed/seedMarkets";
import { DELIVERY_PHONE_PATTERN } from "../../src/services/checkout";
import { monthKeyFor } from "../../src/services/sequences";
import { withRawMongo } from "./helpers/fakeMongo";
import { fakePayload } from "./helpers/fakePayload";

/**
 * The CM market, hydrated from the rows the migration seeds, against the
 * literals it replaces. Every later call-site migration runs against this
 * file: a field that drifts here is named by its own assertion.
 */
async function cm() {
	const api = withRawMongo(fakePayload({ "market-cities": [] }));
	await seedMarkets(api);
	return { api, market: await getMarket(api, "CM") };
}

const AMOUNTS = [
	0, 1, 9, 10, 99, 100, 999, 1000, 1410, 9999, 10_000, 47_000, 123_456, 999_999,
	1_000_000, 1_234_567, 12_345_678, -1, -999, -1000, -47_000,
];

const formatOf = (market: Market, locale: "fr" | "en") => {
	const format = market.formats.find((f) => f.locale === locale);
	if (!format) throw new Error(`no ${locale} format`);
	return format;
};

describe("CM golden: money", () => {
	for (const locale of ["fr", "en"] as const) {
		it(`formatMoney(${locale}) is byte-identical to formatXaf`, async () => {
			const { market } = await cm();
			for (const amount of AMOUNTS) {
				const got = formatMoney(amount, formatOf(market, locale));
				const want = formatXaf(amount, locale);
				expect(
					[...got].map((c) => c.codePointAt(0)),
					`formats.${locale} at ${amount}`,
				).toEqual([...want].map((c) => c.codePointAt(0)));
			}
		});
	}

	it("holds the two format rows field by field", async () => {
		const { market } = await cm();
		expect(formatOf(market, "fr"), "formats.fr").toEqual({
			locale: "fr",
			symbol: "FCFA",
			position: "after",
			groupSeparator: " ",
			decimalSeparator: ",",
			minorUnit: 0,
		});
		expect(formatOf(market, "en"), "formats.en").toEqual({
			locale: "en",
			symbol: "XAF",
			position: "before",
			groupSeparator: ",",
			decimalSeparator: ".",
			minorUnit: 0,
		});
		expect(market.currency, "currency").toEqual({
			code: "XAF",
			minorUnit: 0,
			rounding: "half_up",
		});
	});
});

describe("CM golden: cities", () => {
	it("matches launchCities key, label, fee, district slug and label", async () => {
		const { api, market } = await cm();
		const cities = await getMarketCities(api, market);
		expect(
			cities.map((c) => c.key),
			"cities.keys",
		).toEqual([...LAUNCH_CITY_KEYS]);
		for (const city of cities) {
			const literal = LAUNCH_CITIES[city.key as keyof typeof LAUNCH_CITIES];
			expect(city.label, `cities.${city.key}.label`).toBe(literal.label);
			expect(city.defaultDeliveryFee, `cities.${city.key}.fee`).toBe(
				literal.defaultDeliveryFee,
			);
			expect(
				city.districts.map((d) => d.slug),
				`cities.${city.key}.districts`,
			).toEqual([...literal.districts]);
			for (const district of city.districts)
				expect(
					district.label,
					`cities.${city.key}.${district.slug}.label`,
				).toBe(districtLabel(`${city.key}.${district.slug}`));
		}
	});
});

describe("CM golden: phone", () => {
	const SAMPLES = [
		"+237650000001",
		"+237600000000",
		"+237699999999",
		"+2371650000001",
		"+23765000000",
		"+237550000001",
		"237650000001",
		"+33612345678",
		"",
		"+2376500000012",
	];

	it("accepts and refuses exactly what DELIVERY_PHONE_PATTERN does", async () => {
		const { market } = await cm();
		expect(market.phone.pattern, "phone.pattern").toBe(
			DELIVERY_PHONE_PATTERN.source,
		);
		const pattern = new RegExp(market.phone.pattern);
		for (const sample of SAMPLES)
			expect(pattern.test(sample), `phone ${sample}`).toBe(
				DELIVERY_PHONE_PATTERN.test(sample),
			);
		expect(market.phone.displayExample, "phone.displayExample").toBe(
			"+237 6XX XX XX XX",
		);
	});
});

describe("CM golden: calendar, tax and amounts", () => {
	it("cuts months where the sequences do, in the market's timezone", async () => {
		const { market } = await cm();
		expect(market.timezone, "timezone").toBe("Africa/Douala");
		for (const iso of [
			"2026-09-30T22:59:59.000Z",
			"2026-09-30T23:00:00.000Z",
			"2026-12-31T23:30:00.000Z",
			"2027-01-01T00:10:00.000Z",
		]) {
			const parts = new Intl.DateTimeFormat("en-GB", {
				timeZone: market.timezone,
				year: "2-digit",
				month: "2-digit",
			}).formatToParts(new Date(iso));
			const get = (t: string) => parts.find((p) => p.type === t)?.value;
			expect(`${get("year")}${get("month")}`, `timezone at ${iso}`).toBe(
				monthKeyFor(new Date(iso)),
			);
		}
	});

	it("charges the VAT rate orders charge today", async () => {
		const { api, market } = await cm();
		expect(market.vatRateBps, "vatRateBps").toBe(
			(await getOrderSettings(api)).vatRateBps,
		);
		expect(market.vatRateBps, "vatRateBps literal").toBe(1925);
	});

	it("carries the payment defaults and the launch provider row", async () => {
		const { market } = await cm();
		expect(market.amounts, "amounts").toEqual({
			minPayout: PAYMENT_DEFAULTS.minPayout,
			maxOrderAmount: PAYMENT_DEFAULTS.maxOrderAmount,
			exposureLevel2: PAYMENT_DEFAULTS.exposureCaps.level2,
			exposureLevel3: PAYMENT_DEFAULTS.exposureCaps.level3,
			buyerProtectionMin: PAYMENT_DEFAULTS.buyerProtection.min,
			buyerProtectionMax: PAYMENT_DEFAULTS.buyerProtection.max,
			defaultDeliveryFeeFallback: LAUNCH_CITIES.douala.defaultDeliveryFee,
		});
		const row = DEFAULT_MARKETS[0];
		expect(market.payments, "payments").toEqual({
			provider: row.provider,
			settlementMode: row.settlementMode,
			channels: row.channels,
			enabled: row.enabled,
		});
		expect(market.countryCode, "countryCode").toBe(row.countryCode);
		expect(market.currency.code, "currency.code").toBe(row.currency);
		expect(market.status, "status").toBe("live");
	});
});
