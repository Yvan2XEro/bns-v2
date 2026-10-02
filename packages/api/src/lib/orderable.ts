import { isLaunchCityKey } from "./launchCities";
import { isPilotShop, type OrderSettings } from "./orderSettings";
import { type CapabilityShop, shopCapabilities } from "./shopCapabilities";

/** What this reads off the shop; `Shop` (payload-types) satisfies it at depth 0. */
export interface OrderableShop extends CapabilityShop {
	ordersRestrictedAt?: string | Date | null;
	orderSettings?: { codEnabled?: boolean | null } | null;
	location?: { city?: string | null } | null;
}

/** What this reads off the product; `Product` (payload-types) satisfies it at depth 0. */
export interface OrderableProduct {
	delivery?: { codAllowed?: boolean | null } | null;
}

export interface IsListingOrderableInput {
	listingStatus: string | null | undefined;
	shopId: string | null;
	shop: OrderableShop | null;
	product: OrderableProduct | null;
	/**
	 * `isProductAvailable`'s own result, already computed and stored on the
	 * listing's `productSummary.available` by `deriveListingData`
	 * (lib/productListing.ts) whenever the product or its variants change —
	 * recomputing it here would be the second implementation of that rule,
	 * not the first implementation of this one.
	 */
	productAvailable: boolean | null;
	settings: OrderSettings;
	now?: Date;
}

/**
 * The one implementation of "can a buyer actually order this listing right
 * now". Mirrors, clause for clause, the checks `assertCheckoutPreconditions`
 * (services/checkout.ts) and `orderabilityReason` (services/cart.ts) already
 * enforce at checkout and in the cart — a listing this reports as orderable
 * must never fail one of those for a reason this function could have caught.
 *
 * Pure and synchronous on purpose: the caller (the `listings.orderable`
 * virtual, derived in `Listings.ts`'s `beforeRead`) does every query —
 * `getOrderSettings`, the shop, the product — and hands the plain results in,
 * so this stays a single, trivially testable decision table instead of a
 * second place that knows how to fetch a shop.
 */
export function isListingOrderable(input: IsListingOrderableInput): boolean {
	const {
		settings,
		shopId,
		shop,
		product,
		productAvailable,
		listingStatus,
		now = new Date(),
	} = input;

	// 1. The feature flag (assertCheckoutPreconditions #1).
	if (!settings.enabled) return false;

	// 2. The listing itself must be visible to a buyer.
	if (listingStatus !== "published") return false;

	if (!shopId || !shop) return false;

	// 3. The shop must be active and its level must grant COD — the same
	// question assertCheckoutPreconditions #6 asks via `capabilities.codOrders`,
	// asked once here instead of duplicating it as a separate raw
	// `shop.status === "active"` check: today those two are always the same
	// answer, and a second check that can never independently fail is exactly
	// the kind of test that would pass for the wrong reason.
	if (!shopCapabilities(shop, now).codOrders) return false;

	// 4. The shop must not be restricted (assertCheckoutPreconditions #5).
	if (shop.ordersRestrictedAt) return false;

	// 5. COD must be enabled for the shop (assertCheckoutPreconditions #6).
	if (shop.orderSettings?.codEnabled !== true) return false;

	// 6. The shop's city must be one of the settings' current launch cities
	// (cart.ts's `orderabilityReason` "cityNotLaunch").
	const city = shop.location?.city;
	if (
		!city ||
		!isLaunchCityKey(city) ||
		!settings.launchCities.some((entry) => entry.key === city)
	) {
		return false;
	}

	// 7. The product must not forbid COD (cart.ts's "codNotAllowed").
	if (product?.delivery?.codAllowed === false) return false;

	// 8. At least one live variant must be purchasable (cart.ts's purchasability
	// signal, "variantArchived"/out-of-stock collapsed to one boolean here).
	if (productAvailable !== true) return false;

	// 9. The shop must be a pilot shop when the pilot list is non-empty
	// (assertCheckoutPreconditions #7).
	if (!isPilotShop(settings, shopId)) return false;

	return true;
}
