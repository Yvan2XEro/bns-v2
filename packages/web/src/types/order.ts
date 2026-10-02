/**
 * The order, cart, checkout, billing and order-settings shapes the web client
 * reads off the API, transcribed from the P4 plan's "API contracts" section.
 *
 * Nothing here is derived or inferred: every field name, union member and
 * nullability below is the contract's own. The server stays the sole
 * authority on every transition and every amount — these are read models, and
 * no screen may compute a value the API already states (a cap, a commission,
 * a status label).
 *
 * `packages/api/src/services/orders/serialize.ts` is what actually answers
 * `GET /api/orders/{id}` today, and it does not yet produce this shape; see
 * Task 29's report for the field-by-field divergence. The contract is kept
 * here rather than the serialiser's current output because Tasks 30-35 are
 * written against the contract and Task 28 (the backend checkpoint) is the
 * step that reconciles the seam.
 */

import type { ShopOrderTab } from "~/lib/order-status";

export type OrderStatus =
	| "placed"
	| "confirmed"
	| "paid"
	| "accepted"
	| "shipped"
	| "delivered"
	| "completed"
	| "cancelled"
	| "delivery_failed"
	| "returned"
	| "disputed";

export type PaymentStatus =
	| "unpaid"
	| "awaiting_payment"
	| "paid"
	| "cod_pending"
	| "cod_collected"
	| "cod_refused"
	| "refunded"
	| "partially_refunded"
	| "failed";

export type FulfillmentStatus =
	| "unfulfilled"
	| "shipped"
	| "delivered"
	| "failed"
	| "cancelled"
	| "return_requested"
	| "returned";

export type DeliveryMethod = "seller_delivery" | "pickup";
export type PaymentMethod = "cod" | "mobile_money";
export type BuyerTier = "new" | "regular" | "trusted" | "watch" | "blocked";
export type ConfirmationRequired = "none" | "sms_code" | "seller_call";
export type OrderAudienceKind = "buyer" | "shop" | "staff";

export interface CartLineView {
	/** The array row id, which is what the line routes address. */
	id: string;
	listingId: string;
	productId: string;
	variantId: string;
	shopId: string;
	title: string;
	variantLabel: string;
	imageUrl: string | null;
	quantity: number;
	/** The price now, which is what the buyer will be charged. */
	unitPrice: number;
	priceAtAdd: number;
	priceChanged: boolean;
	lineSubtotal: number;
	available: boolean;
	/** Null when the variant is untracked. */
	maxQuantity: number | null;
}

export interface CartView {
	/** Null when the buyer has no active cart. */
	id: string | null;
	shop: {
		id: string;
		name: string;
		handle: string;
		city: string | null;
	} | null;
	lines: CartLineView[];
	subtotal: number;
	shopOrderable: boolean;
	currency: "XAF";
}

export interface PickupPointSnapshot {
	address: string;
	landmark: string | null;
	gps: { lat: number; lng: number } | null;
	hours: string | null;
}

export interface DeliveryOption {
	/** `"seller_delivery:douala"` or `"pickup:shop"`. */
	optionId: string;
	method: DeliveryMethod;
	fee: number;
	etaText: string;
	codAllowed: boolean;
	pickupPoint?: PickupPointSnapshot;
}

export interface AddressInput {
	recipientName: string;
	/** E.164, `^\+2376\d{8}$`. */
	phone: string;
	/** A launch city key. */
	city: string;
	/** `"douala.akwa"`, `"douala.other"`, … */
	district: string;
	districtOther?: string;
	/** Required for `seller_delivery`. */
	landmark?: string;
	gps?: {
		lat: number;
		lng: number;
		accuracyMeters?: number;
		capturedAt?: string;
	};
	instructions?: string;
}

export interface OrderAmounts {
	subtotal: number;
	deliveryFee: number;
	discount: 0;
	buyerProtectionFee: 0;
	total: number;
	currency: "XAF";
}

export interface ContractSnapshot {
	termsVersion: string;
	locale: "fr" | "en";
	seller: {
		name: string;
		handle: string;
		city: string | null;
		phone: string | null;
		rccm: string | null;
		niu: string | null;
	};
	platform: {
		legalName: string;
		role: "hosting_platform";
		supportEmail: string | null;
		supportPhone: string | null;
	};
	items: Array<{
		title: string;
		variantLabel: string;
		condition: string | null;
		imageUrl: string | null;
		attributes: Array<{ label: string; value: string }>;
		unitPrice: number;
		quantity: number;
		lineSubtotal: number;
	}>;
	amounts: OrderAmounts;
	terms: { fr: string[]; en: string[] };
	withdrawal: {
		days: number;
		howTo: { fr: string; en: string };
		costs: { fr: string; en: string };
	};
	/** The template plus the shop's `salesTermsExtra`. */
	salesTerms: { fr: string; en: string };
	complaints: { fr: string; en: string };
}

export interface QuoteResponse {
	summary: {
		lines: Array<{
			title: string;
			variantLabel: string;
			unitPrice: number;
			quantity: number;
			lineSubtotal: number;
			imageUrl: string | null;
		}>;
		amounts: OrderAmounts;
		paymentMethod: PaymentMethod;
		delivery: {
			method: DeliveryMethod;
			optionId: string;
			etaText: string;
			address: AddressInput;
			pickupPoint?: PickupPointSnapshot;
		};
	};
	preContract: ContractSnapshot;
	confirmationRequired: ConfirmationRequired;
	quoteHash: string;
}

