import { describe, expect, test } from "bun:test";
import {
	type BuyBoxInput,
	decideBuyBox,
	isOwnShop,
	singleShopConflict,
} from "./buyBox";

function input(patch: Partial<BuyBoxInput> = {}): BuyBoxInput {
	return {
		ordersEnabled: true,
		orderable: true,
		shop: { id: "s-1", restricted: false },
		ownShop: false,
		productAvailable: true,
		signedIn: true,
		...patch,
	};
}

/** Web's table, case for case: each reason flipped alone from a listing that would otherwise be bought. */
describe("decideBuyBox — the nine cases", () => {
	test("offers the buy box to a signed-in buyer when every condition holds", () => {
		expect(decideBuyBox(input())).toEqual({ kind: "buy", signedIn: true });
	});

	test("offers it to a signed-out visitor too, who is sent to sign in on add", () => {
		expect(decideBuyBox(input({ signedIn: false }))).toEqual({
			kind: "buy",
			signedIn: false,
		});
	});

	test("hides it when ordering is off, even for an orderable listing", () => {
		expect(decideBuyBox(input({ ordersEnabled: false }))).toEqual({
			kind: "hidden",
			reason: "ordersDisabled",
		});
	});

	test("hides it for a classified ad with no shop", () => {
		expect(decideBuyBox(input({ shop: null }))).toEqual({
			kind: "hidden",
			reason: "noShop",
		});
	});

	test("hides it from a member of the listing's own shop", () => {
		expect(decideBuyBox(input({ ownShop: true }))).toEqual({
			kind: "hidden",
			reason: "ownShop",
		});
	});

	test("says orders are paused when the shop is restricted", () => {
		expect(
			decideBuyBox(
				input({ orderable: false, shop: { id: "s-1", restricted: true } }),
			),
		).toEqual({ kind: "restricted" });
	});

	test("hides it when the listing is not orderable", () => {
		expect(decideBuyBox(input({ orderable: false }))).toEqual({
			kind: "hidden",
			reason: "notOrderable",
		});
	});

	test("hides it when the read carries no orderable field", () => {
		expect(decideBuyBox(input({ orderable: undefined }))).toEqual({
			kind: "hidden",
			reason: "notOrderable",
		});
	});

	test("hides it when orderable is null", () => {
		expect(decideBuyBox(input({ orderable: null }))).toEqual({
			kind: "hidden",
			reason: "notOrderable",
		});
	});

	test("hides it when the product has no available variant", () => {
		expect(decideBuyBox(input({ productAvailable: false }))).toEqual({
			kind: "hidden",
			reason: "soldOut",
		});
	});
});

describe("isOwnShop", () => {
	const base = {
		viewerId: "u-1",
		sellerId: "u-2",
		shopId: "s-1",
		memberOf: ["s-9"],
	};

	test("a stranger is not the shop", () => {
		expect(isOwnShop(base)).toBe(false);
	});

	test("the listing's author is", () => {
		expect(isOwnShop({ ...base, sellerId: "u-1" })).toBe(true);
	});

	test("so is a member of the shop, whichever shop is active", () => {
		expect(isOwnShop({ ...base, memberOf: ["s-9", "s-1"] })).toBe(true);
	});

	test("a signed-out visitor never is", () => {
		expect(isOwnShop({ ...base, viewerId: null, sellerId: null })).toBe(false);
	});
});

function refusal(details?: unknown) {
	return {
		code: "cart.singleShop",
		status: 409,
		data: { code: "cart.singleShop", ...(details ? { details } : {}) },
	};
}

describe("singleShopConflict", () => {
	test("names the shop already in the cart", () => {
		expect(
			singleShopConflict(
				refusal({ currentShop: { id: "s-2", name: "Akwa Shop" } }),
				"s-1",
			),
		).toEqual({ currentShop: { id: "s-2", name: "Akwa Shop" } });
	});

	test("still offers the replace when the refusal names no shop", () => {
		expect(singleShopConflict(refusal(), "s-1")).toEqual({ currentShop: null });
	});

	test("offers nothing when the cart already holds this shop", () => {
		expect(
			singleShopConflict(
				refusal({ currentShop: { id: "s-1", name: "Akwa Shop" } }),
				"s-1",
			),
		).toBeNull();
	});

	test("leaves every other error to the generic message", () => {
		expect(
			singleShopConflict({ code: "checkout.selfPurchase", data: {} }, "s-1"),
		).toBeNull();
		expect(singleShopConflict(new Error("boom"), "s-1")).toBeNull();
	});
});
