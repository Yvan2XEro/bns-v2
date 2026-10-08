import type { LaunchCityKey } from "../lib/launchCities";
import type { ShopLocation } from "../payload-types";

export type PublicDeliveryCities = { deliveryCities: LaunchCityKey[] };

export function deliveryCitiesRequest(shopId: string) {
	return {
		queryKey: ["shops", shopId, "delivery-cities"] as const,
		path: `/api/public/shops/${encodeURIComponent(shopId)}/delivery-cities`,
	};
}

export type PublicPickupPoint = Pick<
	ShopLocation,
	"id" | "name" | "city" | "district" | "landmark" | "gps" | "openingHours"
> & {
	address: string | null;
	openingHoursNote: string | null;
	pickupFee: number;
	holdDays: number;
	preparationHours: number;
	phone?: string;
};

export function pickupPointsRequest(handle: string) {
	return {
		queryKey: ["shops", handle, "pickup-points"] as const,
		path: `/api/public/shops/${encodeURIComponent(handle)}/pickup-points`,
	};
}

const weekdayOffset = {
	mon: 0,
	tue: 1,
	wed: 2,
	thu: 3,
	fri: 4,
	sat: 5,
	sun: 6,
};

export function pickupHours(
	hours: ShopLocation["openingHours"],
	locale: string,
): string[] {
	const formatter = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		timeZone: "UTC",
	});
	return (hours ?? []).map((row) => {
		const day = formatter.format(
			new Date(Date.UTC(2026, 0, 5 + weekdayOffset[row.day])),
		);
		return `${day}: ${row.opens}-${row.closes}`;
	});
}
