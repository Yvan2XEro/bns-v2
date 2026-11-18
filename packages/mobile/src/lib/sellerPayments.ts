import type { SellerPaymentsView } from "../types/order";

/**
 * The hub tile's badge: the count of active holds, the one thing on the
 * payments screen that genuinely needs the owner's attention right now (an
 * amount or a payout count is informative, not actionable). Reads the fetched
 * view's own `holds` array — never a flag set by hand — so a hold placed or
 * released server-side is reflected the next time the hub refetches.
 */
export function sellerPaymentsActionCount(
	view: SellerPaymentsView | undefined,
): number {
	return view?.holds.length ?? 0;
}

/**
 * Whether `?shop=&notMe=` in the setup screen's own deep link names an
 * account this shop's current owner should be offered the "this was not
 * me" confirm button for — the SMS link's target, mirroring web's
 * `notMeAccountId`. `shop` must match the shop actually being viewed: a
 * stale or copy-pasted link for another shop must not light the banner up
 * here. Pure data extraction; it never calls the API itself, which is what
 * keeps a bare screen open (an SMS preview fetches the link) from reporting
 * fraud on its own — only the banner's own confirm button does that.
 */
export function notMeAccountId(
	shopId: string,
	params: { shop: string | null; notMe: string | null },
): string | null {
	if (!params.shop || !params.notMe) return null;
	if (params.shop !== shopId) return null;
	return params.notMe;
}
