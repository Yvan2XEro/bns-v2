import { describe, expect, test } from "bun:test";
import { listingConditionValue } from "./listing-condition";

describe("listingConditionValue", () => {
	test("reads the condition attribute", () => {
		expect(listingConditionValue({ condition: "like_new", brand: "x" })).toBe(
			"like_new",
		);
	});

	test("is null without one", () => {
		expect(listingConditionValue({ brand: "x" })).toBeNull();
		expect(listingConditionValue({ condition: "" })).toBeNull();
		expect(listingConditionValue(null)).toBeNull();
		expect(listingConditionValue(["condition"])).toBeNull();
	});
});
