import { describe, expect, test } from "bun:test";
import { telLink, whatsappLink } from "./shopContact";

describe("whatsappLink", () => {
	test("strips spaces and punctuation into a wa.me link", () => {
		expect(whatsappLink("+237 6 90 12 34 56")).toBe(
			"https://wa.me/237690123456",
		);
	});

	test("keeps only digits", () => {
		expect(whatsappLink("(237) 690-123-456")).toBe(
			"https://wa.me/237690123456",
		);
	});

	test("returns null for an empty, null or undefined number", () => {
		expect(whatsappLink("")).toBeNull();
		expect(whatsappLink(null)).toBeNull();
		expect(whatsappLink(undefined)).toBeNull();
	});

	test("returns null when nothing but punctuation is left", () => {
		expect(whatsappLink("+--()")).toBeNull();
	});
});

describe("telLink", () => {
	test("strips whitespace into a tel: link", () => {
		expect(telLink("+237 690 12 34 56")).toBe("tel:+237690123456");
	});

	test("keeps the leading + and digits, dropping only whitespace", () => {
		expect(telLink("237 690 123 456")).toBe("tel:237690123456");
	});

	test("returns null for an empty, null or undefined number", () => {
		expect(telLink("")).toBeNull();
		expect(telLink(null)).toBeNull();
		expect(telLink(undefined)).toBeNull();
	});

	test("returns null for a whitespace-only number", () => {
		expect(telLink("   ")).toBeNull();
	});
});
