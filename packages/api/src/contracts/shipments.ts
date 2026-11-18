import type { ShipmentStatus } from "../lib/delivery/types";
import type { Shipment } from "../payload-types";

export interface BuyerShipmentView {
	id: string;
	shipmentNumber: string;
	status: ShipmentStatus;
	method: "seller_delivery" | "courier" | "pickup";
	promisedBy: string | null;
	stepper: {
		readyAt: string | null;
		pickedUpAt: string | null;
		inTransitAt: string | null;
		terminalAt: string | null;
	};
	/** The phone never travels in the view: `POST /api/shipments/:id/rider-phone` reveals it while `canCall`. */
	rider: null | {
		firstName: string;
		vehicle: string | null;
		/** `courier` is a partner courier's rider, `shop` the shop's own delivery person. */
		kind: "courier" | "shop";
		canCall: boolean;
	};
	/** The courier provider's live arrival estimate, only while the parcel is out for delivery. */
	eta: string | null;
	attempts: Array<{
		number: number;
		reason: string;
		at: string;
	}>;
	redelivery: null | {
		scheduledFor: string;
		window: "morning" | "afternoon" | "evening";
		rescheduleBy: string;
	};
	pickup: null | {
		locationName: string;
		landmark: string;
		address: string | null;
		gps: { lat: number; lng: number };
		hours: string;
		pickupDeadline: string | null;
	};
	trackingUrl: string | null;
	proof: null | {
		handoverMethod: string;
		capturedAt: string;
		photoUrl: string | null;
		codeVerified: boolean;
	};
	timeline: Array<{ type: string; at: string }>;
	canReschedule: boolean;
}

export type ShipmentProofView = null | {
	handoverMethod: string;
	capturedAt: string;
	photoUrl: string | null;
	codeVerified: boolean;
};

export type ShopShipmentView = Omit<
	Shipment,
	"riderLink" | "courierCost" | "proof"
> & {
	riderLink: null | {
		createdAt: string | null;
		expiresAt: string | null;
		revokedAt: string | null;
		lastUsedAt: string | null;
	};
	proof: ShipmentProofView;
	timeline: Array<{ type: string; at: string }>;
	courierCost?: number | null;
};

export interface CourierShipmentView {
	id: string;
	shipmentNumber: string;
	status: Shipment["status"];
	storefrontName: string;
	destination: {
		recipientFirstName: string;
		phone: string | null;
		city: string;
		district: string | null;
		landmark: string | null;
		gps: { lat: number; lng: number } | null;
	};
	expectedCod: number | null;
	items: Array<{ title: string; quantity: number }>;
	attempts: Array<{
		number: number;
		reason: string;
		at: string;
		note?: string;
	}>;
	proof: ShipmentProofView;
	allowedActions: Array<
		"picked_up" | "in_transit" | "attempt" | "handover" | "returned"
	>;
}

export type ShipmentView =
	| BuyerShipmentView
	| ShopShipmentView
	| CourierShipmentView;

export type ShipmentStepStatus = Shipment["status"];

export interface RiderLinkView {
	shopName: string;
	shipmentNumber: string;
	origin: { landmark: string | null };
	destination: {
		recipientFirstName: string;
		phone: string | null;
		city: string;
		district: string | null;
		landmark: string | null;
		gps: { lat: number; lng: number } | null;
		mapsUrl: string | null;
	};
	expectedCod: number | null;
	items: Array<{ title: string; quantity: number }>;
	attempts: Array<{ number: number; reason: string; at: string }>;
	allowedActions: Array<"picked_up" | "attempt" | "handover" | "photo">;
}

/** One row of `GET /api/courier/shipments`. */
export interface CourierShipmentRow {
	id: string;
	shipmentNumber: string;
	status: Shipment["status"];
	courierId: string | null;
	origin: Shipment["origin"];
	destination: Shipment["destination"];
	codCollection: Shipment["codCollection"] | null;
	rider: Shipment["rider"] | null;
}

/** Out for delivery: the only statuses in which the buyer may reveal the rider's phone or read a live ETA. */
export const OUT_FOR_DELIVERY: readonly ShipmentStatus[] = [
	"picked_up",
	"in_transit",
];

export function isOutForDelivery(status: ShipmentStatus): boolean {
	return OUT_FOR_DELIVERY.includes(status);
}

export const RIDER_PHONE_LIMITS = [
	{ name: "rider-phone:hour", limit: 10, windowSeconds: 3600 },
	{ name: "rider-phone:day", limit: 30, windowSeconds: 86400 },
] as const;

/**
 * "15:40" — an arrival estimate as a wall clock; null when unreadable. Without
 * a `timeZone` it reads in the viewer's own clock: the buyer waiting for the
 * parcel is where it is delivered, whatever the market.
 */
export function arrivalClock(
	iso: string | null | undefined,
	timeZone?: string,
): string | null {
	if (!iso) return null;
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return null;
	return new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(at);
}
