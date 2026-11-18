import { describe, expect, test } from "bun:test";
import type { MyShop, MyShopResponse } from "~/types";
import { showSellerHat } from "./seller-hat";
import { shopEntryFor } from "./shop-entry";

function mine(status: MyShop["status"] | null): MyShopResponse {
	// Only the fields shopEntryFor reads matter here.
	const shop = status ? ({ status } as MyShop) : null;
	return { shop, role: shop ? "owner" : null, roleReason: null, counts: null };
}

describe("showSellerHat", () => {
	test("no shop: absent, even when shop creation is on", () => {
		expect(showSellerHat(true, shopEntryFor(mine(null), true))).toBe(false);
	});

	test("signed out: absent", () => {
		expect(showSellerHat(false, shopEntryFor(mine("active"), true))).toBe(
			false,
		);
	});

	test("lookup failed: absent", () => {
		expect(showSellerHat(true, shopEntryFor(undefined, true, true))).toBe(
			false,
		);
	});

	test.each([
		"active",
		"suspended",
	] as const)("a %s shop: present", (status) => {
		expect(showSellerHat(true, shopEntryFor(mine(status), false))).toBe(true);
	});

	test("closed shop leads to open-a-shop, not the workspace: absent", () => {
		expect(showSellerHat(true, shopEntryFor(mine("closed"), true))).toBe(false);
	});
});
