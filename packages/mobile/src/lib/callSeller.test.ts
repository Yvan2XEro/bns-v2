import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import { ERROR_CODES } from "./apiError";
import { phoneDialUrl, sellerHasNoPhone } from "./callSeller";

describe("phoneDialUrl", () => {
	test("keeps the leading plus and the digits only", () => {
		expect(phoneDialUrl("+237 6 99-12 34 56")).toBe("tel:+237699123456");
	});
});

describe("sellerHasNoPhone", () => {
	test("only the unavailable-phone refusal hides the button", () => {
		expect(
			sellerHasNoPhone({
				status: 404,
				code: ERROR_CODES.contactPhoneUnavailable,
			}),
		).toBe(true);
		expect(
			sellerHasNoPhone({ status: 429, code: ERROR_CODES.rateLimited }),
		).toBe(false);
	});

	test("the button label exists in both locales", () => {
		expect(fr.listing.call).toBe("Appeler");
		expect(typeof en.listing.call).toBe("string");
	});
});
