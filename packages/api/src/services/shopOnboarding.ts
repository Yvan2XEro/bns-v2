import type { Payload, Where } from "payload";
import { can } from "../access/shopRoles";
import { shopProfileRules } from "../contracts/listingKinds";
import type { ShopOnboardingFacts } from "../contracts/sellerOnboarding";
import { isBrandColor } from "../contracts/shopTheme";
import { getDeliverySettings } from "../lib/deliverySettings";
import { getOrderSettings } from "../lib/orderSettings";
import {
	getPaymentSettings,
	isProtectedPaymentOpen,
} from "../lib/paymentSettings";
import { getResaleSettings } from "../lib/resaleSettings";
import { shopCapabilities } from "../lib/shopCapabilities";
import { getVerificationSettings } from "../lib/verificationSettings";
import { shopMarketCountry } from "./connectedAccounts";
import { requireShopPermission } from "./shopGuards";
import { boostableListing } from "./shopInsightsStock";
import type { ServiceUser } from "./shops";

const filled = (value: unknown) =>
	typeof value === "string" && value.trim().length > 0;

/** Products looked at for a boostable listing; the home offers one, not a list. */
const BOOST_CANDIDATES = 5;

/**
 * Facts only — booleans and counts — so any active member may read them:
 * nothing here reveals more than the screens a staff member already opens.
 * The feature gates are the ones the feature routes themselves apply.
 */
export async function getShopOnboarding(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	now: Date = new Date(),
): Promise<ShopOnboardingFacts> {
	const { shop, role } = await requireShopPermission(
		payload,
		user,
		shopId,
		"team.view",
	);
	const id = String(shop.id);
	const ofShop: Where = { shop: { equals: id } };
	const count = (
		collection: Parameters<Payload["count"]>[0]["collection"],
		where: Where[],
	) =>
		payload
			.count({
				collection,
				where: { and: [ofShop, ...where] },
				overrideAccess: true,
			})
			.then((result) => result.totalDocs);

	const [
		orderSettings,
		deliverySettings,
		verificationSettings,
		paymentSettings,
		resaleSettings,
	] = await Promise.all([
		getOrderSettings(payload),
		getDeliverySettings(payload),
		getVerificationSettings(payload),
		getPaymentSettings(payload),
		getResaleSettings(payload),
	]);
	const capabilities = shopCapabilities(shop, now);
	// An agency, a recruiter or a provider sells nothing through the platform.
	const retail = shopProfileRules(shop.profile).retail;
	const deliveryApplies =
		retail && orderSettings.enabled && deliverySettings.zonesEnabled;
	const payoutApplies =
		retail &&
		capabilities.protectedPayment &&
		isProtectedPaymentOpen(
			paymentSettings,
			shopMarketCountry(shop, paymentSettings),
		);

	const [
		active,
		drafts,
		personal,
		zones,
		pickupPoints,
		payoutActive,
		payoutPending,
		openRequests,
		orders,
		conversations,
		candidates,
		liveAds,
	] = await Promise.all([
		count("products", [{ status: { equals: "active" } }]),
		count("products", [{ status: { equals: "draft" } }]),
		payload
			.count({
				collection: "listings",
				where: {
					and: [
						{ seller: { equals: user.id } },
						{ shop: { exists: false } },
						{ status: { in: ["draft", "pending", "published"] } },
					],
				},
				overrideAccess: true,
			})
			.then((result) => result.totalDocs),
		deliveryApplies
			? count("delivery-zones", [{ active: { equals: true } }])
			: 0,
		deliveryApplies
			? count("shop-locations", [
					{ active: { equals: true } },
					{ pickupEnabled: { equals: true } },
				])
			: 0,
		payoutApplies
			? count("payout-accounts", [{ status: { equals: "active" } }])
			: 0,
		payoutApplies
			? count("payout-accounts", [
					{ status: { in: ["pending_verification", "pending_review"] } },
				])
			: 0,
		count("verification-requests", [{ openKey: { exists: true } }]),
		count("orders", []),
		count("conversations", []),
		payload.find({
			collection: "products",
			where: { and: [ofShop, { status: { equals: "active" } }] },
			sort: "-updatedAt",
			limit: BOOST_CANDIDATES,
			depth: 0,
			overrideAccess: true,
		}),
		count("listings", [
			{ product: { exists: false } },
			{ status: { in: ["pending", "published"] } },
		]),
	]);

	let boostListingId: string | null = null;
	for (const product of candidates.docs) {
		boostListingId = await boostableListing(
			payload,
			product.listing,
			user.id,
			now,
		);
		if (boostListingId) break;
	}

	return {
		retail,
		ads: { live: liveAds },
		profile: {
			logo: Boolean(shop.logo),
			banner: Boolean(shop.banner),
			description: filled(shop.description),
			brandColor: isBrandColor(shop.brandColor),
			whatsapp: filled(shop.contact?.whatsapp),
		},
		products: { active, drafts },
		personalListings: personal,
		delivery: { applies: deliveryApplies, zones, pickupPoints },
		verification: {
			applies: verificationSettings.enabled,
			level: capabilities.effectiveLevel,
			openRequest: openRequests > 0,
		},
		payout: {
			applies: payoutApplies,
			active: payoutActive > 0,
			pending: payoutPending > 0,
		},
		resale: {
			applies: retail && resaleSettings.enabled && capabilities.resell,
		},
		traction: { orders, conversations },
		boostListingId,
		can: {
			editSettings: can(role, "settings.edit"),
			editCatalogue: can(role, "catalogue.edit"),
			submitVerification: can(role, "verification.submit"),
			managePayments: can(role, "payments.manage"),
			reply: can(role, "inbox.reply"),
			resale: can(role, "resale.manage"),
		},
	};
}
