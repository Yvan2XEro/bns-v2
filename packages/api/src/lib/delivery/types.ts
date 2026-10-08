export const COURIER_PROVIDER_IDS = ["manual", "yango", "campost"] as const;
export type CourierProviderId = (typeof COURIER_PROVIDER_IDS)[number];

export const SHIPMENT_STATUSES = [
	"pending",
	"picked_up",
	"in_transit",
	"delivered",
	"failed",
	"returned",
	"cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const FAILURE_REASONS = [
	"refused",
	"absent",
	"unreachable",
	"address_not_found",
	"rescheduled_by_buyer",
	"not_collected",
	"damaged",
	"other",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export interface CourierAddress {
	contactName: string;
	phone: string;
	city: string;
	district?: string;
	addressLine?: string;
	landmark?: string;
	gps?: { lat: number; lng: number };
}

export interface CourierQuoteParams {
	courierKey: string;
	scope: "same_city" | "intercity";
	origin: CourierAddress;
	destination: CourierAddress;
	parcel: { itemsCount: number; weightGrams: number; declaredValue: number };
	cod?: { amount: number; currency: "XAF" };
	readyAt: Date;
}

export interface CourierQuote {
	providerQuoteId?: string;
	amount: number;
	currency: "XAF";
	etaMinHours: number;
	etaMaxHours: number;
	expiresAt?: Date;
}

export interface CreateCourierShipmentParams extends CourierQuoteParams {
	reference: string;
	providerQuoteId?: string;
	callbackUrl: string;
	note?: string;
	storefrontName: string;
}

export interface CreateCourierShipmentResult {
	providerShipmentId: string;
	status: ShipmentStatus;
	trackingCode?: string;
	trackingUrl?: string;
}

export interface CourierStatusSnapshot {
	reference: string;
	providerShipmentId: string;
	providerStatus: string;
	status: ShipmentStatus | null;
	occurredAt: Date;
	rider?: { name: string; phone?: string; vehicle?: string };
	attempt?: { reason: FailureReason; note?: string };
	proof?: {
		podUrl?: string;
		recipientName?: string;
		gps?: { lat: number; lng: number };
	};
	codCollectedAmount?: number;
}

export interface CourierWebhookEvent extends CourierStatusSnapshot {
	providerEventId: string;
	type: string;
}

export interface CourierProvider {
	readonly id: CourierProviderId;
	readonly capabilities: {
		quote: boolean;
		webhooks: boolean;
		cancel: boolean;
		cod: boolean;
		intercity: boolean;
	};
	quote(params: CourierQuoteParams): Promise<CourierQuote>;
	create(
		params: CreateCourierShipmentParams,
	): Promise<CreateCourierShipmentResult>;
	cancel(params: {
		providerShipmentId: string;
		reason: string;
	}): Promise<{ cancelled: boolean; cancellationFee?: number }>;
	verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<CourierWebhookEvent>;
	getStatus(providerShipmentId: string): Promise<CourierStatusSnapshot>;
}
