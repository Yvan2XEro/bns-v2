import { describe, expect, test } from "bun:test";
import { normalizeApiError } from "./apiError";

describe("normalizeApiError", () => {
	test("reads the code a Payload APIError carries in data", () => {
		expect(
			normalizeApiError(409, {
				errors: [
					{
						name: "APIError",
						message: "You have already reviewed this user.",
						data: { code: "review.duplicate" },
					},
				],
			}),
		).toEqual({
			code: "review.duplicate",
			message: "You have already reviewed this user.",
		});
	});

	test("keeps the code a Payload hook error carries in errors[0].data.code", () => {
		expect(
			normalizeApiError(403, {
				errors: [
					{
						message: "You are not a member of this shop.",
						data: { code: "shop.notMember" },
					},
				],
			}),
		).toEqual({
			code: "shop.notMember",
			message: "You are not a member of this shop.",
		});
	});

	// A hook code is trusted whether or not this client already knows it —
	// new codes ship on the API before the matching client release, and the
	// hook's own message is always safe to show (see the comment in
	// normalizeApiError). Superseded the older "ignores a data code it does
	// not know" behaviour, which forced every future error code to be added
	// here before it could reach the user.
	test("trusts a hook code even when this client has no translation for it yet", () => {
		expect(
			normalizeApiError(409, {
				errors: [{ message: "Nope", data: { code: "made.up" } }],
			}),
		).toEqual({ code: "made.up", message: "Nope" });
	});

	test("still reads our own route contract first", () => {
		expect(
			normalizeApiError(429, {
				code: "generic.rateLimited",
				message: "Too many attempts. Please wait a moment.",
			}).code,
		).toBe("generic.rateLimited");
	});

	test("still derives a code from a route error body", () => {
		expect(
			normalizeApiError(409, { code: "stock.negative", message: "x" }).code,
		).toBe("stock.negative");
	});
});
