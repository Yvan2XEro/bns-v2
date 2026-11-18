import type { ShopLocation } from "../payload-types";
import { districtLabel, isLaunchCityKey, LAUNCH_CITIES } from "./launchCities";

/**
 * "Rue Joffre, Akwa, Douala": a pickup point exactly as the shop page already
 * lists it publicly — the street when the shop gave one, else its landmark.
 */
export function publicAddressLine(
	location: Pick<ShopLocation, "address" | "landmark" | "district" | "city">,
): string {
	const district = location.district?.trim() ?? "";
	const city = isLaunchCityKey(location.city)
		? LAUNCH_CITIES[location.city].label
		: location.city;
	return [
		location.address?.trim() || location.landmark?.trim(),
		districtLabel(district) ?? district,
		city,
	]
		.filter(Boolean)
		.join(", ");
}

/** The calendar year the shop opened, for « Boutique depuis 2024 ». */
export function sinceYearOf(createdAt: unknown): number | null {
	if (typeof createdAt !== "string" || !createdAt) return null;
	const date = new Date(createdAt);
	return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}
