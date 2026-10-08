import { isLaunchCityKey } from "../../lib/launchCities";
import { cityDeliveryFee } from "../../lib/orderSettings";
import type { DeliveryOption, DeliveryQuoteInput } from "../deliveryQuote";

/**
 * P4's flat-fee implementation. P7 replaces this body behind the same
 * signature — the plan names this exact seam — once real courier quotes
 * exist, so nothing downstream should need to change when it does.
 */
export async function flatQuote(
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
