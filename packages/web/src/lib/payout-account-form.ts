import { z } from "zod";
import type { PayoutMethod } from "./payment-status";

/** Mirrors the server's `bodySchema` in
 * `packages/api/src/app/(frontend)/api/shops/[id]/payout-accounts/route.ts`
 * field for field: same enum, same trimmed lengths. */
export const PAYOUT_METHOD_VALUES = [
	"mtn_momo",
	"orange_money",
	"bank",
] as const satisfies readonly PayoutMethod[];

export const payoutAccountSchema = z.object({
	method: z.enum(PAYOUT_METHOD_VALUES),
	accountName: z.string().trim().min(2).max(80),
	accountNumber: z.string().trim().min(1).max(40),
});

export type PayoutAccountFormValues = z.infer<typeof payoutAccountSchema>;

/**
 * `payout.accountChangeCooldown` carries `details.until` (an ISO date) —
 * read defensively, the same way `addressFieldOf` reads
 * `checkout.addressInvalid`'s `details.field` in `checkout-form.ts`: the
 * shared transport may not forward `details` at all.
 */
export function cooldownUntilOf(error: unknown): string | null {
	if (!error || typeof error !== "object" || !("details" in error)) return null;
	const details = (error as { details: unknown }).details;
	if (!details || typeof details !== "object" || !("until" in details))
		return null;
	const until = (details as { until: unknown }).until;
	return typeof until === "string" ? until : null;
}

/**
 * Whether `?shop=&notMe=` in the setup page's own URL names an account this
 * shop's current owner should be offered the "this was not me" confirm
 * button for — the SMS link's target. `shop` must match the shop actually
 * being viewed: a stale or copy-pasted link for another shop must not light
 * the banner up here. This is pure data extraction; it never calls the API
 * itself, which is what keeps a bare page load (an SMS preview fetches the
 * link) from reporting fraud on its own — only `NotMeBanner`'s confirm
 * button does that, from its own `onClick`.
 */
export function notMeAccountId(
	shopId: string,
	params: { shop: string | null; notMe: string | null },
): string | null {
	if (!params.shop || !params.notMe) return null;
	if (params.shop !== shopId) return null;
	return params.notMe;
}
