/**
 * The contract's `PickupPointSnapshot`, and the one function that builds it.
 *
 * Both producers — the shop's `orderSettings.pickupPoint` group and
 * `quoteDelivery`'s own snapshot — store every field as optional and
 * nullable, while the shape a client is served promises an address. A point
 * without one is not a point, so this answers null for it rather than
 * handing out an empty string that a screen would render as a blank line.
 */
export interface PickupPointView {
	address: string;
	landmark: string | null;
	gps: { lat: number; lng: number } | null;
	hours: string | null;
}

export interface StoredPickupPoint {
	address?: string | null;
	landmark?: string | null;
	gps?: { lat?: number | null; lng?: number | null } | null;
	hours?: string | null;
}

export function pickupPointView(
	point: StoredPickupPoint | null | undefined,
): PickupPointView | null {
	if (!point?.address) return null;
	const lat = point.gps?.lat;
	const lng = point.gps?.lng;
	return {
		address: point.address,
		landmark: point.landmark ?? null,
		gps:
			typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null,
		hours: point.hours ?? null,
	};
}
