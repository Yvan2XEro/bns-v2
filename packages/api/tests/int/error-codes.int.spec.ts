// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	ERROR_CODES,
	errorResponse,
	fallbackMessage,
} from "../../src/lib/errors";

const P0_CODES = {
	paymentProviderUnavailable: "payment.providerUnavailable",
	paymentAmountMismatch: "payment.amountMismatch",
	boostNotOwner: "boost.notOwner",
	boostListingNotPublished: "boost.listingNotPublished",
	boostInvalidDuration: "boost.invalidDuration",
	reviewSelf: "review.self",
	reviewDuplicate: "review.duplicate",
	reviewNoInteraction: "review.noInteraction",
	contactPhoneUnavailable: "contact.phoneUnavailable",
} as const;

describe("P0 error codes", () => {
	it.each(Object.entries(P0_CODES))("defines %s as %s", (key, code) => {
		expect(ERROR_CODES[key as keyof typeof ERROR_CODES]).toBe(code);
	});

	it.each(Object.values(P0_CODES))("gives %s its own fallback", (code) => {
		expect(fallbackMessage(code)).not.toBe(
			fallbackMessage(ERROR_CODES.unknown),
		);
	});

	it("builds the shared response shape", async () => {
		const response = errorResponse(ERROR_CODES.boostNotOwner, 403);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			code: "boost.notOwner",
			message: "You can only boost your own listings.",
		});
	});
});
