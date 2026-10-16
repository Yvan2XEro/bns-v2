import {
	addressPatchFromPlace,
	preselectedAddress,
	SAVED_ADDRESS_LABEL_MAX,
	SAVED_ADDRESS_LIMIT,
	type SavedAddress,
	type SuggestionCity,
	savedAddressInput,
} from "../../../api/src/contracts/deliveryAddress";
import type { AddressInput } from "../types/order";
import {
	addressDefaults,
	type CheckoutAddressValues,
	checkoutAddressSchema,
	DISTRICTS,
} from "./checkoutForm";

export type {
	SavedAddress,
	SavedAddressListResponse,
} from "../../../api/src/contracts/deliveryAddress";
export {
	addressPatchFromPlace,
	preselectedAddress,
	SAVED_ADDRESS_LABEL_MAX,
	SAVED_ADDRESS_LIMIT,
};

/** What a saved address sends to the checkout routes. */
export function savedAddressToInput(address: SavedAddress): AddressInput {
	return savedAddressInput(address);
}

export function savedAddressValues(
	address: SavedAddress,
): CheckoutAddressValues {
	return addressDefaults(savedAddressToInput(address), null, null);
}

/**
 * The body for `POST`/`PATCH /api/me/addresses`. Every field is sent, cleared
 * ones as blanks, because the route patches only the keys it receives.
 */
export function savedAddressBody(
	address: AddressInput,
	extra: { label: string; isDefault?: boolean },
) {
	return {
		label: extra.label.trim(),
		recipientName: address.recipientName,
		phone: address.phone,
		city: address.city,
		district: address.district,
		districtOther: address.districtOther ?? "",
		landmark: address.landmark ?? "",
		instructions: address.instructions ?? "",
		gps: address.gps ?? null,
		...(extra.isDefault ? { isDefault: true } : {}),
	};
}

/**
 * Whether checkout can use a saved address as is: inside the shop's city when
 * the shop is in a served one, and valid under today's delivery rules.
 */
export function savedAddressUsable(
	address: SavedAddress,
	{
		cityKeys,
		servedCity,
	}: { cityKeys: readonly string[]; servedCity: string | null },
): boolean {
	if (servedCity !== null && address.city !== servedCity) return false;
	return checkoutAddressSchema(cityKeys, "seller_delivery").safeParse(
		savedAddressValues(address),
	).success;
}

/** The launch cities with their district tables, for geocoder suggestions. */
export function suggestionCities(
	launchCities: ReadonlyArray<{ key: string; label: string }>,
): SuggestionCity[] {
	return launchCities.map((city) => ({
		key: city.key,
		label: city.label,
		districts: DISTRICTS[city.key] ?? [],
	}));
}

/** "4.05123, 9.70210": the position line shown where web draws a map. */
export function coordinatesText(gps: { lat: number; lng: number }): string {
	return `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`;
}
