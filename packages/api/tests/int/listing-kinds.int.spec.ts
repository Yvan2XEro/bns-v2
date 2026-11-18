import { describe, expect, it } from "vitest";
import {
	defaultPriceUnit,
	displayPriceUnit,
	kindOf,
	LISTING_KIND_RULES,
	LISTING_KINDS,
	listingAction,
	normalizePriceUnit,
	profileOf,
	SHOP_PROFILE_RULES,
} from "../../src/contracts/listingKinds";
import { getListingCategoryType } from "../../src/lib/listingFormPreset";

describe("listing kinds", () => {
	it("is the kind the category form resolves", () => {
		for (const kind of LISTING_KINDS)
			expect(getListingCategoryType({ listingForm: { type: kind } })).toBe(
				kind,
			);
	});

	it("reads an ad stored before kinds as goods", () => {
		expect(kindOf(undefined)).toBe("product");
		expect(kindOf("nonsense")).toBe("product");
		expect(kindOf("job")).toBe("job");
	});

	it("only lets goods into the catalogue", () => {
		expect(
			LISTING_KINDS.filter((kind) => LISTING_KIND_RULES[kind].sellable),
		).toEqual(["product"]);
	});

	it("offers each kind its own action, and order to a shop product", () => {
		expect(listingAction({ kind: "rental", isShopProduct: false })).toBe(
			"visit",
		);
		expect(listingAction({ kind: "job", isShopProduct: false })).toBe("apply");
		expect(listingAction({ kind: "service", isShopProduct: false })).toBe(
			"quote",
		);
		expect(listingAction({ kind: "product", isShopProduct: false })).toBe(
			"contact",
		);
		expect(listingAction({ kind: "product", isShopProduct: true })).toBe(
			"order",
		);
	});

	it("starts a rental on a monthly rent and a job on a monthly salary", () => {
		expect(defaultPriceUnit("rental")).toBe("month");
		expect(defaultPriceUnit("job")).toBe("month");
		expect(defaultPriceUnit("product")).toBe("total");
	});

	it("prints a unit only when it is one the kind allows", () => {
		expect(displayPriceUnit("rental", "month")).toBe("month");
		expect(displayPriceUnit("rental", "total")).toBeNull();
		// An old flat for sale has no unit: it must not read as a rent.
		expect(displayPriceUnit("rental", null)).toBeNull();
		expect(displayPriceUnit("product", "month")).toBeNull();
	});

	it("stores nothing without a price, and flags a unit the kind refuses", () => {
		expect(normalizePriceUnit("rental", null, "month")).toEqual({
			unit: null,
			invalid: false,
		});
		expect(normalizePriceUnit("rental", 150000, "night")).toEqual({
			unit: "night",
			invalid: false,
		});
		expect(normalizePriceUnit("product", 5000, "month")).toEqual({
			unit: null,
			invalid: true,
		});
	});
});

describe("shop profiles", () => {
	it("reads a shop created before profiles as a store", () => {
		expect(profileOf(undefined)).toBe("store");
	});

	it("keeps the retail workspace for stores only", () => {
		expect(
			Object.entries(SHOP_PROFILE_RULES)
				.filter(([, rules]) => rules.retail)
				.map(([profile]) => profile),
		).toEqual(["store"]);
	});
});
