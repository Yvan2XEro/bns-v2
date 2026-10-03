/**
 * The order, cart, checkout and billing shapes the API serves.
 *
 * Every interface below is the P4 plan's "API contracts" section, which the
 * API now produces field for field —
 * `packages/api/src/services/orders/serialize.ts` (orders),
 * `services/cart.ts` (cart), `services/checkout.ts` (quote and place),
 * `services/deliveryQuote.ts` (delivery options) and `services/commission.ts`
 * (billing). `packages/web/src/types/order.ts` is the same contract in the
 * same words; the two clients describe one wire, and the field names below are
 * the wire's, not this package's.
 *
 * An earlier revision transcribed the serialiser's pre-contract shape instead
 * (`events`, `shop` as a bare id, item fields under `snapshot`, no
 * `confirmation`/`handover`); see
 * `.superpowers/sdd/2026-09-15-p4-cod-orders/fix-serializers-report.md` for
 * what moved and why.
 */
import type { OrderStatusName } from "../lib/orderStatus";
import type {
	ConnectedAccountStatus,
	HoldCategory,
	PaymentChannel,
	PaymentFailureCode,
	PaymentIntentStatus,
	PayoutAccountStatus,
	PayoutMethod,
	PayoutStatus,
} from "../lib/paymentStatus";

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

// --- Checkout -------------------------------------------------------------

