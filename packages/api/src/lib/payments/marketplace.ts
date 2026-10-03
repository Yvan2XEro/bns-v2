import type {
	CreatePaymentParams,
	NormalizedPayment,
	NormalizedWebhookEvent,
	ProviderPaymentStatus,
} from "./types";

/**
 * The port every marketplace payment adapter implements. Services, routes and
 * jobs only ever see this interface (through the registry); no concrete
 * adapter exists in P5, and `FakeMarketplaceProvider` is the reference
 * implementation the contract spec runs against.
 *
 * Adapter obligations the types cannot carry:
 * - every call gives up after 15 s; a timeout, a network failure or a 5xx
 *   throws `ProviderUnavailableError`;
 * - a request the provider refuses (4xx) throws `ProviderRequestError`;
 * - an operation the provider cannot perform at all throws
 *   `ProviderCapabilityError`;
 * - a bad or missing webhook signature throws P0's `WebhookSignatureError`.
 */

export type ConnectedAccountStatus =
	| "created"
	| "onboarding"
	| "restricted"
	| "active"
	| "disabled"
	| "deauthorized";

/** `standard` is absent on purpose: its owner could change the payout schedule and defeat release control. */
export type ConnectedAccountType = "express" | "custom";

export type PayoutSchedule = "manual" | "daily" | "weekly" | "monthly";

/**
 * `created` is absent: a `refunds` row is `created` before it reaches the
 * provider, so no provider can report it.
 */
export type NormalisedRefundStatus =
	| "pending"
	| "processing"
	| "succeeded"
	| "failed";

/**
 * `scheduled` and `cancelled` are absent: both belong to a `payouts` row that
 * was never submitted. An adapter maps a provider-side cancellation of a
 * submitted transfer to `failed`, the only move the payouts table allows.
 */
export type NormalisedTransferStatus =
	| "pending"
	| "sent"
	| "processing"
	| "complete"
	| "failed"
	| "reversed";

export type NormalisedDebitStatus = "pending" | "succeeded" | "failed";

export type PaymentFailureCode =
	| "declined"
	| "insufficient_funds"
	| "timeout"
	| "limit_exceeded"
	| "invalid_number"
	| "provider_error";

export type MarketplaceEntity =
	| "payment"
	| "refund"
	| "transfer"
	| "account"
	| "debit";

export interface NormalisedAccount {
	accountId: string;
	status: ConnectedAccountStatus;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	/** The provider's `requirements.currently_due`. */
	requirementsDue: string[];
	kycStatus: string | null;
	/** The holder name the provider verified, when it exposes one. */
	kycName: string | null;
	payoutSchedule: PayoutSchedule | null;
}

export interface NormalisedPayment extends NormalizedPayment {
	failureCode: PaymentFailureCode | null;
	/** Provider collection fee, when reported. */
	fee: number | null;
	accountId: string | null;
}

export interface NormalisedRefund {
	refundId: string;
	/** Our reference of the refunded charge. */
	paymentReference: string;
	idempotencyKey: string | null;
	amount: number;
	currency: string;
	status: NormalisedRefundStatus;
	failureReason: string | null;
}

export interface NormalisedTransfer {
	transferId: string;
	accountId: string;
	/** Our reference, as passed to `releasePayout`; null for a transfer the provider scheduled itself. */
	reference: string | null;
	amount: number;
	currency: string;
	fee: number | null;
	status: NormalisedTransferStatus;
	failureReason: string | null;
}

interface TransactionBase {
	providerId: string;
	/** Our reference (charge, refund idempotency key, payout or debit reference) when the provider carries it. */
	reference: string | null;
	accountId: string | null;
	amount: number;
	currency: string;
	fee: number | null;
	/** ISO 8601, provider time. */
	occurredAt: string;
}

export type NormalisedTransaction =
	| (TransactionBase & { entity: "payment"; status: ProviderPaymentStatus })
	| (TransactionBase & { entity: "refund"; status: NormalisedRefundStatus })
	| (TransactionBase & {
			entity: "transfer";
			status: NormalisedTransferStatus;
	  })
	| (TransactionBase & { entity: "debit"; status: NormalisedDebitStatus });

/**
 * A payment event is a P0 event, so P0's intent settlement consumes it
 * unchanged. `type` is the normalised `{entity}/{status}` (an adapter maps
 * its provider's event names onto it in one table), and `reference` is ours
 * — empty when the provider did not echo it.
 */
export interface PaymentEvent extends NormalizedWebhookEvent {
	entity: "payment";
	accountId: string | null;
	fee: number | null;
	failureCode: PaymentFailureCode | null;
}

type NonPaymentEventBase = Omit<NormalizedWebhookEvent, "status">;

export interface RefundEvent extends NonPaymentEventBase {
	entity: "refund";
	status: NormalisedRefundStatus;
	refundId: string;
	/** Our reference of the refunded charge. */
	paymentReference: string;
	accountId: string | null;
	fee: number | null;
}

