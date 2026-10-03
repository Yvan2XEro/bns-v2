import { describe, expect, test } from "bun:test";
import {
	cooldownUntilOf,
	notMeAccountId,
	payoutAccountSchema,
} from "./payout-account-form";

describe("cooldownUntilOf", () => {
	test("reads details.until off an ApiError-shaped object", () => {
		const error = {
			code: "payout.accountChangeCooldown",
			details: { until: "2026-10-10T00:00:00.000Z" },
		};
		expect(cooldownUntilOf(error)).toBe("2026-10-10T00:00:00.000Z");
	});

	test("returns null when details is absent, not a string 'null'", () => {
		expect(cooldownUntilOf({ code: "payout.holdActive" })).toBeNull();
		expect(cooldownUntilOf(null)).toBeNull();
		expect(cooldownUntilOf("a string error")).toBeNull();
	});

	test("returns null when until is not a string", () => {
		expect(cooldownUntilOf({ details: { until: 12345 } })).toBeNull();
	});
});

describe("payoutAccountSchema", () => {
	test("accepts a well-formed mobile-money submission", () => {
		const result = payoutAccountSchema.safeParse({
			method: "mtn_momo",
			accountName: "Jean Dupont",
			accountNumber: "+237671234567",
		});
		expect(result.success).toBe(true);
	});

	test("refuses a method the server does not accept", () => {
		const result = payoutAccountSchema.safeParse({
			method: "paypal",
			accountName: "Jean Dupont",
			accountNumber: "+237671234567",
		});
		expect(result.success).toBe(false);
	});

	test("refuses a one-character account name", () => {
		const result = payoutAccountSchema.safeParse({
			method: "bank",
			accountName: "J",
			accountNumber: "1234567890",
		});
		expect(result.success).toBe(false);
	});
});

describe("notMeAccountId", () => {
	test("names the account when shop matches the page actually being viewed", () => {
		expect(notMeAccountId("shop_1", { shop: "shop_1", notMe: "acct_9" })).toBe(
			"acct_9",
		);
	});

	test("refuses a link copy-pasted for another shop", () => {
		expect(
			notMeAccountId("shop_1", { shop: "shop_2", notMe: "acct_9" }),
		).toBeNull();
	});

	test("is null with either param missing, not just a falsy string", () => {
		expect(
			notMeAccountId("shop_1", { shop: null, notMe: "acct_9" }),
		).toBeNull();
		expect(
			notMeAccountId("shop_1", { shop: "shop_1", notMe: null }),
		).toBeNull();
		expect(notMeAccountId("shop_1", { shop: null, notMe: null })).toBeNull();
	});
});
