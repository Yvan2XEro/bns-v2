import { describe, expect, test } from "bun:test";
import {
	firstListingIssueStep,
	issueLabelKey,
	issueRuleKey,
	issuesOnStep,
	responseIssues,
	webListingIssues,
} from "./listing-issues";

const preset = {
	price: { enabled: true, required: true },
	photos: { enabled: true, required: true },
};
const body = {
	title: "iPhone 13",
	description: "Très bon état",
	location: "Douala",
	category: "cat-1",
	price: 250000,
	images: [{}],
};

describe("webListingIssues", () => {
	test("a complete listing has nothing to refuse", () => {
		expect(webListingIssues(body, { preset, attributes: [] })).toEqual([]);
	});

	test("a required attribute sent blank is refused on its own path", () => {
		const issues = webListingIssues(body, {
			preset,
			attributes: [
				{ slug: "brand", name: "Marque", type: "text", required: true },
			],
		});
		expect(issues).toEqual([{ path: "attributes.brand", rule: "required" }]);
	});

	test("the wizard is sent back to the first step that holds a problem", () => {
		const issues = webListingIssues(
			{ ...body, price: undefined, images: [] },
			{ preset, attributes: [] },
		);
		const steps = ["describe", "details", "photos", "review"] as const;
		expect(firstListingIssueStep(issues, steps)).toBe("details");
		expect(issuesOnStep(issues, "photos")).toEqual([
			{ path: "images", rule: "required" },
		]);
	});
});

describe("responseIssues", () => {
	test("reads a Payload ValidationError off a refused response", async () => {
		const res = new Response(
			JSON.stringify({
				errors: [
					{
						data: { errors: [{ path: "price", message: "Price is required" }] },
					},
				],
			}),
			{ status: 400 },
		);
		expect(await responseIssues(res)).toEqual([
			{ path: "price", rule: "invalid" },
		]);
	});

	test("an unreadable body yields no field issue", async () => {
		expect(await responseIssues(new Response("oops", { status: 500 }))).toEqual(
			[],
		);
	});
});

describe("issue wording keys", () => {
	test("known fields and rules have their own keys", () => {
		expect(issueLabelKey("price")).toBe("fieldPrice");
		expect(issueLabelKey("attributes.brand")).toBeNull();
		expect(issueRuleKey("required")).toBe("rule_required");
		expect(issueRuleKey("anything-else")).toBe("rule_invalid");
	});
});
