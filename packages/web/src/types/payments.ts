import type {
	ConnectedAccountStatus,
	HoldCategory,
	NameMatchVerdict,
	PayoutAccountStatus,
	PayoutMethod,
	PayoutStatus,
} from "~/lib/payment-status";

/**
 * Wire shapes for `GET /api/shops/{id}/payments`,
 * `GET /api/shops/{id}/payments/payouts/{payoutId}` and
 * `GET /api/shops/{id}/payments/setup` — pinned to
 * `SellerPaymentsView`/`SellerPayoutDetail`/`PaymentSetupView` in
 * `packages/api/src/services/{sellerPayments,connectedAccounts}.ts`
 * field-for-field. `holds[]` carries a category only, never an amount or an
 * order id (the contract change that would add either is parked).
 */
export interface SellerPaymentAmounts {
	awaitingDelivery: number;
	inWithdrawalPeriod: number;
	/** Null under `provider_schedule`: the provider pays out on its own
	 * schedule, which is not the same thing as "nothing is ready". */
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

export interface SellerPaymentOrderRow {
	orderId: string;
	orderNumber: string;
	goods: number;
	delivery: number;
	commissionHt: number;
	vat: number;
	netToYou: number;
	status: string;
	releaseDate: string | null;
}

export interface PaymentHoldView {
	scope: "shop" | "order";
	reasonCategory: HoldCategory;
	until: string | null;
}

export interface SellerPaymentsView {
	amounts: SellerPaymentAmounts;
	payouts: SellerPayoutRow[];
	orders: SellerPaymentOrderRow[];
	holds: PaymentHoldView[];
}

export interface SellerPayoutDetail extends SellerPayoutRow {
	currency: string;
	orders: Array<{ orderId: string; orderNumber: string; amount: number }>;
	statusHistory: Array<{ status: string; at: string }>;
}

export interface ConnectedAccountView {
	status: ConnectedAccountStatus;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	requirementsDue: string[];
	lastSyncedAt: string | null;
}

export interface PayoutAccountSummary {
	method: PayoutMethod;
	accountName: string;
	accountNumberMasked: string;
	status: PayoutAccountStatus;
	activatedAt: string | null;
}

export interface PendingPayoutAccountSummary {
	method: string;
	accountNumberMasked: string;
	status: string;
}

export interface PaymentSetupView {
	flagEnabled: boolean;
	eligible: boolean;
	ineligibleReason: null | "level" | "shopStatus" | "market";
	connectedAccount: ConnectedAccountView | null;
	payoutAccount: PayoutAccountSummary | null;
	pendingAccount: PendingPayoutAccountSummary | null;
	holds: PaymentHoldView[];
	changeCooldownUntil: string | null;
}

/** `POST /api/shops/{id}/payout-accounts` and the `not-me` route answer this. */
export interface PayoutAccountView {
	id: string;
	method: PayoutMethod;
	accountName: string;
	accountNumberMasked: string;
	status: PayoutAccountStatus;
	nameMatch: NameMatchVerdict | null;
	activatedAt: string | null;
	createdAt: string;
}
