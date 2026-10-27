import { describe, expect, test } from "bun:test";
import {
	errorPaths,
	issuesPerTab,
	productTabHref,
	productTabOf,
	tabForIssues,
	tabOfIssue,
} from "./product-tabs";

describe("product tabs", () => {
	test("each tab is a path under the product", () => {
		expect(productTabOf(null)).toBe("details");
		expect(productTabOf("variants")).toBe("variants");
		expect(productTabOf("stock")).toBe("stock");
		expect(productTabOf("elsewhere")).toBe("details");
		expect(productTabHref("p1", "details")).toBe("/seller/catalogue/p1");
		expect(productTabHref("p1", "stock")).toBe("/seller/catalogue/p1/stock");
	});

	test("an issue belongs to the tab its field shows on", () => {
		expect(tabOfIssue("variants.2.price")).toBe("variants");
		expect(tabOfIssue("options.0.name")).toBe("variants");
		expect(tabOfIssue("title")).toBe("details");
		expect(tabOfIssue("newImages")).toBe("details");
		expect(
			issuesPerTab(["title", "variants.0.price", "variants.1.sku"]),
		).toEqual({
			details: 1,
			variants: 2,
		});
	});

	test("a refused save stays on the tab when it holds an issue, else goes to the first that does", () => {
		expect(tabForIssues("variants", ["title", "variants.0.price"])).toBe(
			"variants",
		);
		expect(tabForIssues("variants", ["title"])).toBe("details");
		expect(tabForIssues("stock", ["variants.0.price"])).toBe("variants");
		expect(tabForIssues("details", [])).toBe("details");
	});
});

describe("errorPaths", () => {
	test("lists the fields react-hook-form holds an error on", () => {
		const variants: unknown[] = [];
		variants[1] = { price: { type: "custom", message: "x", ref: {} } };
		expect(
			errorPaths({
				root: { message: "fix" },
				title: { type: "custom", message: "x" },
				variants,
			}),
		).toEqual(["title", "variants.1.price"]);
	});
});
