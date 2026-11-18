import { describe, expect, test } from "bun:test";
import { cmMarket, NARROW_NBSP } from "../test/market-fixture";
import { formatOrderDate, renderOrderMoney } from "./order-money";

describe("renderOrderMoney over the served market", () => {
	const market = cmMarket();

	test("French golden: narrow no-break space groups, plain space joins the symbol", () => {
		const out = renderOrderMoney(market, 47000, "fr");
		expect(out).toBe(`47${NARROW_NBSP}000 FCFA`);
		expect([...out].map((c) => c.codePointAt(0))).toContain(0x202f);
		expect(out.indexOf(" ")).toBe(6);
	});

	test("English golden", () => {
		expect(renderOrderMoney(market, 47000, "en")).toBe("XAF 47,000");
	});

	test("zero and negative", () => {
		expect(renderOrderMoney(market, 0, "fr")).toBe("0 FCFA");
		expect(renderOrderMoney(market, -1200, "fr")).toBe(
			`-1${NARROW_NBSP}200 FCFA`,
		);
	});

	test("M9: a locale with no served row renders the explicit fallback", () => {
		const noRows = cmMarket({ formats: [] });
		expect(renderOrderMoney(noRows, 1410, "fr")).toBe("XAF 1 410");
		const onlyEn = cmMarket({ formats: [cmMarket().formats[1]] });
		expect(renderOrderMoney(onlyEn, 1410, "fr")).toBe("XAF 1 410");
	});

	test("M9: no market block at all is a bare amount, never a currency guess", () => {
		expect(renderOrderMoney(undefined, 1410, "fr")).toMatch(/^1\D410$/);
	});

	test("the symbol follows the served row, not the locale", () => {
		const other = cmMarket({
			formats: [
				{
					locale: "fr",
					symbol: "ZZZ",
					position: "before",
					groupSeparator: ".",
					decimalSeparator: ",",
					minorUnit: 0,
				},
			],
		});
		expect(renderOrderMoney(other, 5000, "fr")).toBe("ZZZ 5.000");
	});

	test("non-finite amounts render a dash", () => {
		expect(renderOrderMoney(market, null, "fr")).toBe("—");
	});
});

describe("formatOrderDate", () => {
	test("renders a readable date containing the year", () => {
		const rendered = formatOrderDate("2026-10-03T12:00:00.000Z", "en");
		expect(rendered).toContain("2026");
	});
});
