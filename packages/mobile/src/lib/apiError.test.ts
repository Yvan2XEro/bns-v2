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

	test("ignores a data code it does not know", () => {
		expect(
			normalizeApiError(409, {
				errors: [{ message: "Nope", data: { code: "made.up" } }],
			}).code,
		).toBe("generic.validation");
	});

	test("still reads our own route contract first", () => {
		expect(
			normalizeApiError(429, {
				code: "generic.rateLimited",
				message: "Too many attempts. Please wait a moment.",
			}).code,
		).toBe("generic.rateLimited");
	});
});
