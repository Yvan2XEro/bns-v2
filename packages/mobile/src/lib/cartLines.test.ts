import { describe, expect, test } from "bun:test";
import type { CartLineView } from "../types/order";
import { cartLineSubtotal, cartTotals } from "./cartLines";

function line(patch: Partial<CartLineView> = {}): CartLineView {
	return {
		id: "row-1",
		listingId: "listing-1",
		productId: "product-1",
		variantId: "variant-1",
		shopId: "shop-1",
		title: "Chaussures",
		quantity: 2,
		priceAtAdd: 10_000,
		currentPrice: 10_000,
		priceChanged: false,
		unavailable: false,
		unavailableCode: null,
		maxQuantity: null,
		...patch,
	};
}

describe("cartLineSubtotal", () => {
	test("multiplies the current price by the quantity", () => {
		expect(cartLineSubtotal(line({ quantity: 3, currentPrice: 7_500 }))).toBe(
			22_500,
		);
	});

	test("falls back to the price at add when the current price is unknown", () => {
		expect(
			cartLineSubtotal(
				line({ quantity: 2, currentPrice: null, priceAtAdd: 9_000 }),
			),
		).toBe(18_000);
	});
});

describe("cartTotals", () => {
	test("sums the available lines at their current price", () => {
		expect(
			cartTotals([
				line({ id: "a", quantity: 2, currentPrice: 10_000 }),
				line({ id: "b", quantity: 1, currentPrice: 4_500 }),
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
				line({ id: "a", quantity: 2, currentPrice: 10_000 }),
				line({
					id: "b",
					quantity: 4,
					currentPrice: 4_500,
					unavailable: true,
					unavailableCode: "cart.outOfStock",
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
					currentPrice: 12_000,
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

	test("a line whose price can no longer be read contributes nothing", () => {
		expect(
			cartTotals([
				line({
					id: "a",
					quantity: 2,
					currentPrice: null,
					unavailable: true,
					unavailableCode: "cart.itemUnavailable",
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
