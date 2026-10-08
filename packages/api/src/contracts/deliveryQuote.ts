import { z } from "zod";
import type { Order } from "../payload-types";

export const publicDeliveryEstimatesSchema = z.object({
	perMethod: z.array(
		z.object({
			method: z.enum(["seller_delivery", "courier", "pickup"]),
			cheapestFee: z.number().nonnegative(),
			etaMinHours: z.number().nonnegative(),
			etaMaxHours: z.number().nonnegative(),
		}),
	),
});
export type PublicDeliveryEstimates = z.infer<
	typeof publicDeliveryEstimatesSchema
>;

export type DeliveryMethod = NonNullable<
	NonNullable<Order["delivery"]>["method"]
>;
export interface PickupPointSnapshot {
	address: string | null;
	landmark: string | null;
	gps: { lat: number | null; lng: number | null } | null;
	hours: string | null;
	distanceMeters?: number;
}
export interface DeliveryOption {
	optionId: string;
	method: DeliveryMethod;
	fee: number;
	etaText: string;
	codAllowed: boolean;
	pickupPoint?: PickupPointSnapshot;
	zoneId?: string;
	pickupLocationId?: string;
	courierId?: string;
	courier?: { id: string; name: string; logoUrl?: string };
	etaMinHours?: number;
	etaMaxHours?: number;
	promisedBy?: string;
	freeApplied?: boolean;
	originalFee?: number;
	sourceUpdatedAt?: string;
}
export interface UnavailableOption {
	method: DeliveryMethod;
	reason: "cod_not_allowed" | "below_minimum" | "not_served";
	minOrderSubtotal?: number;
}
export interface DeliveryQuote {
	options: DeliveryOption[];
	unavailable: UnavailableOption[];
}
