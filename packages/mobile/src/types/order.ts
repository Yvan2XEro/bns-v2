/**
 * The order, cart, checkout and billing shapes the API actually serves.
 *
 * Every interface below is transcribed from the landed backend, not from the
 * phase plan's "API contracts" section: where the two disagree the server is
 * the authority (AGENTS.md — "never let a client copy drift from it"), and
 * they disagree in several places. The divergences are recorded in
 * `.superpowers/sdd/2026-09-15-p4-cod-orders/task-36-report.md`; the sources
 * are `packages/api/src/services/orders/serialize.ts` and `queries.ts`
 * (orders), `services/cart.ts` (cart), `services/checkout.ts` and
 * `services/deliveryQuote.ts` (checkout), `lib/orderContract.ts` (the
 * contract snapshot) and `services/commission.ts` (billing).
 */
import type { ErrorCode } from "../lib/apiError";
import type { OrderStatusName } from "../lib/orderStatus";

export type { OrderStatusName, ShopOrderTab } from "../lib/orderStatus";

/** The plan's name for `OrderStatusName`; one union, two spellings of it. */
export type OrderStatus = OrderStatusName;

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
export type ConfirmationRequired = "none" | "sms_code" | "seller_call";
export type ConfirmationMethod = "verified_phone" | "sms_code" | "seller_call";
export type HandoverMethod =
	| "otp"
	| "buyer_confirmation"
	| "seller_declaration";
export type CompletionHold = "none" | "return_case" | "dispute";

/**
 * `blocked` never reaches `order.risk.phoneTier` — a blocked buyer cannot
 * place the order in the first place — but it is a real tier elsewhere in the
 * phase, so the union carries all five.
 */
export type BuyerTier = "new" | "regular" | "trusted" | "watch" | "blocked";

/** One caller has exactly one standing on one order (`access/orderAccess.ts`). */
export type OrderAudienceKind = "buyer" | "shop" | "staff";

export type DeliveryFailureReason =
	| "refused"
	| "unreachable"
	| "absent"
	| "address_not_found"
	| "timeout"
	| "other";

export type OrderActorType =
	| "buyer"
	| "seller"
	| "staff"
	| "system"
	| "courier";

// --- Cart -----------------------------------------------------------------

export interface CartLineView {
	id: string;
	listingId: string;
	productId: string;
	variantId: string;
	shopId: string;
	title: string;
	quantity: number;
	priceAtAdd: number;
	/** Null only when the listing or variant can no longer be read at all. */
	currentPrice: number | null;
	priceChanged: boolean;
	unavailable: boolean;
	unavailableCode: ErrorCode | null;
	/** Set only when `unavailableCode` is `cart.outOfStock`. */
	maxQuantity: number | null;
}

export interface CartView {
	id: string | null;
	shopId: string | null;
	lines: CartLineView[];
	subtotal: number;
	itemCount: number;
	hasUnavailable: boolean;
}

// --- Checkout -------------------------------------------------------------

export interface PickupPointSnapshot {
	address: string | null;
	landmark: string | null;
	gps: { lat: number | null; lng: number | null } | null;
	hours: string | null;
}

export interface DeliveryOption {
	/** `seller_delivery:{city}` or `pickup:{shopId}`. */
	optionId: string;
	method: DeliveryMethod;
	fee: number;
	etaText: string;
	codAllowed: boolean;
	pickupPoint?: PickupPointSnapshot;
}

/** What a checkout form submits; `phone` is normalised server-side. */
export interface AddressInput {
	recipientName: string;
	phone: string;
	city: string;
	district: string;
	districtOther?: string;
	landmark?: string;
	instructions?: string;
	gps?: { lat: number; lng: number; accuracyMeters?: number };
}

