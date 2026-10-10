import { afterEach, describe, expect, test } from "bun:test";
import {
	formatPrice,
	formatPriceRange,
	isMarketPhone,
	phoneExample,
	setMarket,
} from "./market";
import { marketFixture as market, NNBSP } from "./market.fixture.test";

afterEach(() => setMarket(undefined));

describe("formatPrice", () => {
	test("renders the served format per locale", () => {
		setMarket(market());
		const fr = formatPrice(47000, "fr");
		expect(fr).toBe("47\u202f000 FCFA");
		expect(fr.codePointAt(2)).toBe(0x202f);
		expect(fr.codePointAt(6)).toBe(0x20);
		expect(formatPrice(47000, "en-US")).toBe("XAF 47,000");
		expect(formatPrice(-1200, "fr")).toBe(`-1${NNBSP}200 FCFA`);
	});
	test("a market with other formats renders those, not XAF", () => {
		setMarket(
			market({
				currency: { code: "GHS", minorUnit: 2 },
				formats: [
					{
						locale: "en",
						symbol: "GH₵",
						position: "before",
						groupSeparator: ",",
						decimalSeparator: ".",
						minorUnit: 2,
					},
				],
			}),
		);
		expect(formatPrice(123456, "en")).toBe("GH₵ 1,234.56");
	});
	test("M9: no market block renders the explicit fallback", () => {
		expect(formatPrice(1410, "fr")).toBe("XAF 1 410");
	});
	test("M9: no format for the locale falls back with the served currency", () => {
		setMarket(market({ formats: [], currency: { code: "GHS", minorUnit: 2 } }));
		expect(formatPrice(150, "en")).toBe("GHS 1.50");
	});
	test("late-arriving config switches fallback to the market format", () => {
		expect(formatPrice(1410, "fr")).toBe("XAF 1 410");
		setMarket(market());
		expect(formatPrice(1410, "fr")).toBe("1\u202f410 FCFA");
	});
	test("range collapses when min equals max", () => {
		setMarket(market());
		expect(formatPriceRange(1000, 1000, "en")).toBe("XAF 1,000");
		expect(formatPriceRange(1000, 2000, "en")).toBe("XAF 1,000 – XAF 2,000");
	});
});

describe("phone", () => {
	test("validates against the served pattern", () => {
		setMarket(market());
		expect(isMarketPhone("+237677000000")).toBe(true);
		expect(isMarketPhone("+237222123456")).toBe(false);
		expect(isMarketPhone("+33612345678")).toBe(false);
		expect(phoneExample()).toBe("+237 6XX XX XX XX");
	});
	test("another market's pattern wins", () => {
		setMarket(
			market({
				phone: {
					pattern: "^\\+233\\d{9}$",
					displayExample: "+233 24 123 4567",
				},
			}),
		);
		expect(isMarketPhone("+233241234567")).toBe(true);
		expect(isMarketPhone("+237677000000")).toBe(false);
	});
	test("no market: permissive E.164 and a generic example", () => {
		expect(isMarketPhone("+233241234567")).toBe(true);
		expect(isMarketPhone("0677000000")).toBe(false);
		expect(phoneExample()).toBe("+CCXXXXXXXX");
	});
	test("an invalid served pattern degrades to the fallback", () => {
		setMarket(market({ phone: { pattern: "(", displayExample: "x" } }));
		expect(isMarketPhone("+233241234567")).toBe(true);
	});
});
