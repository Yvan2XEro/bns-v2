import { describe, expect, test } from "bun:test";
import { catalogueParamsFor, isCatalogueFilter, skuSummary } from "./catalogue";

describe("catalogueParamsFor", () => {
	test("maps status, stock and resale tabs to their own params", () => {
		expect(catalogueParamsFor("draft")).toEqual({
			status: "draft",
			provenance: "any",
		});
		expect(catalogueParamsFor("low", "own")).toEqual({
			stock: "low",
			provenance: "own",
		});
		expect(catalogueParamsFor("all", "own")).toEqual({ provenance: "own" });
	});

	test("the resale tab overrides the provenance picker", () => {
		expect(catalogueParamsFor("resale", "own")).toEqual({
			provenance: "resale",
		});
	});

	test("accepts only known tabs", () => {
		expect(isCatalogueFilter("resale")).toBe(true);
		expect(isCatalogueFilter("hidden")).toBe(false);
	});
});

describe("skuSummary", () => {
	test("one SKU, a shared stem, or the first plus a count", () => {
		expect(skuSummary([])).toBeNull();
		expect(skuSummary(["AT-APP2"])).toBe("AT-APP2");
		expect(skuSummary(["AT-IP13P-GR256", "AT-IP13P-OR256"])).toBe("AT-IP13P");
		expect(skuSummary(["X1", "Y2", "Z3"])).toBe("X1 +2");
	});
});
