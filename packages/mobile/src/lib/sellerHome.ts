export { whatsappShareUrl } from "../../../api/src/contracts/whatsapp";

import type { Href } from "expo-router";
import type {
	LaunchActionKey,
	SellerGuideSection,
	SellerTipKey,
	SetupStep,
	SetupStepKey,
	ShopOnboardingFacts,
} from "../../../api/src/contracts/sellerOnboarding";

/**
 * Where each piece of the seller home leads on mobile. The contract decides
 * what to show; this only knows the app's routes. `share` and `null` are
 * handled by the screen (system share sheet / nothing to open).
 */
export type SellerHomeTarget =
	| { kind: "route"; href: Href }
	| { kind: "share" }
	| { kind: "none" };

const route = (href: Href): SellerHomeTarget => ({ kind: "route", href });

export function stepTarget(step: SetupStep): SellerHomeTarget {
	const targets: Record<SetupStepKey, SellerHomeTarget> = {
		created: { kind: "none" },
		profile: route("/shop/manage"),
		product:
			(step.drafts ?? 0) > 0
				? route({ pathname: "/seller/catalogue", params: { filter: "draft" } })
				: route("/seller/product/new"),
		delivery: route("/seller/delivery"),
		payout: route("/seller/payments/setup"),
		verify: route("/seller/verification"),
		brand: route("/shop/settings/color"),
		move: route("/shop/move-listings"),
	};
	return targets[step.key];
}

export function launchTarget(
	action: LaunchActionKey,
	facts: ShopOnboardingFacts,
): SellerHomeTarget {
	switch (action) {
		case "shareWhatsapp":
			return { kind: "share" };
		case "boost":
			return facts.boostListingId
				? route(`/boost/${facts.boostListingId}`)
				: { kind: "none" };
		case "addProducts":
			return route("/seller/product/new");
		case "verify":
			return route("/seller/verification");
		case "addWhatsapp":
			return route("/shop/settings/contacts");
		case "replyFast":
			return route("/seller/inbox");
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
			return { kind: "share" };
		case "responseTime":
			return route("/seller/inbox");
		case "boost":
			return facts.boostListingId
				? route(`/boost/${facts.boostListingId}`)
				: { kind: "none" };
		case "verifiedBadge":
			return route("/seller/verification");
		case "brandColor":
			return route("/shop/settings/color");
		case "resale":
			return route("/seller/resale/catalogue");
		case "stockAlerts":
			return route({
				pathname: "/seller/catalogue",
				params: { filter: "low" },
			});
	}
}

export const GUIDE_TARGETS: Record<SellerGuideSection, SellerHomeTarget> = {
	setup: route("/shop/manage"),
	visibility: { kind: "share" },
	orders: route("/seller/orders"),
	payments: route("/seller/payments"),
	trust: route("/seller/verification"),
};
