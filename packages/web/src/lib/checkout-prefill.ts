import {
	type CheckoutAddressValues,
	checkoutAddressSchema,
	toAddressInput,
} from "~/lib/checkout-form";
import type { AddressInput, OrderView } from "~/types/order";

/**
 * The API stores no address book, so the checkout starts from the address of
 * the buyer's latest order. Only the buyer's own view is read here, and the
 * buyer's phone is never masked to them; a masked one is dropped anyway.
 */
export function addressValuesFromOrder(
	delivery: OrderView["delivery"],
): CheckoutAddressValues {
	return {
		recipientName: delivery.recipientName,
		phone: delivery.phoneMasked ? "" : delivery.phone,
		city: delivery.city,
		district: delivery.district,
		districtOther: delivery.districtOther ?? "",
		landmark: delivery.landmark ?? "",
		instructions: delivery.instructions ?? "",
		gps: delivery.gps
			? {
					lat: delivery.gps.lat,
					lng: delivery.gps.lng,
					...(delivery.gps.accuracyMeters !== null
						? { accuracyMeters: delivery.gps.accuracyMeters }
						: {}),
				}
			: undefined,
	};
}

/**
 * The previous address, ready to quote with, when it would pass the address
 * form as is: under the delivery rules (the stricter ones, landmark
 * included) and inside the shop's own city when the shop is in a served one.
 * Otherwise null, and the buyer finishes the prefilled form instead. The
 * server still validates it again on every quote.
 */
export function reusableAddress(
	values: CheckoutAddressValues,
	{
		cityKeys,
		servedCity,
		phonePattern,
	}: {
		cityKeys: readonly string[];
		servedCity: string | null;
		phonePattern: RegExp;
	},
): AddressInput | null {
	if (servedCity !== null && values.city !== servedCity) return null;
	const parsed = checkoutAddressSchema(
		cityKeys,
		"seller_delivery",
		phonePattern,
	).safeParse(values);
	return parsed.success ? toAddressInput(parsed.data) : null;
}
