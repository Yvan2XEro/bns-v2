import type { VerificationBadge } from "./verification";

export interface BuyerProtectionConfig {
	bps: number;
	min: number;
}

/**
 * Whether a listing shows the protected-payment disclosure badge next to its
 * price. The flag alone is not enough: `shopCapabilities(shop).protectedPayment`
 * on the API is `effectiveLevel >= 2`, and `badge` is that same server-computed,
 * expiry-aware level read as `"phone" | "identity" | "business" | null`
 * (`packages/api/src/lib/shopCapabilities.ts`'s `BADGES` table) — so a badge of
 * `"identity"` or `"business"` is exactly level 2+, read off the value the
 * server already sent rather than re-derived from a raw, possibly-expired
 * `level` number (the trap `badgeForLevel`'s own comment warns against).
 */
export function showsProtectionBadge(
	protectedPaymentEnabled: boolean,
	shopBadge: VerificationBadge | null,
): boolean {
	return protectedPaymentEnabled && shopBadge !== null && shopBadge !== "phone";
}

/** The `{rate}`/`{min}` values `Payments.disclosure_listingBadge` interpolates — never literals. */
export function protectionBadgeCopy(
	buyerProtection: BuyerProtectionConfig,
	locale: "fr" | "en",
): { rate: string; min: string } {
	const numberLocale = locale === "fr" ? "fr-FR" : "en-US";
	return {
		rate: (buyerProtection.bps / 100).toLocaleString(numberLocale, {
			maximumFractionDigits: 2,
		}),
		min: Math.round(buyerProtection.min).toLocaleString(numberLocale),
	};
}
