import { describe, expect, it } from "bun:test";
import type { CartLineView, CartView } from "~/types/order";
import { ApiError } from "./apiError";
import {
	canCheckout,
	cartLineState,
	cartTotals,
	parseAddToCart,
	quantityStepper,
	singleShopConflict,
} from "./cart-lines";

function line(patch: Partial<CartLineView> = {}): CartLineView {
	const quantity = patch.quantity ?? 1;
	const unitPrice = patch.unitPrice ?? 10_000;
	return {
		id: "row-1",
		listingId: "l-1",
		productId: "p-1",
		variantId: "v-1",
		shopId: "s-1",
		title: "Casque Bluetooth",
		variantLabel: "Noir",
		imageUrl: null,
		quantity,
		unitPrice,
		priceAtAdd: unitPrice,
		priceChanged: false,
		lineSubtotal: unitPrice * quantity,
		available: true,
		maxQuantity: null,
		...patch,
	};
}

function cart(patch: Partial<CartView> = {}): CartView {
	return {
		id: "cart-1",
		shop: { id: "s-1", name: "Boutique Akwa", handle: "akwa", city: "douala" },
		lines: [line()],
		subtotal: 10_000,
		shopOrderable: true,
		currency: "XAF",
		...patch,
	};
}

describe("cartTotals", () => {
	it("adds the line subtotals and the units of every available line", () => {
		const totals = cartTotals([
			line({ id: "a", quantity: 2, unitPrice: 12_500 }),
			line({ id: "b", quantity: 3, unitPrice: 4_000 }),
		]);
		expect(totals.subtotal).toBe(37_000);
		expect(totals.itemCount).toBe(5);
		expect(totals.lineCount).toBe(2);
		expect(totals.unavailableCount).toBe(0);
		expect(totals.priceChangedCount).toBe(0);
		expect(totals.priceChangeDelta).toBe(0);
	});

	it("counts a price-changed line and reports the signed difference", () => {
		const totals = cartTotals([
			line({
				id: "a",
				quantity: 2,
				unitPrice: 12_000,
				priceAtAdd: 10_000,
				priceChanged: true,
				lineSubtotal: 24_000,
			}),
			line({ id: "b", quantity: 1, unitPrice: 5_000 }),
		]);
		expect(totals.priceChangedCount).toBe(1);
		expect(totals.priceChangeDelta).toBe(4_000);
		// The buyer pays the current price, never the remembered one.
		expect(totals.subtotal).toBe(29_000);
	});

	it("reports a price drop as a negative difference", () => {
		const totals = cartTotals([
			line({
				quantity: 1,
				unitPrice: 8_000,
				priceAtAdd: 10_000,
				priceChanged: true,
				lineSubtotal: 8_000,
			}),
		]);
		expect(totals.priceChangeDelta).toBe(-2_000);
		expect(totals.subtotal).toBe(8_000);
	});

	it("leaves an unavailable line out of the subtotal and the unit count", () => {
		const totals = cartTotals([
			line({ id: "a", quantity: 2, unitPrice: 10_000 }),
			line({
				id: "b",
				quantity: 4,
				unitPrice: 7_000,
				lineSubtotal: 28_000,
				available: false,
			}),
		]);
		expect(totals.subtotal).toBe(20_000);
		expect(totals.itemCount).toBe(2);
		expect(totals.lineCount).toBe(2);
		expect(totals.unavailableCount).toBe(1);
	});

	it("ignores a price change on an unavailable line, which the buyer cannot pay anyway", () => {
		const totals = cartTotals([
			line({
				quantity: 1,
				unitPrice: 9_000,
				priceAtAdd: 6_000,
				priceChanged: true,
				lineSubtotal: 9_000,
				available: false,
			}),
		]);
		expect(totals.priceChangedCount).toBe(0);
		expect(totals.priceChangeDelta).toBe(0);
		expect(totals.subtotal).toBe(0);
	});

	it("returns zeroes for an empty cart", () => {
		expect(cartTotals([])).toEqual({
			lineCount: 0,
			itemCount: 0,
			subtotal: 0,
			unavailableCount: 0,
			priceChangedCount: 0,
			priceChangeDelta: 0,
		});
	});
});

describe("canCheckout", () => {
	it("allows an orderable cart whose every line is available", () => {
		expect(canCheckout(cart())).toBe(true);
	});

	it("refuses an empty cart", () => {
		expect(canCheckout(cart({ lines: [], subtotal: 0 }))).toBe(false);
	});

	it("refuses a cart with no active cart document at all", () => {
		expect(canCheckout(cart({ id: null, lines: [], subtotal: 0 }))).toBe(false);
	});

	it("refuses a cart holding an unavailable line", () => {
		expect(
			canCheckout(
				cart({
					lines: [line({ id: "a" }), line({ id: "b", available: false })],
				}),
			),
		).toBe(false);
	});

	it("refuses a cart whose shop can no longer take orders", () => {
		expect(canCheckout(cart({ shopOrderable: false }))).toBe(false);
	});

	it("refuses a cart whose only line is unavailable, even though the shop is orderable", () => {
		expect(canCheckout(cart({ lines: [line({ available: false })] }))).toBe(
			false,
		);
	});
});

