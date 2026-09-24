/**
 * Shop-scoped query-key builders and the coverage rule TanStack Query's
 * default `invalidateQueries` uses to match them.
 *
 * `catalogueRootKey(shopId)` is the root every mutation that changes a shop's
 * catalogue or stock already invalidates: `useSaveProduct`,
 * `useRecordMovement`, `useStockCount` and `useCloseShop`. Any query key
 * built as a suffix of it — `productDetailKey` included — is therefore
 * invalidated by that same call, with no need for a mutation to name it by
 * hand. Nest a new shop-scoped query under one of these builders rather than
 * inventing a fresh top-level key, or it falls out of that net the way
 * `productDetailKey` used to (it lived at `["products", productId,
 * "detail"]`, a sibling of `["shops", shopId, "products"]` rather than a
 * descendant of it, so none of the four mutations above ever reached it).
 */

export const shopScopeKey = (shopId: string) => ["shops", shopId] as const;

/** Every page, filter and per-product view of one shop's catalogue. */
export const catalogueRootKey = (shopId: string) =>
	[...shopScopeKey(shopId), "products"] as const;

/** One product's full editor payload: variants, listing, latest movements. */
export const productDetailKey = (shopId: string, productId: string) =>
	[...catalogueRootKey(shopId), productId, "detail"] as const;

/**
 * True when `key` would be invalidated by `invalidateQueries({ queryKey:
 * prefix })` under TanStack Query's default `exact: false` matching: a
 * leading, element-wise match, `prefix` no longer than `key`.
 */
export function isKeyCoveredBy(
	key: readonly unknown[],
	prefix: readonly unknown[],
): boolean {
	if (prefix.length > key.length) return false;
	return prefix.every((segment, i) => segment === key[i]);
}