export interface PickupPointSnapshot {
	address: string;
	landmark: string | null;
	gps: { lat: number; lng: number } | null;
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

/** What a checkout form submits, and what the quote echoes back. */
export interface AddressInput {
	recipientName: string;
	/** E.164, `^\+2376\d{8}$`; normalised server-side. */
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

export interface QuoteSummaryLine {
	title: string;
	variantLabel: string;
	unitPrice: number;
	quantity: number;
	lineSubtotal: number;
	imageUrl: string | null;
}

export interface QuoteResponse {
	summary: {
		lines: QuoteSummaryLine[];
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

export interface QuoteInput {
	address: AddressInput;
	deliveryOptionId: string;
	paymentMethod: PaymentMethod;
	locale?: "fr" | "en";
}

export interface PlaceInput extends QuoteInput {
	quoteHash: string;
	termsAccepted: true;
	/**
	 * One UUID per checkout attempt — the server requires it, and resolves a
	 * double-tap or a retried request to the first call's order. The web twin
	 * first shipped without it and every placement would have been refused.
	 */
	idempotencyKey: string;
}

export interface PlaceResponse {
	orderId: string;
	orderNumber: string;
	status: OrderStatus;
	confirmationRequired: ConfirmationRequired;
}

// --- Orders ---------------------------------------------------------------

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

/** One timeline row, already filtered to this audience's visibility. */
export interface OrderTimelineEntry {
	id: string;
	type: string;
	at: string;
	actorType: OrderActorType;
	/** Only ever a name this audience already holds: the buyer's own, the shop's own members', or — for staff alone — anyone's. */
	actorName: string | null;
	reason: string | null;
	note: string | null;
	metadata: Record<string, unknown> | null;
}

export interface OrderShopView {
	id: string;
	name: string;
	handle: string;
	logoUrl: string | null;
	city: string | null;
	phone: string | null;
}

export interface OrderDeliveryView {
	method: DeliveryMethod;
	recipientName: string;
	/** Masked for a shop or staff viewer once a terminal order has aged 30 days, which `phoneMasked` states rather than leaving a screen to detect. */
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
}

export interface OrderDeadlines {
	confirmBy: string | null;
	acceptBy: string | null;
	staleAt: string | null;
	completeAt: string | null;
	withdrawalUntil: string | null;
	contestBy: string | null;
}

export interface OrderTimestamps {
	placedAt: string;
	confirmedAt: string | null;
	acceptedAt: string | null;
	shippedAt: string | null;
	deliveredAt: string | null;
	completedAt: string | null;
	cancelledAt: string | null;
	failedAt: string | null;
}

export interface OrderConfirmationView {
	method: ConfirmationMethod | null;
	required: ConfirmationRequired;
	attemptsLeft: number;
	resendsLeft: number;
}

export interface OrderHandoverView {
	method: HandoverMethod | null;
	locked: boolean;
	attemptsLeft: number;
	regenerationsLeft: number;
}

export interface OrderCancellationView {
	by: string;
	reason: string;
	note: string | null;
}

export interface OrderDeliveryFailureView {
	reason: string;
	attempts: number;
	note: string | null;
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
	status: OrderStatus;
	paymentStatus: PaymentStatus;
	paymentMethod: PaymentMethod;
	amounts: OrderAmounts;
	items: OrderItemView[];
	timeline: OrderTimelineEntry[];
	shop: OrderShopView;
	delivery: OrderDeliveryView;
	deadlines: OrderDeadlines;
	timestamps: OrderTimestamps;
	confirmation: OrderConfirmationView;
	handover: OrderHandoverView;
	cancellation: OrderCancellationView | null;
	deliveryFailure: OrderDeliveryFailureView | null;
	completionHold: CompletionHold;
	returnCaseNumber: string | null;
	conversationId: string | null;
	reviewable: boolean;
	/** Shop and staff audiences. */
	buyer?: { id: string | null; name: string | null };
	/** Shop and staff audiences. */
	risk?: { phoneTier: BuyerTier; refusalsAtPlacement: number };
	/** Shop audience with `payments.view`. */
	commission?: { rateBps: number; amount: number };
}

export interface OrderListEntry {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	placedAt: string;
	total: number;
	/** Units, not rows. */
	itemCount: number;
	firstItemTitle: string;
	firstItemImageUrl: string | null;
	shopName: string;
	deliveryFailureReason?: string | null;
	/** Shop role. */
	recipientName?: string;
	/** Shop role. */
	acceptBy?: string | null;
	/** Shop role. */
	phoneTier?: BuyerTier;
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

// --- Protected payment (P5) -------------------------------------------------

/**
 * `POST /api/orders/{id}/payment-intents` — the plan's contracts section,
 * pinned whole-object server-side. `checkoutUrl` is optional and absent
 * today (neither `cm.mtn` nor `cm.orange` is a hosted-page channel); it is
 * forward-compatible plumbing for `src/lib/paymentFlow.ts`'s hosted-checkout
 * fallback, not a field the live API ever sends.
 */
export interface PaymentIntentResponse {
	intentId: string;
	status: "created" | "pending";
	expiresAt: string;
	channel: PaymentChannel;
	attempt: number;
	attemptsLeft: number;
	instructions: string | null;
	checkoutUrl?: string | null;
}

/** `GET /api/orders/{id}/payment`'s `intent`, whole-object pinned. */
export interface PaymentIntentStatusView {
	id: string;
	status: PaymentIntentStatus;
	channel: PaymentChannel;
	failureCode: PaymentFailureCode | null;
	expiresAt: string;
	attempt: number;
	attemptsLeft: number;
}

export interface PaymentStatusView {
	orderPaymentStatus: PaymentStatus;
	intent: PaymentIntentStatusView | null;
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
 * code. The order view's own `handover` block carries the same lock state and
 * attempt budget, so this is the immediate answer rather than the only one.
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

// --- Protected payment (seller) --------------------------------------------

/**
 * `holds[]` on both `SellerPaymentsView` and `PaymentSetupView` — category
 * only, never an amount or an order id (the owner sees the category, never
 * which order or how much; `services/connectedAccounts.ts`'s `holdsView`).
 */
export interface PaymentHoldView {
	scope: "shop" | "order";
	reasonCategory: HoldCategory;
	until: string | null;
}

export interface SellerPaymentsAmounts {
	awaitingDelivery: number;
	inWithdrawalPeriod: number;
	/** `null` under the `provider_schedule` release model: the provider pays
	 * out on its own schedule, which the screen must not read as zero. */
	readyForPayout: number | null;
	payoutInTransit: number;
	paidThisMonth: number;
	currency: string;
}

export interface SellerPayoutRow {
	id: string;
	date: string;
	amount: number;
	fee: number;
	destinationMasked: string;
	status: PayoutStatus;
}

export interface SellerPaymentsOrderRow {
	orderId: string;
	orderNumber: string;
	goods: number;
	delivery: number;
	commissionHt: number;
	vat: number;
	netToYou: number;
	status: OrderStatus;
	releaseDate: string | null;
}

/** `GET /api/shops/{id}/payments` — `services/sellerPayments.ts`'s `SellerPaymentsView`. */
export interface SellerPaymentsView {
	amounts: SellerPaymentsAmounts;
	payouts: SellerPayoutRow[];
	orders: SellerPaymentsOrderRow[];
	holds: PaymentHoldView[];
}

/** `GET /api/shops/{id}/payments/payouts/{payoutId}`. */
export interface SellerPayoutDetail extends SellerPayoutRow {
	currency: string;
	orders: Array<{ orderId: string; orderNumber: string; amount: number }>;
	statusHistory: Array<{ status: PayoutStatus; at: string }>;
}

/** `GET /api/shops/{id}/payments/setup` — `connectedAccounts.ts`'s `PaymentSetupView`. */
export interface PaymentSetupView {
	flagEnabled: boolean;
	eligible: boolean;
	ineligibleReason: null | "level" | "shopStatus" | "market";
	connectedAccount: null | {
		status: ConnectedAccountStatus;
		chargesEnabled: boolean;
		payoutsEnabled: boolean;
		requirementsDue: string[];
		lastSyncedAt: string | null;
	};
	payoutAccount: null | {
		method: PayoutMethod;
		accountName: string;
		accountNumberMasked: string;
		status: PayoutAccountStatus;
		activatedAt: string | null;
	};
	/** Loosely typed on the wire (a row mid-review, not yet the active one). */
	pendingAccount: null | {
		method: string;
		accountNumberMasked: string;
		status: string;
	};
	holds: PaymentHoldView[];
	changeCooldownUntil: string | null;
}

// --- The shop's own order settings ----------------------------------------

/**
 * The `orderSettings` group of `collections/Shops.ts`, which is what
 * `GET /api/shops/{id}` serves and `PATCH /api/shops/{id}` accepts. There is
 * no dedicated order-settings route in the landed backend, and nothing
 * publishes the shop's COD caps or the city's default fee next to it — see
 * the report's plan-defect note.
 */
/**
 * `GET /api/shops/{id}/order-settings` — the raw group plus the two figures
 * only the server can compute: the level's COD caps (admin overrides merged
 * in) and the launch city's default fee. Same shape as the web's.
 */
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