/** What the quote echoes back, every optional field resolved to null. */
export interface DeliveryAddress {
	recipientName: string;
	phone: string;
	city: string;
	district: string;
	districtOther: string | null;
	landmark: string | null;
	instructions: string | null;
	gps: { lat: number; lng: number; accuracyMeters: number | null } | null;
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
	amounts: {
		subtotal: number;
		deliveryFee: number;
		discount: 0;
		buyerProtectionFee: 0;
		total: number;
		currency: "XAF";
	};
	terms: { fr: string[]; en: string[] };
	withdrawal: {
		days: number;
		howTo: { fr: string; en: string };
		costs: { fr: string; en: string };
	};
	salesTerms: { fr: string; en: string };
	complaints: { fr: string; en: string };
}

export interface QuoteSummaryItem {
	lineId: string;
	listingId: string;
	variantId: string;
	title: string;
	variantLabel: string;
	condition: string | null;
	imageUrl: string | null;
	unitPrice: number;
	quantity: number;
	lineSubtotal: number;
}

export interface QuoteResponse {
	summary: {
		shopId: string;
		items: QuoteSummaryItem[];
		subtotal: number;
		deliveryFee: number;
		total: number;
		paymentMethod: "cod";
		delivery: {
			optionId: string;
			method: DeliveryMethod;
			etaText: string;
			address: DeliveryAddress;
		};
	};
	preContract: ContractSnapshot;
	confirmationRequired: ConfirmationRequired;
	quoteHash: string;
}

export interface QuoteInput {
	address: AddressInput;
	deliveryOptionId: string;
	paymentMethod: PaymentMethod;
	locale?: "fr" | "en";
}

export interface PlaceInput extends QuoteInput {
	quoteHash: string;
	termsAccepted: true;
}

export interface PlaceResponse {
	orderId: string;
	orderNumber: string;
	status: OrderStatus;
	confirmationRequired: ConfirmationRequired;
}

// --- Orders ---------------------------------------------------------------

export interface OrderAmounts {
	subtotal?: number | null;
	deliveryFee?: number | null;
	discount?: number | null;
	buyerProtectionFee?: number | null;
	total?: number | null;
	currency?: string | null;
}

export interface OrderDeadlines {
	confirmBy?: string | null;
	acceptBy?: string | null;
	staleAt?: string | null;
	completeAt?: string | null;
	withdrawalUntil?: string | null;
}

export interface OrderTimestamps {
	placedAt?: string | null;
	confirmedAt?: string | null;
	acceptedAt?: string | null;
	shippedAt?: string | null;
	deliveredAt?: string | null;
	completedAt?: string | null;
	cancelledAt?: string | null;
	failedAt?: string | null;
}

export interface OrderItemView {
	id: string;
	lineNumber: number | null;
	product: string;
	variant: string;
	sourcing: string | null;
	fulfillingShop: string;
	snapshot: {
		title: string | null;
		variantLabel: string | null;
		sku: string | null;
		imageUrl: string | null;
		categoryId: string | null;
		condition: string | null;
		returnPolicy: string | null;
	};
	unitPrice: number;
	quantity: number;
	lineSubtotal: number | null;
	fulfillmentStatus: FulfillmentStatus;
	/** Shop audience with `payments.view` only. */
	commissionRateBps?: number | null;
	commissionAmount?: number | null;
}

/** One timeline row, already filtered to this audience's visibility. */
export interface OrderEventView {
	id: string;
	type: string;
	actorType: OrderActorType | null;
	statusFrom: string | null;
	statusTo: string | null;
	paymentStatusFrom: string | null;
	paymentStatusTo: string | null;
	reason: string | null;
	note: string | null;
	createdAt: string;
}

export interface OrderDeliveryView {
	method: DeliveryMethod | null;
	recipientName: string;
	/** Masked for a shop or staff viewer once a terminal order has aged 30 days. */
	phone: string;
	city: string | null;
	district: string | null;
	districtOther: string | null;
	landmark: string | null;
	instructions: string | null;
	etaText: string | null;
}

export interface OrderCancellationView {
	by?: string | null;
	reason?: string | null;
	note?: string | null;
}

