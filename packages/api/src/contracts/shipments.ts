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
	rider: null | { firstName: string; phone: string };
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
