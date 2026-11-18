import { describe, expect, test } from "bun:test";
import { normalizeHandle, shopUrl, validateHandle } from "./shopHandle";

describe("normalizeHandle", () => {
	test("lowercases, strips accents and turns spaces into hyphens", () => {
		expect(normalizeHandle("  Akwa Tech Stôre ")).toBe("akwa-tech-store");
	});

	test("collapses repeated hyphens and trims them at both ends", () => {
		expect(normalizeHandle("--akwa__tech--")).toBe("akwa-tech");
	});

	test("drops characters outside a-z, 0-9 and hyphen", () => {
		expect(normalizeHandle("akwa@tech!")).toBe("akwatech");
	});

	test("caps the handle at 30 characters without a trailing hyphen", () => {
		const long = normalizeHandle("a".repeat(29) + " bcd");
		expect(long.length).toBeLessThanOrEqual(30);
		expect(long.endsWith("-")).toBe(false);
	});
});

describe("validateHandle", () => {
	test("accepts a normal handle", () => {
		expect(validateHandle("akwatech")).toEqual({ ok: true });
	});

	test("rejects handles shorter than 3 or longer than 30 characters", () => {
		expect(validateHandle("ab")).toEqual({ ok: false, reason: "invalid" });
		expect(validateHandle("a".repeat(31))).toEqual({
			ok: false,
			reason: "invalid",
		});
	});

	test("rejects uppercase, double hyphens and edge hyphens", () => {
		expect(validateHandle("Akwa")).toEqual({ ok: false, reason: "invalid" });
		expect(validateHandle("akwa--tech")).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(validateHandle("-akwa")).toEqual({ ok: false, reason: "invalid" });
	});

	test("rejects reserved words and web route segments", () => {
		for (const word of ["admin", "boutique", "search", "seller", "listing"]) {
			expect(validateHandle(word)).toEqual({ ok: false, reason: "reserved" });
		}
	});

	test("rejects the internal handle a released closed shop is renamed to", () => {
		expect(validateHandle(`x${"a1".repeat(12)}`)).toEqual({
			ok: false,
			reason: "reserved",
		});
	});
});

describe("shopUrl", () => {
	test("uses the configured web URL without a trailing slash", () => {
		expect(shopUrl("akwatech", "https://staging.buynsellem.com/")).toBe(
			"https://staging.buynsellem.com/s/akwatech",
		);
	});

	test("falls back to the production domain", () => {
		expect(shopUrl("akwatech", null)).toBe("https://buynsellem.com/s/akwatech");
	});
});
