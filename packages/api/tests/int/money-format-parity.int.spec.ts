// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { formatPrice, setMarket } from "../../../mobile/src/lib/market";
import { renderOrderMoney } from "../../../web/src/lib/order-money";
import { formatMoney, formatMoneyFallback } from "../../src/contracts/money";
import { CM_FORMATTING } from "../../src/seed/seedMarkets";
import {
	cmRow,
	decimalRow,
	served,
	servedConfig,
} from "./helpers/servedMarket";

/**
 * P10: price text is one contracts formatter fed by the served market rows,
 * and each client is a thin wrapper that picks the row for its locale. This
 * runs the same table through the formatter and both wrappers and compares
 * every cell byte for byte, plus the literal the CM market has always shown
 * (U+202F groups, plain space before FCFA) so the formatter cannot drift in
 * step with its callers. It supersedes the three hand-mirrored `formatXaf`
 * copies the old order-format-parity compared.
 */
const NNBSP = " ";

const AMOUNTS = [0, 1, 999, 1000, 47000, 150000, 1234567, 2000000, -1200];

const webText = (row: ReturnType<typeof cmRow>, amount: number, l: string) =>
	renderOrderMoney(served(row), amount, l);

const mobileText = (
	row: ReturnType<typeof cmRow>,
	amount: number,
	l: string,
) => {
	setMarket(servedConfig(row));
	return formatPrice(amount, l);
};

function contractsText(
	row: ReturnType<typeof cmRow>,
	amount: number,
	locale: "fr" | "en",
): string {
	const market = served(row);
	const format = market.formats.find((f) => f.locale === locale);
	return format
		? formatMoney(amount, format)
		: formatMoneyFallback(
				amount,
				market.currency.code,
				market.currency.minorUnit,
			);
}

afterEach(() => setMarket(undefined));

describe("the CM market: contracts, web and mobile agree cell for cell", () => {
	for (const locale of ["fr", "en"] as const) {
		for (const amount of AMOUNTS) {
			it(`${amount} in ${locale}`, () => {
				const expected = contractsText(cmRow(), amount, locale);
				expect(webText(cmRow(), amount, locale)).toBe(expected);
				expect(mobileText(cmRow(), amount, locale)).toBe(expected);
			});
		}
	}

	it("the golden strings", () => {
		const golden: Array<[string, number, string]> = [
			["fr", 47000, `47${NNBSP}000 FCFA`],
			["fr", 2000000, `2${NNBSP}000${NNBSP}000 FCFA`],
			["fr", -1200, `-1${NNBSP}200 FCFA`],
			["fr", 0, "0 FCFA"],
			["en", 47000, "XAF 47,000"],
			["en", -1200, "-XAF 1,200"],
		];
		for (const [locale, amount, text] of golden) {
			expect(contractsText(cmRow(), amount, locale as "fr")).toBe(text);
			expect(webText(cmRow(), amount, locale)).toBe(text);
			expect(mobileText(cmRow(), amount, locale)).toBe(text);
		}
		// U+202F inside the digits, U+0020 before the symbol: the byte that
		// distinguishes "FCFA as it has always read" from a lookalike.
		const out = contractsText(cmRow(), 47000, "fr");
		expect(out.codePointAt(2)).toBe(0x202f);
		expect(out.codePointAt(6)).toBe(0x20);
	});
});

describe("M9: a locale with no served row falls back to the explicit code-first form", () => {
	const noFormats = () => cmRow({ formatting: [] });
	const onlyEn = () => cmRow({ formatting: CM_FORMATTING.slice(1) });

	for (const [name, row] of [
		["no rows at all", noFormats],
		["no row for fr", onlyEn],
	] as const) {
		for (const amount of [0, 1410, 1234567, -1410]) {
			it(`${name}: ${amount}`, () => {
				const expected = contractsText(row(), amount, "fr");
				expect(webText(row(), amount, "fr")).toBe(expected);
				expect(mobileText(row(), amount, "fr")).toBe(expected);
			});
		}
	}

	it("is never a silent FCFA", () => {
		expect(contractsText(noFormats(), 1410, "fr")).toBe("XAF 1 410");
		expect(mobileText(noFormats(), 1410, "fr")).toBe("XAF 1 410");
		expect(webText(noFormats(), 1410, "fr")).toBe("XAF 1 410");
	});
});

describe("a synthetic two-decimal market", () => {
	const AMOUNTS_MINOR = [0, 5, 99, 100, 1050, 123456, 100000000, -2599];
	for (const locale of ["fr", "en"] as const) {
		for (const amount of AMOUNTS_MINOR) {
			it(`${amount} in ${locale}`, () => {
				const expected = contractsText(decimalRow(), amount, locale);
				expect(webText(decimalRow(), amount, locale)).toBe(expected);
				expect(mobileText(decimalRow(), amount, locale)).toBe(expected);
			});
		}
	}

	it("the golden strings", () => {
		expect(contractsText(decimalRow(), 123456, "en")).toBe("£ 1,234.56");
		expect(contractsText(decimalRow(), 123456, "fr")).toBe(`£ 1${NNBSP}234,56`);
		expect(contractsText(decimalRow(), 5, "en")).toBe("£ 0.05");
		expect(contractsText(decimalRow(), -2599, "en")).toBe("-£ 25.99");
	});
});

describe("the table is data, not a literal", () => {
	it("a mutated served row changes all three consumers together", () => {
		const mutated = cmRow({
			formatting: [
				{
					locale: "fr",
					symbol: "ZZZ",
					position: "before",
					groupSeparator: ".",
					decimalSeparator: ",",
				},
			],
		});
		expect(contractsText(mutated, 47000, "fr")).toBe("ZZZ 47.000");
		expect(webText(mutated, 47000, "fr")).toBe("ZZZ 47.000");
		expect(mobileText(mutated, 47000, "fr")).toBe("ZZZ 47.000");
	});
});
