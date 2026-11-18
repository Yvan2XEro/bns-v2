// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatMoney } from "../../src/contracts/money";
import { formatXaf } from "../../src/lib/orderFormat";
import { cmRow, served } from "./helpers/servedMarket";

/**
 * P10 (Task 23): the three hand-mirrored `formatXaf` copies this file used to
 * byte-compare are retired — both clients now wrap the contracts `formatMoney`
 * and `money-format-parity.int.spec.ts` holds all three consumers to the
 * served rows. What stays here is the one `formatXaf` that survives, the API's
 * own (SMS, receipts): over the CM row as the config route serves it, it must
 * still agree string for string with the contracts formatter — an amount that
 * reads differently in an SMS and in the app is a support ticket about a price.
 */
const AMOUNTS = [0, 1, 999, 1000, 47000, 150000, 2000000, -1200];

describe("formatXaf agrees with the contracts formatter over the served CM rows", () => {
	for (const format of served(cmRow()).formats) {
		for (const amount of AMOUNTS) {
			it(`formats ${amount} in ${format.locale} identically`, () => {
				expect(formatMoney(amount, format)).toBe(
					formatXaf(amount, format.locale),
				);
			});
		}
	}

	it("the served rows carry the currency's minorUnit", () => {
		expect(served(cmRow()).formats.map((f) => f.minorUnit)).toEqual([0, 0]);
	});
});
