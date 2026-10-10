// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatMoney } from "../../src/contracts/money";
import { formatXaf } from "../../src/lib/orderFormat";
import { CM_FORMATTING } from "../../src/migrations/p10Markets";

/**
 * The three hand-mirrored `formatXaf` copies this file used to byte-compare
 * are gone: Tasks 19 and 21 replaced both clients' copies with wrappers over
 * the contracts `formatMoney`, fed by the served market rows. Until Task 23
 * lands `money-format-parity.int.spec.ts` (the same table through the
 * contracts formatter AND both clients' wrappers), this interim half keeps
 * the API-side pin: the legacy `formatXaf` and the contracts formatter over
 * the seeded CM rows must agree string for string — an amount that reads
 * differently on the web and in the app is a support ticket about a price.
 */
const AMOUNTS = [0, 1, 999, 1000, 47000, 150000, 2000000, -1200];

describe("formatXaf agrees with the contracts formatter over the CM rows", () => {
	// The migration rows carry no minorUnit (XAF's lives on market.currency).
	for (const format of CM_FORMATTING.map((row) => ({ ...row, minorUnit: 0 }))) {
		for (const amount of AMOUNTS) {
			it(`formats ${amount} in ${format.locale} identically`, () => {
				expect(formatMoney(amount, format)).toBe(
					formatXaf(amount, format.locale),
				);
			});
		}
	}
});
