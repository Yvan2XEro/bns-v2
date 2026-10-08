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
	items: Array<{ title: string; quantity: number }>;
	collectAmount: number;
	supplierAmount: number | null;
}

export interface PurchaseOrderPage {
	docs: PurchaseOrderListRow[];
	page: number;
	totalDocs: number;
	totalPages: number;
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
