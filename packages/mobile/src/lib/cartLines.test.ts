import { describe, expect, test } from "bun:test";
import type { CartLineView, CartView } from "../types/order";
import {
	canCheckout,
	cartLineState,
	cartLineSubtotal,
	cartTotals,
	quantityStepper,
} from "./cartLines";

function line(patch: Partial<CartLineView> = {}): CartLineView {
	return {
		id: "row-1",
		listingId: "listing-1",
		productId: "product-1",
		variantId: "variant-1",
		shopId: "shop-1",
		title: "Chaussures",
		variantLabel: "42",
		imageUrl: null,
		quantity: 2,
		unitPrice: 10_000,
		priceAtAdd: 10_000,
		priceChanged: false,
		lineSubtotal: 20_000,
		available: true,
		maxQuantity: null,
		...patch,
	};
}

describe("cartLineSubtotal", () => {
	test("multiplies the unit price by the quantity", () => {
		expect(cartLineSubtotal(line({ quantity: 3, unitPrice: 7_500 }))).toBe(
			22_500,
		);
	});

	test("follows the quantity the caller passes, not the server's stored subtotal", () => {
		expect(
			cartLineSubtotal(
				line({ quantity: 4, unitPrice: 9_000, lineSubtotal: 0 }),
			),
		).toBe(36_000);
	});
});

describe("cartTotals", () => {
	test("sums the available lines at their unit price", () => {
		expect(
			cartTotals([
				line({ id: "a", quantity: 2, unitPrice: 10_000 }),
				line({ id: "b", quantity: 1, unitPrice: 4_500 }),
			]),
		).toEqual({
			subtotal: 24_500,
			itemCount: 3,
			unavailableCount: 0,
			priceChangedCount: 0,
		});
	});

	test("an unavailable line counts for neither the subtotal nor the item count", () => {
		expect(
			cartTotals([
				line({ id: "a", quantity: 2, unitPrice: 10_000 }),
				line({
					id: "b",
					quantity: 4,
					unitPrice: 4_500,
					available: false,
					maxQuantity: 1,
				}),
			]),
		).toEqual({
			subtotal: 20_000,
			itemCount: 2,
			unavailableCount: 1,
			priceChangedCount: 0,
		});
	});

	test("a price-changed line is still counted, and reported", () => {
		expect(
			cartTotals([
				line({
					id: "a",
					quantity: 2,
					priceAtAdd: 10_000,
					unitPrice: 12_000,
					priceChanged: true,
				}),
			]),
		).toEqual({
			subtotal: 24_000,
			itemCount: 2,
			unavailableCount: 0,
			priceChangedCount: 1,
		});
	});

	test("a line whose listing can no longer be read contributes nothing", () => {
		expect(
			cartTotals([
				line({
					id: "a",
					quantity: 2,
					unitPrice: 10_000,
					available: false,
				}),
			]),
		).toEqual({
			subtotal: 0,
			itemCount: 0,
			unavailableCount: 1,
			priceChangedCount: 0,
		});
	});

	test("an empty cart totals zero", () => {
		expect(cartTotals([])).toEqual({
			subtotal: 0,
			itemCount: 0,
			unavailableCount: 0,
			priceChangedCount: 0,
		});
	});
});

function cart(lines: CartLineView[], patch: Partial<CartView> = {}): CartView {
	return {
		id: "cart-1",
		shop: {
			id: "shop-1",
			name: "Boutique",
			handle: "boutique",
			city: "douala",
		},
		lines,
		subtotal: 0,
		shopOrderable: true,
		currency: "XAF",
		...patch,
	};
}

describe("canCheckout", () => {
	test("an orderable cart of available lines can check out", () => {
		expect(canCheckout(cart([line()]))).toBe(true);
	});
	test("one unavailable line blocks the whole cart", () => {
		expect(
			canCheckout(cart([line(), line({ id: "row-2", available: false })])),
		).toBe(false);
	});
	test("a shop that stopped taking orders blocks it", () => {
		expect(canCheckout(cart([line()], { shopOrderable: false }))).toBe(false);
	});
	test("an empty cart cannot check out", () => {
		expect(canCheckout(cart([]))).toBe(false);
	});
});

describe("cartLineState", () => {
	test("unavailable wins over a changed price", () => {
		expect(cartLineState(line({ available: false, priceChanged: true }))).toBe(
			"unavailable",
		);
	});
	test("a changed price on an available line is announced", () => {
		expect(cartLineState(line({ priceChanged: true }))).toBe("price_changed");
	});
	test("otherwise the line is ok", () => {
		expect(cartLineState(line())).toBe("ok");
	});
});

describe("quantityStepper", () => {
	test("never below one", () => {
		expect(quantityStepper(line({ quantity: 1 }))).toEqual({
			canDecrease: false,
			canIncrease: true,
			atMax: false,
		});
	});
	test("stops at a tracked variant's stock and says so", () => {
		expect(quantityStepper(line({ quantity: 3, maxQuantity: 3 }))).toEqual({
			canDecrease: true,
			canIncrease: false,
			atMax: true,
		});
	});
	test("an untracked variant has no client ceiling", () => {
		expect(quantityStepper(line({ quantity: 40, maxQuantity: null }))).toEqual({
			canDecrease: true,
			canIncrease: true,
			atMax: false,
		});
	});
	test("an unavailable line cannot be stepped at all", () => {
		expect(quantityStepper(line({ available: false }))).toEqual({
			canDecrease: false,
			canIncrease: false,
			atMax: false,
		});
	});
});
