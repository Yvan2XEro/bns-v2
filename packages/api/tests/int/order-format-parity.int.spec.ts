// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatXaf as mobileFormatXaf } from "../../../mobile/src/lib/orderMoney";
import { formatXaf as webFormatXaf } from "../../../web/src/lib/order-money";
import { formatXaf } from "../../src/lib/orderFormat";

/**
 * `formatXaf` is hand-mirrored in both clients (Task 7) rather than imported,
 * same reason as `order-status-parity.int.spec.ts`. This file runs all three
 * implementations over a fixed table and asserts they agree string for
 * string — an amount that reads differently on the web and in the app is a
 * support ticket about a price, not a formatting nit.
 */
const AMOUNTS = [0, 1, 999, 1000, 47000, 150000, 2000000, -1200];
const LOCALES = ["fr", "en"] as const;

describe("formatXaf agrees across the API and both clients", () => {
	for (const amount of AMOUNTS) {
		for (const locale of LOCALES) {
			it(`formats ${amount} in ${locale} identically everywhere`, () => {
				const expected = formatXaf(amount, locale);
				expect(webFormatXaf(amount, locale)).toBe(expected);
				expect(mobileFormatXaf(amount, locale)).toBe(expected);
			});
		}
	}
});
