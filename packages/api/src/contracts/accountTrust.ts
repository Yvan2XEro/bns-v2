/**
 * What an account must have proved before an action — the one table the API
 * enforces and both apps read, so they ask for the proof before the request
 * instead of after a refusal. See docs/account-trust-2026-10.md.
 *
 * Every signed-in account has a verified email: signing in waits for it
 * (Payload's `auth.verify`). A verified phone is asked for where the other
 * side relies on reaching the person, or where money moves.
 */
export const TRUST_ACTIONS = [
	"message",
	"report",
	"favorite",
	"publishListing",
	"revealPhone",
	"boost",
	"createShop",
	"joinShop",
	"order",
] as const;
export type TrustAction = (typeof TRUST_ACTIONS)[number];

export type TrustRequirement = "account" | "phone";

export const TRUST_REQUIREMENTS: Record<TrustAction, TrustRequirement> = {
	message: "account",
	report: "account",
	favorite: "account",
	publishListing: "phone",
	revealPhone: "phone",
	boost: "phone",
	createShop: "phone",
	joinShop: "phone",
	order: "phone",
};

/** What a person still has to do before `action`, or null when nothing. */
export function missingProof(
	account: { phoneVerified?: boolean | null } | null | undefined,
	action: TrustAction,
): "signIn" | "phone" | null {
	if (!account) return "signIn";
	if (TRUST_REQUIREMENTS[action] === "phone" && account.phoneVerified !== true)
		return "phone";
	return null;
}

/** Statuses a seller cannot move a listing into without a verified phone. */
export const PUBLISHING_STATUSES = ["pending", "published"] as const;

export function isPublishingStatus(
	status: unknown,
): status is (typeof PUBLISHING_STATUSES)[number] {
	return (
		typeof status === "string" &&
		(PUBLISHING_STATUSES as readonly string[]).includes(status)
	);
}
