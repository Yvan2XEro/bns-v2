import { describe, expect, test } from "bun:test";
import { apiErrorFrom, normalizeApiError } from "./apiError";

// The API attaches structured details beside the code — `cart.singleShop`
// names the conflicting shop, `order.handoverLocked` carries the lock state —
// and this layer used to drop them, so every dialog that needed them fell
// back to its generic wording.
describe("the details ride along, from the trusted envelope only", () => {
	test("our own envelope's details reach the ApiError", () => {
		const error = apiErrorFrom(409, {
			code: "cart.singleShop",
			message: "Your cart holds items from another shop.",
			details: { currentShop: { id: "s-1", name: "Akwa Tech" } },
		});
		expect(error.code).toBe("cart.singleShop");
		expect(error.details).toEqual({
			currentShop: { id: "s-1", name: "Akwa Tech" },
		});
	});

	test("a Payload-shaped error never carries details, whatever it claims", () => {
		const normalized = normalizeApiError(400, {
			errors: [{ message: "The following field is invalid: email" }],
			details: { currentShop: { id: "s-x", name: "Forged" } },
		});
		expect(normalized.details).toBeNull();
	});

	test("a malformed details value becomes null rather than a surprise", () => {
		for (const details of ["text", 4, ["a"], null]) {
			const normalized = normalizeApiError(409, {
				code: "cart.singleShop",
				details,
			});
			expect(normalized.details).toBeNull();
		}
	});
});
