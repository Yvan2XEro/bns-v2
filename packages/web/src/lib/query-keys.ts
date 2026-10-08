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

export const caseKeys = {
	root: ["cases"] as const,
	returns: ["cases", "returns"] as const,
	returnList: (
		scope: "buyer" | "shop",
		id: string,
		filters: Record<string, string | boolean | undefined> = {},
	) => ["cases", "returns", scope, id, filters] as const,
	returnDetail: (id: string) => ["cases", "returns", "detail", id] as const,
	disputes: ["cases", "disputes"] as const,
	disputeList: (
		scope: "buyer" | "shop",
		id: string,
		filters: Record<string, string | boolean | undefined> = {},
	) => ["cases", "disputes", scope, id, filters] as const,
	disputeDetail: (id: string) => ["cases", "disputes", "detail", id] as const,
	moderation: ["cases", "moderation"] as const,
	moderationDetail: (id: string) =>
		["cases", "moderation", "detail", id] as const,
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
/** The roster and the pending invitations: one query, one key. */
export const teamKey = (shopId: string) =>
	[...shopScopeKey(shopId), "team"] as const;

/** Every filter of one shop's activity log, so a member action drops them all. */
export const activityRootKey = (shopId: string) =>
	[...shopScopeKey(shopId), "activity"] as const;

export const activityKey = (
	shopId: string,
	filters: { actor?: string; action?: string; targetType?: string } = {},
) => [...activityRootKey(shopId), filters] as const;

/** Every filter and page of one shop's inbox. */
export const inboxRootKey = (shopId: string) =>
	[...shopScopeKey(shopId), "inbox"] as const;

export const inboxKey = (
	shopId: string,
	filters: { filter?: string; q?: string } = {},
) => [...inboxRootKey(shopId), filters] as const;

/** Every tab, search and per-order view of one shop's order queue. */
export const shopOrdersRootKey = (shopId: string) =>
	[...shopScopeKey(shopId), "orders"] as const;

export const shopOrdersKey = (
	shopId: string,
	filters: { tab?: string; q?: string } = {},
) => [...shopOrdersRootKey(shopId), filters] as const;

/**
 * One order as the fulfilling shop sees it. Nested under the queue root, not
 * beside it, so accepting or shipping from the list reaches the detail view
 * the same `invalidateQueries` call already covers.
 */
export const shopOrderKey = (shopId: string, orderId: string) =>
	[...shopOrdersRootKey(shopId), orderId] as const;

/** Purchase orders are a separate supplier/reseller resource under the shop. */
export const purchaseOrdersRootKey = (shopId: string) =>
	[...shopScopeKey(shopId), "purchase-orders"] as const;

export const purchaseOrdersKey = (
	shopId: string,
	filters: { side: "supplier" | "reseller"; status?: string; q?: string },
) => [...purchaseOrdersRootKey(shopId), filters] as const;

export const purchaseOrderKey = (shopId: string, purchaseOrderId: string) =>
	[...purchaseOrdersRootKey(shopId), purchaseOrderId] as const;

/** The shop's commission invoices, current accrual and restriction. */
export const billingKey = (shopId: string) =>
	[...shopScopeKey(shopId), "billing"] as const;

/** The shop's COD, delivery and pickup settings. */
export const orderSettingsKey = (shopId: string) =>
	[...shopScopeKey(shopId), "order-settings"] as const;

export const shopInsightsKey = (shopId: string, period: string) =>
	[...shopScopeKey(shopId), "insights", period] as const;

/** Every view under the shop's protected-payment screens. */
export const sellerPaymentsRootKey = (shopId: string) =>
	[...shopScopeKey(shopId), "payments"] as const;

/** The amounts strip, payouts list and per-order breakdown. */
export const sellerPaymentsKey = (shopId: string) =>
	[...sellerPaymentsRootKey(shopId), "overview"] as const;

/** One payout's orders and status history. */
export const sellerPayoutKey = (shopId: string, payoutId: string) =>
	[...sellerPaymentsRootKey(shopId), "payouts", payoutId] as const;

/**
 * The onboarding/payout-account setup view. Nested under the same root as
 * the overview so a mutation that invalidates the root (a fresh payout
 * account, say) reaches both without naming each one by hand.
 */
export const paymentSetupKey = (shopId: string) =>
	[...sellerPaymentsRootKey(shopId), "setup"] as const;

/**
 * Outside `shopScopeKey` on purpose: it spans shops, so no single shop's
 * invalidation should drop it — the mutations that change membership
 * invalidate it by name.
 */
export const myShopsKey = () => ["me", "shops"] as const;

/**
 * Also outside, for the same reason `myShopsKey` is, and it matters more
 * here. A buyer's purchases span every shop they have ever ordered from, so a
 * shop-scoped purchases key would be dropped by one unrelated shop's
 * invalidation; and in the other direction the buyer's own mutations
 * (`cancel`, `confirm`, `confirm-receipt`, `withdrawal`) know no shop id at
 * all, so a shop-scoped key is one they could never name. The cart is the
 * same: it holds one shop's lines today, but the buyer may replace that shop
 * wholesale, and the cart routes take no shop id either.
 */
export const cartKey = () => ["cart"] as const;

export const purchasesRootKey = () => ["purchases"] as const;

export const purchasesKey = (filters: { status?: string } = {}) =>
	[...purchasesRootKey(), "list", filters] as const;

export const purchaseKey = (orderId: string) =>
	[...purchasesRootKey(), orderId] as const;

/** The order's own buyer-fee invoice, if the protection fee ever issued one. */
export const feeInvoiceKey = (orderId: string) =>
	[...purchaseKey(orderId), "fee-invoice"] as const;

/** One order's payment-intent status, nested under its own purchase. */
export const paymentStatusKey = (orderId: string) =>
	[...purchaseKey(orderId), "payment"] as const;

/** Also outside: the caller is not a member of the shop yet. */
export const invitationKey = (token: string) => ["invitations", token] as const;

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

/** A shop's delivery settings, nested under it so a shop-wide invalidation reaches them. */
export const deliverySettingsKey = (shopId: string) =>
	[...shopScopeKey(shopId), "delivery"] as const;
export const deliveryZonesKey = (shopId: string) =>
	[...deliverySettingsKey(shopId), "zones"] as const;
export const deliveryLocationsKey = (shopId: string) =>
	[...deliverySettingsKey(shopId), "locations"] as const;

/** The active partner couriers; not shop-scoped, the registry is platform-wide. */
export const couriersKey = () => ["couriers", "active"] as const;

/** The buyer's shipments of one purchase, nested so every order action refreshes them. */
export const purchaseShipmentsKey = (orderId: string) =>
	[...purchaseKey(orderId), "shipments"] as const;

/** Shop-side shipment views, one order's list and one shipment's detail. */
export const shopShipmentsRootKey = (shopId: string) =>
	[...shopScopeKey(shopId), "shipments"] as const;
export const shopOrderShipmentsKey = (shopId: string, orderId: string) =>
	[...shopShipmentsRootKey(shopId), "order", orderId] as const;

export const riderLinkKey = (token: string) => ["rider-link", token] as const;

export const courierSpaceKey = () => ["courier-space"] as const;
