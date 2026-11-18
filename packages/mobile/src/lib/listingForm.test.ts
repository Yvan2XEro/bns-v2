import { describe, expect, test } from "bun:test";
import { groupPriceDigits, sanitizePriceInput } from "./listingForm";

describe("price input", () => {
	test("keeps digits only", () => {
		expect(sanitizePriceInput("1 500 000 FCFA")).toBe("1500000");
	});

	test("groups thousands while typing", () => {
		expect(groupPriceDigits("1500000")).toBe("1 500 000");
		expect(groupPriceDigits("950")).toBe("950");
		expect(groupPriceDigits("")).toBe("");
	});
});
