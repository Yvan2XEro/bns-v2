import { describe, expect, it, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	catalogueRootKey,
	isKeyCoveredBy,
	moderationVerificationKeys,
	productDetailKey,
	shopScopeKey,
	verificationKey,
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

describe("verification query keys", () => {
	it("sits under the shop scope, so a shop-wide invalidation reaches it", () => {
		expect(isKeyCoveredBy(verificationKey("s-1"), shopScopeKey("s-1"))).toBe(
			true,
		);
	});

	it("is not a sibling of the catalogue root, so a catalogue mutation leaves it alone", () => {
		expect(
			isKeyCoveredBy(verificationKey("s-1"), catalogueRootKey("s-1")),
		).toBe(false);
	});

	it("does not collide across shops", () => {
		expect(isKeyCoveredBy(verificationKey("s-2"), verificationKey("s-1"))).toBe(
			false,
		);
	});

	it("registers only the hub key — a per-request invalidation would be a no-op", () => {
		// use-verification.ts used to invalidate a fabricated
		// verificationRequestKey(shopId, requestId), a 4-element key nested one
		// level under this 3-element one. isKeyCoveredBy(key, prefix) requires
		// prefix.length <= key.length, so that longer "prefix" could never match
		// this shorter, actually-registered key — every one of those five
		// invalidations was silently a no-op. There is no such key any more;
		// this pins that the hub key itself stays the only one in play.
		const hubKey = verificationKey("s-1");
		const fabricatedRequestKey = [...hubKey, "vr-1"];
		expect(isKeyCoveredBy(hubKey, fabricatedRequestKey)).toBe(false);
	});
});

describe("moderationVerificationKeys structural coverage", () => {
	it("root covers a queue key regardless of its filters", () => {
		expect(
			isKeyCoveredBy(
				moderationVerificationKeys.queue("to_review", { level: 3 }),
				moderationVerificationKeys.root,
			),
		).toBe(true);
	});

	it("root covers a detail key", () => {
		expect(
			isKeyCoveredBy(
				moderationVerificationKeys.detail("vr-1"),
				moderationVerificationKeys.root,
			),
		).toBe(true);
	});

	it("a queue key does not cover a detail key, or the reverse", () => {
		expect(
			isKeyCoveredBy(
				moderationVerificationKeys.detail("vr-1"),
				moderationVerificationKeys.queue("to_review"),
			),
		).toBe(false);
		expect(
			isKeyCoveredBy(
				moderationVerificationKeys.queue("to_review"),
				moderationVerificationKeys.detail("vr-1"),
			),
		).toBe(false);
	});

	// The bug this reproduces: isKeyCoveredBy used to compare segments with
	// `===`, but TanStack's own `partialMatchKey` compares an object segment
	// structurally. `queue-client.tsx` relies on exactly this — it calls
	// useVerificationQueue("to_review", {}) twice (once for the tab count,
	// once as the active query when no filter is selected) and its own
	// comment says TanStack dedupes the two into one request. Two fresh `{}`
	// literals are never `===`, so the old implementation would have reported
	// no match for this — a false negative for the one case the queue screen
	// actually depends on.
	it("two independently-built queue keys with equal, distinct filter objects are the same key", () => {
		const a = moderationVerificationKeys.queue("to_review", {});
		const b = moderationVerificationKeys.queue("to_review", {});
		expect(a).not.toBe(b);
		expect(a[4]).not.toBe(b[4]);
		expect(isKeyCoveredBy(a, b)).toBe(true);
		expect(isKeyCoveredBy(b, a)).toBe(true);
	});

	it("still tells apart two queue keys whose filters actually differ", () => {
		const level3 = moderationVerificationKeys.queue("to_review", { level: 3 });
		const level2 = moderationVerificationKeys.queue("to_review", { level: 2 });
		expect(isKeyCoveredBy(level3, level2)).toBe(false);
	});
});

/**
 * The same coverage, proven against a real `QueryClient` rather than against
 * `isKeyCoveredBy` alone — the thing this task asked for: not that a function
 * returned the expected boolean, but that the query TanStack actually holds
 * is the one that ends up invalidated. This is also what would have caught
 * `decision-dialog.tsx` invalidating only `detail(requestId)` on a refused
 * decision (final-review.md, Minor): a moderator queue mounted at the same
 * time as the dialog stays subscribed to `queue(...)`, and only invalidating
 * `root` — which `queue-row.tsx` already did on its own lost-claim race —
 * reaches it.
 */
describe("moderationVerificationKeys against a real QueryClient", () => {
	it("invalidating root marks a queue query (with a live filters object) as invalidated", async () => {
		const client = new QueryClient();
		const queueKey = moderationVerificationKeys.queue("to_review", {});
		client.setQueryData(queueKey as unknown as unknown[], { items: [] });

		await client.invalidateQueries({
			queryKey: moderationVerificationKeys.root,
		});

		expect(
			client.getQueryState(queueKey as unknown as unknown[])?.isInvalidated,
		).toBe(true);
	});

	it("invalidating root marks a detail query as invalidated", async () => {
		const client = new QueryClient();
		const detailKey = moderationVerificationKeys.detail("vr-1");
		client.setQueryData(detailKey as unknown as unknown[], { id: "vr-1" });

		await client.invalidateQueries({
			queryKey: moderationVerificationKeys.root,
		});

		expect(
			client.getQueryState(detailKey as unknown as unknown[])?.isInvalidated,
		).toBe(true);
	});

	it("invalidating only detail(requestId) — the pre-fix decision-dialog behaviour — leaves the queue query untouched", async () => {
		const client = new QueryClient();
		const requestId = "vr-1";
		const queueKey = moderationVerificationKeys.queue("to_review", {});
		client.setQueryData(queueKey as unknown as unknown[], { items: [] });

		await client.invalidateQueries({
			queryKey: moderationVerificationKeys.detail(requestId),
		});

		expect(
			client.getQueryState(queueKey as unknown as unknown[])?.isInvalidated,
		).toBeFalsy();
	});
});