export interface TransferEvent extends NonPaymentEventBase {
	entity: "transfer";
	status: NormalisedTransferStatus;
	transferId: string;
	accountId: string;
	fee: number | null;
	failureReason: string | null;
}

export interface AccountEvent extends NonPaymentEventBase {
	entity: "account";
	status: ConnectedAccountStatus;
	accountId: string;
}

export interface DebitEvent extends NonPaymentEventBase {
	entity: "debit";
	status: NormalisedDebitStatus;
	debitId: string;
	accountId: string;
}

export type NormalisedEvent =
	| PaymentEvent
	| RefundEvent
	| TransferEvent
	| AccountEvent
	| DebitEvent;

export interface CreateConnectedAccountInput {
	shopId: string;
	name: string;
	email: string;
	phone: string;
	type: ConnectedAccountType;
}

export interface CreateDestinationChargeInput {
	/** Our reference: `PI-{intentId}`. */
	reference: string;
	/** `buyerTotal`; always `applicationFee + destination.amount`. */
	amount: number;
	currency: string;
	/** A fixed amount, never a percentage, so the ledger is exact. */
	applicationFee: number;
	destination: { accountId: string; amount: number };
	customer: CreatePaymentParams["customer"];
	description: string;
	callbackUrl: string;
}

export interface CreateRefundInput {
	paymentReference: string;
	amount: number;
	reason: string;
	/** `{sourceType}:{sourceId}:{sequence}`; a replay returns the same refund. */
	idempotencyKey: string;
}

export interface ListTransactionsInput {
	from: Date;
	to: Date;
	/** 1-based; an empty page means the window is exhausted. */
	page: number;
	/** Omitted: the platform's own transactions and every connected account's. */
	accountId?: string;
}

export interface MarketplaceProvider {
	readonly id: string;
	createConnectedAccount(
		input: CreateConnectedAccountInput,
	): Promise<{ accountId: string }>;
	createOnboardingLink(
		accountId: string,
		urls: { returnUrl: string; refreshUrl: string },
	): Promise<{ url: string }>;
	getConnectedAccount(accountId: string): Promise<NormalisedAccount>;
	setPayoutSchedule(accountId: string, schedule: PayoutSchedule): Promise<void>;
	createDestinationCharge(
		input: CreateDestinationChargeInput,
	): Promise<{ providerReference: string; checkoutUrl?: string }>;
	/** `channel` is a market channel key from `payments.markets` (e.g. `cm.mtn`). */
	chargeMobileMoney(
		reference: string,
		payer: { channel: string; phone: string },
	): Promise<{ status: ProviderPaymentStatus; action?: string }>;
	/** By our reference, as passed to `createDestinationCharge`. */
	verifyPayment(reference: string): Promise<NormalisedPayment>;
	/** `provider_hold` release model only. */
	releasePayout(
		accountId: string,
		payout: { amount: number; currency: string; reference: string },
	): Promise<{ transferId: string }>;
	createRefund(
		input: CreateRefundInput,
	): Promise<{ refundId: string; status: NormalisedRefundStatus }>;
	getRefund(refundId: string): Promise<NormalisedRefund>;
	getTransfer(transferId: string): Promise<NormalisedTransfer>;
	debitConnectedAccount(
		accountId: string,
		debit: { amount: number; reference: string; description: string },
	): Promise<{ debitId: string }>;
	listTransactions(
		input: ListTransactionsInput,
	): Promise<NormalisedTransaction[]>;
	getConnectedAccountBalance(
		accountId: string,
	): Promise<{ available: number; pending: number }>;
	verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<NormalisedEvent>;
	/** Re-reads a body `verifyWebhook` already accepted and P0 stored, as `processWebhookEvent` does. */
	parseWebhookEvent(raw: unknown): NormalisedEvent;
}

export type MarketplaceMethod = Exclude<keyof MarketplaceProvider, "id">;

/** What this adapter's provider cannot do; the matching setting must stay off. */
export class ProviderCapabilityError extends Error {
	constructor(
		readonly provider: string,
		readonly method: MarketplaceMethod,
	) {
		super(`${provider} cannot ${method}`);
		this.name = "ProviderCapabilityError";
	}
}

/** Timeout, network failure or 5xx: services answer `payment.providerUnavailable`. */
export class ProviderUnavailableError extends Error {
	constructor(
		readonly method: MarketplaceMethod,
		readonly status = 503,
		message = `provider unavailable: ${method}`,
	) {
		super(message);
		this.name = "ProviderUnavailableError";
	}
}

/** The provider refused the request (4xx): unknown id, duplicate reference, bad amount. */
export class ProviderRequestError extends Error {
	constructor(
		readonly method: MarketplaceMethod,
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "ProviderRequestError";
	}
}
