import { describe, expect, test } from "bun:test";
import {
	protectionBadgeCopy,
	showsProtectionBadge,
} from "./payment-disclosure";

describe("showsProtectionBadge", () => {
	test("an identity-level shop with the flag on shows the badge", () => {
		expect(showsProtectionBadge(true, "identity")).toBe(true);
	});

	test("a business-level shop with the flag on shows the badge", () => {
		expect(showsProtectionBadge(true, "business")).toBe(true);
	});

	// The mutation this guards against: dropping the badge check entirely
	// (always `protectedPaymentEnabled`) would show the badge on a phone-only
	// shop too, and this case alone would catch it.
	test("a phone-level (ineligible) shop never shows the badge, even with the flag on", () => {
		expect(showsProtectionBadge(true, "phone")).toBe(false);
	});

	test("a shop with no badge at all never shows it", () => {
		expect(showsProtectionBadge(true, null)).toBe(false);
	});

	test("an eligible shop shows nothing while the flag is off", () => {
		expect(showsProtectionBadge(false, "identity")).toBe(false);
	});
});

describe("protectionBadgeCopy", () => {
	test("the launch defaults format to the spec's own numbers", () => {
		expect(protectionBadgeCopy({ bps: 300, min: 100 }, "fr")).toEqual({
			rate: "3",
			min: "100",
		});
	});

	test("a fractional rate keeps its decimal", () => {
		expect(protectionBadgeCopy({ bps: 250, min: 500 }, "en")).toEqual({
			rate: "2.5",
			min: "500",
		});
	});
});
