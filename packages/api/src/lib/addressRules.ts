import type { AddressCityRules } from "../contracts/deliveryAddress";
import {
	isMarketCityKey,
	isMarketDistrictKey,
	type MarketCity,
} from "./marketCities";

/** A Cameroonian mobile: the confirmation and handover codes travel by SMS
 * to this number, and a landline would leave them undeliverable. Both
 * clients hold the same pattern (`checkout-form-parity.int.spec.ts`). */
export const DELIVERY_PHONE_PATTERN = /^\+2376\d{8}$/;

/** The rules checkout's `parseDeliveryAddress` and the saved-address book share. */
export function marketAddressRules(
	cities: readonly MarketCity[],
): AddressCityRules {
	return {
		isCity: (key) => isMarketCityKey(cities, key),
		isDistrict: (city, district) => isMarketDistrictKey(cities, city, district),
		phonePattern: DELIVERY_PHONE_PATTERN,
	};
}
