import { PRODUCT_LIMITS } from "./productValidation";

/**
 * The shop's default return policy pre-fills a new product's own, so it can
 * never be longer than the product field accepts.
 */
export const SHOP_RETURN_POLICY_MAX = PRODUCT_LIMITS.returnPolicyMax;

/** Trimmed; blank is "no default". */
export function normaliseShopReturnPolicy(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

export function shopReturnPolicyIssue(value: unknown): "tooLong" | null {
	const normalised = normaliseShopReturnPolicy(value);
	return normalised && normalised.length > SHOP_RETURN_POLICY_MAX
		? "tooLong"
		: null;
}
