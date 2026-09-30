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
 * Everything about one shop's verification: the hub view and each request.
 *
 * There is no separate per-request key. `useShopVerification` is the only
 * `useQuery` in this domain, and it reads the whole hub in one call — a
 * `verificationRequestKey(shopId, requestId)` nested under this one would
 * never be registered by anything, so invalidating it would be a silent
 * no-op (a longer prefix can never match a shorter registered key). Every
 * mutation in `use-verification.ts` invalidates this key alone.
 */
export const verificationKey = (shopId: string) =>
	[...shopScopeKey(shopId), "verification"] as const;

/**
 * Reviewer keys are not shop-scoped: the queue spans shops, and invalidating
 * it on a decision must not depend on knowing which shop the request belonged
 * to.
 *
 * No `summary` key: nothing in `use-moderation-verification.ts` ever
 * registers a `useQuery` for it (the queue tabs' pending count is read off
 * the "to_review" queue query itself, in `queue-client.tsx`), so invalidating
 * it invalidated nothing — the same defect `verificationRequestKey` had.
 */
export const moderationVerificationKeys = {
	root: ["moderation", "verification"] as const,
	queue: (queue: string, filters: { level?: number; signal?: string } = {}) =>
		["moderation", "verification", "queue", queue, filters] as const,
	detail: (id: string) => ["moderation", "verification", "detail", id] as const,
};

/**
 * Mirrors TanStack Query's own `partialMatchKey` (`@tanstack/query-core`,
 * `utils.ts`): recursive, structural, and driven by `prefix`'s keys rather
 * than `key`'s — so a shorter `prefix` matches a leading slice of `key` (the
 * ordinary invalidation case), and an object segment (a `filters` literal,
 * for instance) matches another object with the same values regardless of
 * reference, the way two independently-called `moderationVerificationKeys
 * .queue("to_review", {})` do for TanStack's own deduping. A `===` compare
 * here would silently disagree with what `invalidateQueries` actually does
 * for any key carrying an object segment.
 */
export function isKeyCoveredBy(
	key: readonly unknown[],
	prefix: readonly unknown[],
): boolean {
	return partialMatchKey(key, prefix);
}

function partialMatchKey(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (a && b && typeof a === "object" && typeof b === "object") {
		return Object.keys(b as Record<string, unknown>).every((k) =>
			partialMatchKey(
				(a as Record<string, unknown>)[k],
				(b as Record<string, unknown>)[k],
			),
		);
	}
	return false;
}
