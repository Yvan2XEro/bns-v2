export const PURCHASE_ORDER_STATUSES = [
	"sent",
	"accepted",
	"shipped",
	"delivered",
	"cancelled",
	"returned",
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export interface PurchaseOrderListRow {
	id: string;
	number: string;
	status: PurchaseOrderStatus;
	sentAt: string;
	acceptBy: string;
	shipBy: string | null;
	counterparty: { id: string; name: string; handle: string | null };
	items: Array<{ title: string; quantity: number; imageUrl?: string | null }>;
	collectAmount: number;
	supplierAmount: number | null;
	deliveryArea?: { district: string | null; city: string | null };
}

export interface PurchaseOrderPage {
	docs: PurchaseOrderListRow[];
	page: number;
	totalDocs: number;
	totalPages: number;
}

/**
 * « À expédier aujourd'hui »: an accepted purchase order whose handling
 * deadline (`shipBy`, set on acceptance from the products' handling hours)
 * falls before the end of the supplier's local day — overdue ones included.
 * A purchase order not yet accepted has no deadline and is not counted.
 */
export function isDueToday(
	row: { status: string; shipBy?: string | null },
	endOfToday: Date,
): boolean {
	if (row.status !== "accepted" || !row.shipBy) return false;
	const shipBy = Date.parse(row.shipBy);
	return Number.isFinite(shipBy) && shipBy < endOfToday.getTime();
}

/**
 * What the supplier may know of the reseller behind a purchase order: the
 * reseller shop's public identity and the customer order number printed on the
 * delivery note. Never the end customer's details.
 */
export interface PurchaseOrderResellerCard {
	shopId: string;
	name: string;
	handle: string;
	phone: string | null;
	level: number;
	orderNumber: string | null;
	orderedAt: string | null;
	/** From the reseller's location opening hours; null when none are filed. */
	reachable: { from: string; to: string } | null;
}

/** Party-safe JSON projection returned by GET /api/purchase-orders/{id}. */
export interface PurchaseOrderView {
	id: string;
	number: string;
	order: string | { id: string };
	supplierShop: string | { id: string };
	resellerShop: string | { id: string };
	link: string | { id: string };
	status: PurchaseOrderStatus;
	paymentMethod: "cod" | "mobile_money";
	items: Array<{
		id?: string | null;
		orderItem: string | { id: string };
		variant: string | { id: string };
		title: string;
		variantLabel?: string | null;
		sku?: string | null;
		quantity: number;
		supplierUnitPrice: number;
		resellerUnitPrice: number;
	}>;
	supplierAmount: number | null;
	deliveryFee: number;
	collectAmount: number;
	platformCommission: number | null;
	resellerCommission: number | null;
	branding: {
		name: string;
		handle: string;
		logo?: string | { id: string } | null;
		phone?: string | null;
	};
	sentAt: string;
	acceptBy: string;
	acceptedAt?: string | null;
	shipBy?: string | null;
	tracking?: {
		carrier?: "own_courier" | "yango" | "other" | null;
		trackingNumber?: string | null;
		trackingUrl?: string | null;
		shipment?: string | { id: string } | null;
	};
	cancellation?: {
		by?: "supplier" | "reseller" | "buyer" | "system" | "staff" | null;
		reason?: string | null;
		note?: string | null;
		at?: string | null;
	};
	statusHistory?: Array<{ status: string; at: string }> | null;
	return?: {
		reason?: string | null;
		liability?: "supplier" | "reseller" | "buyer" | null;
		failedDeliveryCost?: number | null;
		receivedAt?: string | null;
		condition?: "resellable" | "damaged" | null;
	};
	delivery: {
		recipientName: string;
		phone: string;
		phoneMasked: boolean;
		city: string | null;
		district: string | null;
		landmark: string | null;
		instructions: string | null;
		gps: { lat: number; lng: number } | null;
	};
	reseller?: PurchaseOrderResellerCard;
}

export type PurchaseOrderAction =
	| { purchaseOrderId: string; action: "accept" }
	| {
			purchaseOrderId: string;
			action: "cancel";
			body: {
				reason:
					| "seller_out_of_stock"
					| "seller_cannot_deliver"
					| "seller_other";
				note?: string;
			};
	  }
	| {
			purchaseOrderId: string;
			action: "ship";
			body: {
				carrier: "own_courier" | "yango" | "other";
				trackingNumber?: string;
				trackingUrl?: string;
			};
	  }
	| { purchaseOrderId: string; action: "handover"; body: { code: string } }
	| {
			purchaseOrderId: string;
			action: "declare-delivered";
			body: { note?: string; photoId?: string };
	  }
	| {
			purchaseOrderId: string;
			action: "delivery-failed";
			body: {
				reason:
					| "refused"
					| "unreachable"
					| "absent"
					| "address_not_found"
					| "timeout"
					| "other";
				failedDeliveryCost: number;
				note?: string;
			};
	  }
	| {
			purchaseOrderId: string;
			action: "return-received";
			body: { condition: "resellable" | "damaged" };
	  };
