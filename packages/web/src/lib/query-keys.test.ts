import { describe, expect, test } from "bun:test";
import {
	catalogueRootKey,
	isKeyCoveredBy,
	productDetailKey,
} from "./query-keys";

/**
 * The one shop-scoped key each of the four catalogue/stock mutations invalidates
 * that is a candidate prefix of `productDetailKey` — mirrors the actual
 * `invalidateQueries({ queryKey: catalogueRootKey(shopId) })` call in
 * `use-save-product.ts`, `use-record-movement.ts`, `use-stock-count.ts` and
 * `use-shop-settings.ts` (`useCloseShop`). If one of those hooks stops
 * invalidating `catalogueRootKey`, this map and the hook have drifted and the
 * "covers productDetailKey" test below stops being true for it.
 */
const MUTATION_INVALIDATIONS: Record<
	string,
	(shopId: string) => readonly unknown[]
> = {
	useSaveProduct: catalogueRootKey,
	useRecordMovement: catalogueRootKey,
	useStockCount: catalogueRootKey,
	useCloseShop: catalogueRootKey,
};

describe("query-keys structural coverage", () => {
	// The regression this proves: productDetailKey used to live at
	// ["products", productId, "detail"], a sibling of catalogueRootKey rather
	// than a descendant, so none of these four invalidations ever reached it
	// (see final-review.md, I6). Nesting it under catalogueRootKey fixes that
	// structurally — this test is what would fail if it broke again.
	for (const [name, invalidatedKey] of Object.entries(MUTATION_INVALIDATIONS)) {
		test(`${name}'s invalidation covers productDetailKey`, () => {
			const detailKey = productDetailKey("shop-1", "product-1");
			expect(isKeyCoveredBy(detailKey, invalidatedKey("shop-1"))).toBe(true);
		});
	}

	test("one shop's invalidation does not cover another shop's detail key", () => {
		const otherShopDetailKey = productDetailKey("shop-2", "product-1");
		expect(isKeyCoveredBy(otherShopDetailKey, catalogueRootKey("shop-1"))).toBe(
			false,
		);
	});

	test("the old, unreachable key shape fails the same coverage check", () => {
		// Reproduces productDetailKey's pre-fix shape: a sibling of
		// catalogueRootKey, not nested under it.
		const oldStyleKey = ["products", "product-1", "detail"] as const;
		expect(isKeyCoveredBy(oldStyleKey, catalogueRootKey("shop-1"))).toBe(false);
	});
});
