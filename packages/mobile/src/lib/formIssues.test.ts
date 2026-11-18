import { describe, expect, test } from "bun:test";
import { issueMessage, serverFieldIssues } from "./formIssues";

describe("serverFieldIssues", () => {
	test("reads the product service's details.issues", () => {
		const error = {
			code: "generic.validation",
			data: {
				code: "generic.validation",
				details: { issues: [{ path: "variants.1.sku", rule: "taken" }] },
			},
		};
		expect(serverFieldIssues(error)).toEqual([
			{ path: "variants.1.sku", rule: "taken" },
		]);
	});

	test("reads a Payload ValidationError's paths", () => {
		const error = {
			code: "generic.badRequest",
			data: {
				errors: [
					{
						name: "ValidationError",
						message: "The following field is invalid: price",
						data: {
							collection: "listings",
							errors: [{ path: "price", message: "Price is required" }],
						},
					},
				],
			},
		};
		expect(serverFieldIssues(error)).toEqual([
			{ path: "price", rule: "invalid" },
		]);
	});

	test("pins an unknown category to the category field", () => {
		expect(
			serverFieldIssues({ code: "listing.categoryNotFound", data: {} }),
		).toEqual([{ path: "category", rule: "notFound" }]);
	});

	test("yields nothing for a refusal that is not about a field", () => {
		expect(serverFieldIssues({ code: "shop.inactive", data: {} })).toEqual([]);
		expect(serverFieldIssues(new Error("offline"))).toEqual([]);
	});
});

describe("issueMessage", () => {
	const t = (key: string, params?: Record<string, unknown>) =>
		params ? `${key}:${JSON.stringify(params)}` : `[${key}]`;

	test("words a rule for the field it is on", () => {
		expect(
			issueMessage(t, {
				path: "variants",
				rule: "count",
				params: { min: 1, max: 100 },
			}),
		).toBe('formIssues.variantsCount:{"min":1,"max":100}');
		expect(issueMessage(t, { path: "options.0.values", rule: "count" })).toBe(
			"[formIssues.valuesCount]",
		);
		expect(
			issueMessage(t, { path: "variants.2.price", rule: "required" }),
		).toBe("[formIssues.required]");
	});

	test("falls back to a generic sentence for a rule without one", () => {
		const identity = (key: string) => key;
		expect(issueMessage(identity, { path: "x", rule: "unheard-of" })).toBe(
			"formIssues.invalid",
		);
	});
});
