import { isLaunchCityKey } from "../lib/launchCities";
import { cityDeliveryFee, type OrderSettings } from "../lib/orderSettings";
import type { Shop } from "../payload-types";

export interface QuoteItem {
	variantId: string;
	quantity: number;
	lineSubtotal: number;
	/** False when this item's product forbids cash on delivery. */
	codAllowed: boolean;
}

export interface PickupPointSnapshot {
	address: string | null;
	landmark: string | null;
	gps: { lat: number | null; lng: number | null } | null;
	hours: string | null;
}

export interface DeliveryOption {
	/** `seller_delivery:{city}` or `pickup:{shopId}` — stable for a given shop and city. */
	optionId: string;
	method: "seller_delivery" | "pickup";
	fee: number;
	etaText: string;
	codAllowed: boolean;
	pickupPoint?: PickupPointSnapshot;
}

export interface DeliveryQuoteInput {
	shop: Pick<Shop, "id" | "location" | "orderSettings">;
	items: readonly QuoteItem[];
	subtotal: number;
	destination: {
		city: string;
		district?: string;
		gps?: { lat: number; lng: number };
	};
	/** Unused by the P4 flat-fee implementation; kept for P7's own filtering. */
	method?: "seller_delivery" | "pickup";
	settings: OrderSettings;
}

/**
 * P4's flat-fee implementation. P7 replaces this body behind the same
 * signature — the plan names this exact seam — once real courier quotes
 * exist, so nothing downstream should need to change when it does.
 */
export async function quoteDelivery(
	input: DeliveryQuoteInput,
): Promise<DeliveryOption[]> {
	const options: DeliveryOption[] = [];
	const codAllowed = input.items.every((item) => item.codAllowed);
	const shopCity = input.shop.location?.city ?? null;
	const settings = input.shop.orderSettings;

	if (
		settings?.sellerDeliveryEnabled === true &&
		shopCity &&
		shopCity === input.destination.city
	) {
		// A shop outside the launch cities has no city default to fall back to;
		// `isListingOrderable` already keeps its listings unorderable, so the
		// zero here is a shape, never a fee a buyer is charged.
		const fee =
			settings.deliveryFee ??
			(isLaunchCityKey(shopCity)
				? cityDeliveryFee(input.settings, shopCity)
				: 0);
		options.push({
			optionId: `seller_delivery:${shopCity}`,
			method: "seller_delivery",
			fee,
			etaText: settings.deliveryEtaText ?? "",
			codAllowed,
		});
	}

	const pickupPoint = settings?.pickupPoint;
	if (settings?.pickupEnabled === true && pickupPoint?.address) {
		options.push({
			optionId: `pickup:${input.shop.id}`,
			method: "pickup",
			fee: 0,
			etaText: settings.deliveryEtaText ?? "",
			codAllowed,
			pickupPoint: {
				address: pickupPoint.address ?? null,
				landmark: pickupPoint.landmark ?? null,
				gps: pickupPoint.gps
					? {
							lat: pickupPoint.gps.lat ?? null,
							lng: pickupPoint.gps.lng ?? null,
						}
					: null,
				hours: pickupPoint.hours ?? null,
			},
		});
	}

	return options;
}