export interface PlaceResponse {
	orderId: string;
	orderNumber: string;
	status: OrderStatus;
	confirmationRequired: ConfirmationRequired;
}

export interface OrderItemView {
	id: string;
	lineNumber: number;
	title: string;
	variantLabel: string;
	sku: string | null;
	imageUrl: string | null;
	unitPrice: number;
	quantity: number;
	lineSubtotal: number;
	fulfillmentStatus: FulfillmentStatus;
	returnPolicy: string | null;
	/** Shop audience with `payments.view` only. */
	commissionAmount?: number;
}

export interface OrderTimelineEntry {
	id: string;
	type: string;
	at: string;
	actorType: "buyer" | "seller" | "staff" | "system" | "courier";
	actorName: string | null;
	reason: string | null;
	note: string | null;
	metadata: Record<string, unknown> | null;
}

export interface OrderView {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	paymentStatus: PaymentStatus;
	paymentMethod: PaymentMethod;
	amounts: OrderAmounts;
	items: OrderItemView[];
	timeline: OrderTimelineEntry[];
	shop: {
		id: string;
		name: string;
		handle: string;
		logoUrl: string | null;
		city: string | null;
		phone: string | null;
	};
	/** Shop and staff audiences. */
	buyer?: { id: string | null; name: string | null };
	delivery: {
		method: DeliveryMethod;
		recipientName: string;
		phone: string;
		phoneMasked: boolean;
		city: string;
		district: string;
		districtOther: string | null;
		landmark: string | null;
		gps: { lat: number; lng: number; accuracyMeters: number | null } | null;
		instructions: string | null;
		etaText: string;
		fee: number;
		pickupPoint: PickupPointSnapshot | null;
	};
	deadlines: {
		confirmBy: string | null;
		acceptBy: string | null;
		staleAt: string | null;
		completeAt: string | null;
		withdrawalUntil: string | null;
		contestBy: string | null;
	};
	timestamps: {
		placedAt: string;
		confirmedAt: string | null;
		acceptedAt: string | null;
		shippedAt: string | null;
		deliveredAt: string | null;
		completedAt: string | null;
		cancelledAt: string | null;
		failedAt: string | null;
	};
	confirmation: {
		method: "verified_phone" | "sms_code" | "seller_call" | null;
		required: ConfirmationRequired;
		attemptsLeft: number;
		resendsLeft: number;
	};
	handover: {
		method: "otp" | "buyer_confirmation" | "seller_declaration" | null;
		locked: boolean;
		attemptsLeft: number;
		regenerationsLeft: number;
	};
	cancellation: { by: string; reason: string; note: string | null } | null;
	deliveryFailure: {
		reason: string;
		attempts: number;
		note: string | null;
	} | null;
	completionHold: "none" | "return_case" | "dispute";
	returnCaseNumber: string | null;
	conversationId: string | null;
	reviewable: boolean;
	/** Shop audience with `payments.view`, and staff. */
	commission?: { rateBps: number; amount: number };
	/** Shop and staff audiences. */
	risk?: { phoneTier: BuyerTier; refusalsAtPlacement: number };
}

export interface OrderListEntry {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	placedAt: string;
	total: number;
	itemCount: number;
	firstItemTitle: string;
	firstItemImageUrl: string | null;
	/** Buyer role. */
	shopName: string;
	/** Shop role. */
	recipientName?: string;
	/** Shop role. */
	acceptBy?: string | null;
	/** Shop role. */
	phoneTier?: BuyerTier;
	deliveryFailureReason?: string | null;
}

export interface OrderPage {
	docs: OrderListEntry[];
	nextCursor: string | null;
}

/**
 * `counts` keys off Task 7's `SHOP_ORDER_TABS`, imported rather than
 * restated: the six tabs are already a cross-package parity-tested table.
 */
export interface ShopOrderPage extends OrderPage {
	counts: Record<ShopOrderTab, number>;
}

export interface CommissionInvoiceView {
	id: string;
	invoiceNumber: string;
	periodStart: string;
	periodEnd: string;
	ordersCount: number;
	commissionTotal: number;
	vatAmount: number;
	totalDue: number;
	currency: "XAF";
	status: "issued" | "paid" | "overdue" | "waived" | "void";
	issuedAt: string;
	dueAt: string;
	paidAt: string | null;
	lines: Array<{
		orderNumber: string;
		baseAmount: number;
		amount: number;
		kind: "charge" | "credit" | "carry_over";
	}>;
}

export interface BillingView {
	invoices: CommissionInvoiceView[];
	currentPeriod: {
		periodStart: string;
		periodEnd: string;
		accrued: number;
		ordersCount: number;
	};
	restricted: { since: string; reason: "commission_overdue" | "staff" } | null;
}

export interface OrderSettingsView {
	codEnabled: boolean;
	sellerDeliveryEnabled: boolean;
	deliveryFee: number | null;
	deliveryEtaText: string | null;
	pickupEnabled: boolean;
	pickupPoint: PickupPointSnapshot | null;
	salesTermsExtra: string | null;
	caps: {
		maxOrderTotal: number;
		maxDailyOrders: number;
		maxOpenOrders: number;
	} | null;
	cityDefaultFee: number | null;
}