describe("cartLineState", () => {
	it("reads an available, unchanged line as ok", () => {
		expect(cartLineState(line())).toBe("ok");
	});

	it("reads a changed price as price_changed", () => {
		expect(cartLineState(line({ priceAtAdd: 8_000, priceChanged: true }))).toBe(
			"price_changed",
		);
	});

	it("reads an unavailable line as unavailable, even when its price also changed", () => {
		expect(cartLineState(line({ available: false }))).toBe("unavailable");
		expect(
			cartLineState(
				line({ available: false, priceAtAdd: 8_000, priceChanged: true }),
			),
		).toBe("unavailable");
	});
});

describe("quantityStepper", () => {
	it("allows both directions in the middle of the range", () => {
		expect(quantityStepper(line({ quantity: 3, maxQuantity: 5 }))).toEqual({
			canDecrease: true,
			canIncrease: true,
			atMax: false,
		});
	});

	it("stops at one, where the remove button takes over", () => {
		expect(quantityStepper(line({ quantity: 1, maxQuantity: 5 }))).toEqual({
			canDecrease: false,
			canIncrease: true,
			atMax: false,
		});
	});

	it("stops at the tracked stock and says so", () => {
		expect(quantityStepper(line({ quantity: 5, maxQuantity: 5 }))).toEqual({
			canDecrease: true,
			canIncrease: false,
			atMax: true,
		});
	});

	it("leaves an untracked variant's ceiling to the server", () => {
		expect(quantityStepper(line({ quantity: 12, maxQuantity: null }))).toEqual({
			canDecrease: true,
			canIncrease: true,
			atMax: false,
		});
	});

	it("freezes an unavailable line in both directions", () => {
		expect(
			quantityStepper(line({ quantity: 3, maxQuantity: 5, available: false })),
		).toEqual({ canDecrease: false, canIncrease: false, atMax: false });
	});
});

describe("singleShopConflict", () => {
	const refusal = (details?: unknown) => ({
		code: "cart.singleShop",
		status: 409,
		details,
	});

	it("offers replace only when the conflicting shop differs", () => {
		const other = refusal({ currentShop: { id: "s-9", name: "Chez Mado" } });
		expect(singleShopConflict(other, "s-1")).toEqual({
			currentShop: { id: "s-9", name: "Chez Mado" },
		});
		expect(singleShopConflict(other, "s-9")).toBeNull();
	});

	it("keeps the conflict when the shop being added is unknown, trusting the server's refusal", () => {
		expect(
			singleShopConflict(
				refusal({ currentShop: { id: "s-9", name: null } }),
				null,
			),
		).toEqual({ currentShop: { id: "s-9", name: null } });
	});

	it("keeps the conflict without a name when the refusal carries no readable details", () => {
		expect(singleShopConflict(refusal(), "s-1")).toEqual({
			currentShop: null,
		});
		expect(
			singleShopConflict(refusal({ currentShop: { id: 7 } }), "s-1"),
		).toEqual({ currentShop: null });
	});

	it("reads the ApiError the cart hooks actually throw", () => {
		const thrown = new ApiError("refused", 409, "cart.singleShop");
		expect(singleShopConflict(thrown, "s-1")).toEqual({ currentShop: null });
		const withDetails = Object.assign(thrown, {
			details: { currentShop: { id: "s-9", name: "Chez Mado" } },
		});
		expect(singleShopConflict(withDetails, "s-1")).toEqual({
			currentShop: { id: "s-9", name: "Chez Mado" },
		});
	});

	it("is not a conflict for any other failure", () => {
		expect(
			singleShopConflict(
				{ code: "cart.outOfStock", details: { currentShop: { id: "s-9" } } },
				"s-1",
			),
		).toBeNull();
		expect(singleShopConflict(new Error("boom"), "s-1")).toBeNull();
		expect(singleShopConflict(null, "s-1")).toBeNull();
	});
});

describe("parseAddToCart", () => {
	it("reads listing, variant and quantity", () => {
		expect(parseAddToCart("l-1:v-2:3")).toEqual({
			listingId: "l-1",
			variantId: "v-2",
			quantity: 3,
		});
	});

	it("refuses a missing, partial or malformed value", () => {
		for (const value of [
			null,
			"",
			"l-1:v-2",
			"l-1::3",
			":v-2:3",
			"l-1:v-2:0",
			"l-1:v-2:-1",
			"l-1:v-2:1.5",
			"l-1:v-2:abc",
			"l-1:v-2:3:extra",
		]) {
			expect(parseAddToCart(value)).toBeNull();
		}
	});
});
