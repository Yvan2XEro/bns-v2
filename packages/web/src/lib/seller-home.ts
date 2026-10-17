export { whatsappShareUrl } from "../../../api/src/contracts/whatsapp";

import type {
	LaunchActionKey,
	SellerGuideSection,
	SellerTipKey,
	SetupStep,
	SetupStepKey,
	ShopOnboardingFacts,
} from "../../../api/src/contracts/sellerOnboarding";

/**
 * Where each piece of the seller home leads on the web. The contract decides
 * what to show; this only knows the workspace's routes. `whatsapp` opens
 * WhatsApp with the shop link, `boost` opens the boost dialog in place.
 */
export type SellerHomeTarget =
	| { kind: "route"; href: string }
	| { kind: "whatsapp" }
	| { kind: "boost"; listingId: string }
	| { kind: "none" };

const route = (href: string): SellerHomeTarget => ({ kind: "route", href });

export function stepTarget(step: SetupStep): SellerHomeTarget {
	const targets: Record<SetupStepKey, SellerHomeTarget> = {
		created: { kind: "none" },
		profile: route("/seller/settings"),
		product:
			(step.drafts ?? 0) > 0
				? route("/seller/catalogue?status=draft")
				: route("/seller/catalogue/new"),
		delivery: route("/seller/delivery"),
		payout: route("/seller/payments/setup"),
		verify: route("/seller/verification"),
		brand: route("/seller/settings"),
		move: route("/seller/settings?move=1"),
	};
	return targets[step.key];
}

const boost = (facts: ShopOnboardingFacts): SellerHomeTarget =>
	facts.boostListingId
		? { kind: "boost", listingId: facts.boostListingId }
		: { kind: "none" };

export function launchTarget(
	action: LaunchActionKey,
	facts: ShopOnboardingFacts,
): SellerHomeTarget {
	switch (action) {
		case "shareWhatsapp":
			return { kind: "whatsapp" };
		case "boost":
			return boost(facts);
		case "addProducts":
			return route("/seller/catalogue/new");
		case "verify":
			return route("/seller/verification");
		case "addWhatsapp":
			return route("/seller/settings?tab=contacts");
		case "replyFast":
			return route("/seller/messages");
	}
}

export function tipTarget(
	tip: SellerTipKey,
	facts: ShopOnboardingFacts,
): SellerHomeTarget {
	switch (tip) {
		case "firstPhoto":
			return route("/seller/catalogue");
		case "whatsappStatus":
			return { kind: "whatsapp" };
		case "responseTime":
			return route("/seller/messages");
		case "boost":
			return boost(facts);
		case "verifiedBadge":
			return route("/seller/verification");
		case "brandColor":
			return route("/seller/settings");
		case "resale":
			return route("/seller/resale");
		case "stockAlerts":
			return route("/seller/catalogue?stock=low");
	}
}

export const GUIDE_TARGETS: Record<SellerGuideSection, SellerHomeTarget> = {
	setup: route("/seller/settings"),
	visibility: { kind: "whatsapp" },
	orders: route("/seller/orders"),
	payments: route("/seller/payments"),
	trust: route("/seller/verification"),
};
