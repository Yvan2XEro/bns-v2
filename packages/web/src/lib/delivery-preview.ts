import type { LaunchCityOption } from "~/types/order";
import type { PublicDeliveryEstimates } from "../../../api/src/contracts/deliveryQuote";
import type {
	PublicDeliveryCities,
	PublicPickupPoint,
} from "../../../api/src/contracts/publicPickupPoint";

const fold = (value: string) =>
	value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/** The launch city a remembered place name or key stands for, if any. */
export function launchCityFor(
	name: string | null | undefined,
	launchCities: readonly LaunchCityOption[],
): LaunchCityOption | null {
	if (!name?.trim()) return null;
	const wanted = fold(name);
	return (
		launchCities.find(
			(city) => fold(city.key) === wanted || fold(city.label) === wanted,
		) ?? null
	);
}

export interface CartDeliveryPreview {
	/** The cheapest base fee of the shop's zones reaching the buyer's city. */
	delivery: { city: string; fromFee: number } | null;
	/** Cheapest pickup fee across the shop's pickup points; 0 is free. */
	pickupFromFee: number | null;
}

/**
 * The cart's "from" line per shop, read from the same public data as the
 * shop page's delivery box. It is a floor, never the charge: the checkout
 * quote decides, with the address and the method the buyer picks.
 */
export function cartDeliveryPreview(
	city: LaunchCityOption | null,
	cities: PublicDeliveryCities | undefined,
	pickups: readonly PublicPickupPoint[] | undefined,
): CartDeliveryPreview | null {
	const fees = city
		? cities?.deliveryFees.find((row) => row.city === city.key)
		: undefined;
	const delivery =
		city && fees ? { city: city.label, fromFee: fees.minFee } : null;
	const pickupFromFee = pickups?.length
		? Math.min(...pickups.map((point) => point.pickupFee))
		: null;
	if (!delivery && pickupFromFee === null) return null;
	return { delivery, pickupFromFee };
}

export type EtaPhrase = { unit: "hours" | "days"; value: number };

/** "sous 24 h" up to a day and a half, whole days above. */
export function etaPhrase(maxHours: number): EtaPhrase | null {
	if (!(maxHours > 0)) return null;
	if (maxHours <= 36) return { unit: "hours", value: Math.ceil(maxHours) };
	return { unit: "days", value: Math.ceil(maxHours / 24) };
}

/** The cheapest door delivery (shop or courier) the zones quote, if any. */
export function listingDeliveryEstimate(
	estimates: PublicDeliveryEstimates | undefined,
): { fee: number; eta: EtaPhrase | null } | null {
	const door = (estimates?.perMethod ?? []).filter(
		(option) => option.method !== "pickup",
	);
	if (door.length === 0) return null;
	const cheapest = door.reduce((best, option) =>
		option.cheapestFee < best.cheapestFee ? option : best,
	);
	return { fee: cheapest.cheapestFee, eta: etaPhrase(cheapest.etaMaxHours) };
}
