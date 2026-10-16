import {
	type CheckoutAddressValues,
	checkoutAddressSchema,
	DISTRICTS,
} from "~/lib/checkout-form";
import type { AddressInput } from "~/types/order";
import {
	addressPatchFromPlace,
	preselectedAddress,
	SAVED_ADDRESS_LABEL_MAX,
	SAVED_ADDRESS_LIMIT,
	type SavedAddress,
	type SuggestionCity,
	savedAddressInput,
	savedAddressLabelValid,
	sortSavedAddresses,
} from "../../../api/src/contracts/deliveryAddress";

export type {
	SavedAddress,
	SavedAddressListResponse,
} from "../../../api/src/contracts/deliveryAddress";
export {
	addressPatchFromPlace,
	preselectedAddress,
	SAVED_ADDRESS_LABEL_MAX,
	SAVED_ADDRESS_LIMIT,
	savedAddressLabelValid,
	sortSavedAddresses,
};

/** What a saved address sends to the checkout routes. */
export function savedAddressToInput(address: SavedAddress): AddressInput {
	return savedAddressInput(address);
}

export function savedAddressValues(
	address: SavedAddress,
): CheckoutAddressValues {
	return {
		recipientName: address.recipientName,
		phone: address.phone,
		city: address.city,
		district: address.district,
		districtOther: address.districtOther ?? "",
		landmark: address.landmark ?? "",
		instructions: address.instructions ?? "",
		gps: address.gps
			? {
					lat: address.gps.lat,
					lng: address.gps.lng,
					...(address.gps.accuracyMeters !== null
						? { accuracyMeters: address.gps.accuracyMeters }
						: {}),
				}
			: undefined,
	};
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
 * the shop is in a served one, and valid under the delivery rules today (a
 * city may have closed since it was saved).
 */
export function savedAddressUsable(
	address: SavedAddress,
	{
		cityKeys,
		servedCity,
		phonePattern,
	}: {
		cityKeys: readonly string[];
		servedCity: string | null;
		phonePattern: RegExp;
	},
): boolean {
	if (servedCity !== null && address.city !== servedCity) return false;
	return checkoutAddressSchema(
		cityKeys,
		"seller_delivery",
		phonePattern,
	).safeParse(savedAddressValues(address)).success;
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

export function districtLabelOf(
	address: Pick<SavedAddress, "city" | "district" | "districtOther">,
): string {
	return (
		address.districtOther ??
		DISTRICTS[address.city]?.find((d) => d.key === address.district)?.label ??
		address.district
	);
}