export interface OrderDeliveryFailureView {
	reason?: DeliveryFailureReason | null;
	attempts?: number | null;
	note?: string | null;
}

/**
 * The widest of the three projections (`serializeOrderForBuyer` /
 * `ForShop` / `ForStaff`). `buyer` and `risk` are absent for the buyer's own
 * view and `commission` is absent for anyone without `payments.view`, so all
 * three are optional here rather than nullable: a screen must check for the
 * key, not for a null.
 */
export interface OrderView {
	id: string;
	orderNumber: string;
	shop: string;
	status: OrderStatus;
	paymentMethod: PaymentMethod;
	paymentStatus: PaymentStatus;
	delivery: OrderDeliveryView;
	amounts: OrderAmounts;
	deadlines: OrderDeadlines;
	timestamps: OrderTimestamps;
	cancellation: OrderCancellationView | null;
	deliveryFailure: OrderDeliveryFailureView | null;
	completionHold: CompletionHold | null;
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
	items: OrderItemView[];
	events: OrderEventView[];
	/** Shop and staff audiences. */
	buyer?: string | null;
	risk?: { phoneTier: BuyerTier } | null;
	/** Shop audience with `payments.view`. */
	commission?: { rateBps: number | null; amount: number | null };
}

export interface OrderListEntry {
	id: string;
	orderNumber: string;
	shop: string;
	status: OrderStatus;
	paymentStatus: PaymentStatus;
	total: number | null;
	currency: string | null;
	createdAt: string;
}

export interface OrderPage {
	docs: OrderListEntry[];
	nextCursor: string | null;
}

export interface ShopOrderPage extends OrderPage {
	counts: Record<
		"to_accept" | "to_ship" | "shipped" | "delivered" | "cancelled" | "failed",
		number
	>;
}

export type SellerEndReason =
	| "seller_out_of_stock"
	| "seller_cannot_deliver"
	| "seller_buyer_unreachable"
	| "seller_other";

export type BuyerCancelReason =
	| "buyer_changed_mind"
	| "buyer_ordered_by_mistake";

export interface WithdrawalInput {
	items: Array<{ orderItemId: string; quantity: number }>;
	reasonText?: string | null;
}

export interface WithdrawalResponse {
	caseNumber: string;
	caseId: string;
}

/** `POST /api/orders/{id}/handover-code/regenerate` hands the buyer the new
 * code in plaintext — the only code route that ever does. */
export interface HandoverCodeResponse {
	code: string;
}

/**
 * What the handover route adds to its 400/409 body on a wrong or exhausted
 * code. It is the only place a client learns the lock state, because
 * `order.handover` is not part of any order projection.
 */
export interface HandoverFailureData {
	handover?: { locked?: boolean };
	attemptsLeft?: number;
}

// --- Billing --------------------------------------------------------------

export interface InvoiceLineView {
	orderNumber: string;
	baseAmount: number;
	amount: number;
	kind: "charge" | "credit" | "carry_over";
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
	lines: InvoiceLineView[];
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

// --- The shop's own order settings ----------------------------------------

/**
 * The `orderSettings` group of `collections/Shops.ts`, which is what
 * `GET /api/shops/{id}` serves and `PATCH /api/shops/{id}` accepts. There is
 * no dedicated order-settings route in the landed backend, and nothing
 * publishes the shop's COD caps or the city's default fee next to it — see
 * the report's plan-defect note.
 */
export interface ShopOrderSettings {
	codEnabled?: boolean | null;
	sellerDeliveryEnabled?: boolean | null;
	deliveryFee?: number | null;
	deliveryEtaText?: string | null;
	pickupEnabled?: boolean | null;
	pickupPoint?: {
		address?: string | null;
		landmark?: string | null;
		gps?: { lat?: number | null; lng?: number | null } | null;
		hours?: string | null;
	} | null;
	salesTermsExtra?: string | null;
}

/** One entry of `GET /api/public/config`'s `launchCities`. */
export interface LaunchCityOption {
	key: string;
	label: string;
	fee: number;
}
