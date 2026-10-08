import {
	type CreateConnectedAccountInput,
	type CreateDestinationChargeInput,
	type CreateRefundInput,
	type ListTransactionsInput,
	type MarketplaceMethod,
	type MarketplaceProvider,
	type NormalisedAccount,
	type NormalisedPayment,
	type NormalisedRefund,
	type NormalisedRefundStatus,
	type NormalisedTransaction,
	type NormalisedTransfer,
	type PayoutSchedule,
	ProviderCapabilityError,
	ProviderRequestError,
	ProviderUnavailableError,
} from "./marketplace";
import { mapNotchPayStatus, toAmount, toCurrency, toText } from "./notchpay";
import {
	ACCOUNT_STATUSES,
	failureCodeOf,
	REFUND_STATUSES,
	TRANSFER_STATUSES,
} from "./notchpayTables";
import {
	liveTransport,
	type NotchPayTransport,
	TransportFailure,
	type WireRequest,
} from "./notchpayWire";
import { isRecord, type ProviderPaymentStatus } from "./types";

export { ACCOUNT_STATUSES };

export interface NotchPayMarketplaceConfig {
	publicKey: string;
	privateKey: string;
	hashKey: string;
	baseUrl?: string;
	transport?: NotchPayTransport;
}

const PAYOUT_SCHEDULES: readonly string[] = [
	"manual",
	"daily",
	"weekly",
	"monthly",
];

const record = (value: unknown): Record<string, unknown> =>
	isRecord(value) ? value : {};

const enc = encodeURIComponent;

/** A balance side is a bare integer or a per-currency object; XAF is the launch market's. */
function balanceSide(value: unknown): number {
	const amount = isRecord(value) ? value.XAF : value;
	return Math.round(toAmount(amount) ?? 0);
}

function malformed(method: MarketplaceMethod): never {
	throw new ProviderRequestError(
		method,
		502,
		"unexpected NotchPay response shape",
	);
}

type Implemented =
	| "createConnectedAccount"
	| "createOnboardingLink"
	| "getConnectedAccount"
	| "setPayoutSchedule"
	| "createDestinationCharge"
	| "chargeMobileMoney"
	| "verifyPayment"
	| "createRefund"
	| "getRefund"
	| "releasePayout"
	| "getTransfer"
	| "getConnectedAccountBalance"
	| "listTransactions"
	| "debitConnectedAccount";

export class NotchPayMarketplaceProvider
	implements Pick<MarketplaceProvider, Implemented | "id">
{
	readonly id = "notchpay" as const;
	protected readonly hashKey: string;
	private readonly transport: NotchPayTransport;

	constructor(config: NotchPayMarketplaceConfig) {
		this.hashKey = config.hashKey;
		this.transport =
			config.transport ??
			liveTransport({
				baseUrl: config.baseUrl ?? "https://api.notchpay.co",
				publicKey: config.publicKey,
				privateKey: config.privateKey,
			});
	}

	private async call<T>(
		method: MarketplaceMethod,
		request: WireRequest,
		read: (body: unknown) => T,
	): Promise<T> {
		let response: Awaited<ReturnType<NotchPayTransport>>;
		try {
			response = await this.transport(request);
		} catch (error) {
			if (error instanceof TransportFailure) {
				throw new ProviderUnavailableError(method);
			}
			throw error;
		}
		if (response.status >= 500) {
			throw new ProviderUnavailableError(method, response.status);
		}
		if (response.status >= 400) {
			throw new ProviderRequestError(
				method,
				response.status,
				toText(record(response.body).message) ||
					`NotchPay refused ${method} (${response.status})`,
			);
		}
		return read(response.body);
	}

	async createConnectedAccount(
		input: CreateConnectedAccountInput,
	): Promise<{ accountId: string }> {
		return this.call(
			"createConnectedAccount",
			{
				method: "POST",
				path: "/sync/accounts",
				body: {
					type: input.type,
					business_profile: { name: input.name },
					email: input.email,
					phone: input.phone,
					metadata: { shop_id: input.shopId },
				},
			},
			(body) => {
				const envelope = record(body);
				const accountId =
					toText(record(envelope.account).id) ||
					toText(record(record(envelope.data).account).id);
				if (!accountId) return malformed("createConnectedAccount");
				return { accountId };
			},
		);
	}

	async createOnboardingLink(
		accountId: string,
		urls: { returnUrl: string; refreshUrl: string },
	): Promise<{ url: string }> {
		return this.call(
			"createOnboardingLink",
			{
				method: "POST",
				path: `/sync/accounts/${enc(accountId)}/onboarding`,
				body: { redirect_url: urls.returnUrl, refresh_url: urls.refreshUrl },
			},
			(body) => {
				const url = toText(record(body).url);
				if (!url) return malformed("createOnboardingLink");
				return { url };
			},
		);
	}

	async getConnectedAccount(accountId: string): Promise<NormalisedAccount> {
		return this.call(
			"getConnectedAccount",
			{ method: "GET", path: `/sync/accounts/${enc(accountId)}` },
			(body) => {
				const envelope = record(body);
				const account = isRecord(envelope.account)
					? envelope.account
					: record(envelope.data);
				const id = toText(account.id);
				const status = ACCOUNT_STATUSES[toText(account.status).toLowerCase()];
				if (!id || !status) return malformed("getConnectedAccount");
				const due = record(account.requirements).currently_due;
				const schedule = toText(account.payout_schedule);
				return {
					accountId: id,
					status,
					chargesEnabled: Boolean(account.charges_enabled),
					payoutsEnabled: Boolean(account.payouts_enabled),
					requirementsDue: Array.isArray(due)
						? due.filter((item): item is string => typeof item === "string")
						: [],
					kycStatus: toText(record(account.verification).status) || null,
					kycName:
						toText(record(account.verification).name) ||
						toText(account.name) ||
						null,
					payoutSchedule: PAYOUT_SCHEDULES.includes(schedule)
						? (schedule as PayoutSchedule)
						: null,
				};
			},
		);
	}

	async setPayoutSchedule(
		accountId: string,
		schedule: PayoutSchedule,
	): Promise<void> {
		await this.call(
			"setPayoutSchedule",
			{
				method: "PUT",
				path: `/sync/accounts/${enc(accountId)}`,
				body: { payout_schedule: schedule },
			},
			() => undefined,
		);
	}

	async createDestinationCharge(
		input: CreateDestinationChargeInput,
	): Promise<{ providerReference: string; checkoutUrl?: string }> {
		if (input.applicationFee + input.destination.amount !== input.amount) {
			throw new ProviderRequestError(
				"createDestinationCharge",
				400,
				"split does not sum to amount",
			);
		}
		return this.call(
			"createDestinationCharge",
			{
				method: "POST",
				path: "/payments",
				body: {
					amount: input.amount,
					currency: input.currency,
					customer: input.customer,
					description: input.description,
					reference: input.reference,
					callback: input.callbackUrl,
					application_fee: input.applicationFee,
					destination: {
						account: input.destination.accountId,
						amount: input.destination.amount,
					},
				},
			},
			(body) => {
				const envelope = record(body);
				return {
					providerReference:
						toText(record(envelope.transaction).reference) || input.reference,
					checkoutUrl: toText(envelope.authorization_url) || undefined,
				};
			},
		);
	}

	async chargeMobileMoney(
		reference: string,
		payer: { channel: string; phone: string },
	): Promise<{ status: ProviderPaymentStatus; action?: string }> {
		return this.call(
			"chargeMobileMoney",
			{
				method: "POST",
				path: `/payments/${enc(reference)}`,
				body: { channel: payer.channel, data: { account_number: payer.phone } },
			},
			(body) => {
				const envelope = record(body);
				return {
					status: mapNotchPayStatus(
						toText(record(envelope.transaction).status),
					),
					action:
						toText(envelope.action) || toText(envelope.message) || undefined,
				};
			},
		);
	}

	async verifyPayment(reference: string): Promise<NormalisedPayment> {
		return this.call(
			"verifyPayment",
			{ method: "GET", path: `/payments/${enc(reference)}` },
			(body) => {
				const envelope = record(body);
				const trx = isRecord(envelope.transaction)
					? envelope.transaction
					: envelope;
				const status = mapNotchPayStatus(toText(trx.status));
				return {
					reference: toText(trx.merchant_reference) || toText(trx.trxref),
					status,
					amount: toAmount(trx.amount),
					currency: toCurrency(trx.currency),
					providerTransactionId: toText(trx.reference) || reference,
					failureCode: failureCodeOf(
						toText(trx.failure_reason) || toText(trx.status),
						status,
					),
					fee: toAmount(trx.fee),
					accountId: toText(record(trx.destination).account) || null,
				};
			},
		);
	}

	async createRefund(
		input: CreateRefundInput,
	): Promise<{ refundId: string; status: NormalisedRefundStatus }> {
		const existing = await this.call(
			"createRefund",
			{
				method: "GET",
				path: `/payments/${enc(input.paymentReference)}/refunds`,
			},
			(body) => {
				const refunds = record(body).refunds;
				return Array.isArray(refunds) ? refunds.map(record) : [];
			},
		);
		const prior = existing.find(
			(refund) =>
				record(refund.metadata).idempotency_key === input.idempotencyKey,
		);
		if (prior) {
			if (toAmount(prior.amount) !== input.amount) {
				throw new ProviderRequestError(
					"createRefund",
					409,
					"idempotency key reused with a different amount",
				);
			}
			return readRefundAck("createRefund", prior);
		}
		return this.call(
			"createRefund",
			{
				method: "POST",
				path: "/refunds",
				body: {
					payment: input.paymentReference,
					amount: input.amount,
					reason: input.reason,
					metadata: {
						idempotency_key: input.idempotencyKey,
						payment_reference: input.paymentReference,
					},
				},
				idempotencyKey: input.idempotencyKey,
			},
			(body) => {
				const envelope = record(body);
				return readRefundAck(
					"createRefund",
					isRecord(envelope.refund) ? envelope.refund : record(envelope.data),
				);
			},
		);
	}

	async getRefund(refundId: string): Promise<NormalisedRefund> {
		const refund = await this.call(
			"getRefund",
			{ method: "GET", path: `/refunds/${enc(refundId)}` },
			(body) => {
				const envelope = record(body);
				return isRecord(envelope.refund)
					? envelope.refund
					: record(envelope.data);
			},
		);
		const metadata = record(refund.metadata);
		let paymentReference = toText(metadata.payment_reference);
		if (!paymentReference) {
			const payment = isRecord(refund.payment)
				? toText(refund.payment.id) || toText(refund.payment.reference)
				: toText(refund.payment);
			if (payment) {
				paymentReference = await this.call(
					"getRefund",
					{ method: "GET", path: `/payments/${enc(payment)}` },
					(body) => {
						const envelope = record(body);
						const trx = isRecord(envelope.transaction)
							? envelope.transaction
							: envelope;
						return toText(trx.trxref) || toText(trx.merchant_reference);
					},
				);
			}
		}
		const ack = readRefundAck("getRefund", refund);
		const amount = toAmount(refund.amount);
		if (amount === null) return malformed("getRefund");
		return {
			refundId: ack.refundId,
			paymentReference,
			idempotencyKey: toText(metadata.idempotency_key) || null,
			amount,
			currency: toCurrency(refund.currency) ?? "",
			status: ack.status,
			failureReason:
				ack.status === "failed"
					? toText(refund.failure_reason) || toText(refund.message) || null
					: null,
		};
	}

	async releasePayout(
		accountId: string,
		payout: { amount: number; currency: string; reference: string },
	): Promise<{ transferId: string }> {
		return this.call(
			"releasePayout",
			{
				method: "POST",
				path: `/sync/accounts/${enc(accountId)}/payouts`,
				body: {
					amount: payout.amount,
					currency: payout.currency,
					reference: payout.reference,
				},
				idempotencyKey: payout.reference,
			},
			(body) => {
				const envelope = record(body);
				const transferId =
					toText(record(envelope.transfer).id) ||
					toText(record(envelope.payout).id);
				if (!transferId) return malformed("releasePayout");
				return { transferId };
			},
		);
	}

	async getTransfer(transferId: string): Promise<NormalisedTransfer> {
		return this.call(
			"getTransfer",
			{ method: "GET", path: `/transfers/${enc(transferId)}` },
			(body) => {
				const envelope = record(body);
				const transfer = isRecord(envelope.transfer)
					? envelope.transfer
					: record(envelope.data);
				const status = TRANSFER_STATUSES[toText(transfer.status).toLowerCase()];
				const amount = toAmount(transfer.amount);
				if (!status || amount === null) return malformed("getTransfer");
				return {
					transferId: toText(transfer.id) || transferId,
					accountId: toText(transfer.account) || "",
					reference: toText(transfer.reference) || null,
					amount,
					currency: toCurrency(transfer.currency) ?? "",
					fee: toAmount(transfer.fee),
					status,
					failureReason:
						status === "failed"
							? toText(transfer.failure_reason) ||
								toText(transfer.message) ||
								null
							: null,
				};
			},
		);
	}

	async getConnectedAccountBalance(
		accountId: string,
	): Promise<{ available: number; pending: number }> {
		return this.call(
			"getConnectedAccountBalance",
			{ method: "GET", path: `/sync/accounts/${enc(accountId)}/balance` },
			(body) => {
				const envelope = record(body);
				const balance = isRecord(envelope.balance)
					? envelope.balance
					: record(envelope.data);
				return {
					available: balanceSide(balance.available),
					pending: balanceSide(balance.pending),
				};
			},
		);
	}

	async listTransactions(
		input: ListTransactionsInput,
	): Promise<NormalisedTransaction[]> {
		const items = await this.call(
			"listTransactions",
			{
				method: "GET",
				path: "/balance/history",
				query: {
					page: String(input.page),
					limit: "100",
					date_start: input.from.toISOString().slice(0, 10),
					date_end: input.to.toISOString().slice(0, 10),
					...(input.accountId ? { account: input.accountId } : {}),
				},
			},
			(body) => {
				const rows = record(body).items;
				return Array.isArray(rows) ? rows.map(record) : [];
			},
		);
		const out: NormalisedTransaction[] = [];
		for (const item of items) {
			const amount = Math.abs(toAmount(item.amount) ?? 0);
			const base = {
				providerId: toText(item.id) || toText(item.reference),
				reference: toText(item.reference) || null,
				accountId: toText(item.account) || null,
				amount,
				currency: toCurrency(item.currency) ?? "",
				fee: toAmount(item.fee),
				occurredAt: toText(item.created_at),
			};
			const type = toText(item.type);
			if (type === "payment") {
				out.push({
					...base,
					reference: toText(item.merchant_reference) || base.reference,
					entity: "payment",
					status: "succeeded",
				});
			} else if (type === "refund") {
				const refund = await this.getRefund(toText(item.reference));
				out.push({
					...base,
					providerId: refund.refundId,
					reference: refund.idempotencyKey,
					entity: "refund",
					status: refund.status,
				});
			} else if (type === "transfer") {
				const transfer = await this.getTransfer(toText(item.reference));
				out.push({
					...base,
					providerId: transfer.transferId,
					reference: transfer.reference,
					entity: "transfer",
					status: transfer.status,
				});
			} else if (type === "adjustment") {
				out.push({ ...base, entity: "debit", status: "succeeded" });
			}
		}
		return out;
	}

	async debitConnectedAccount(): Promise<{ debitId: string }> {
		throw new ProviderCapabilityError("notchpay", "debitConnectedAccount");
	}
}

function readRefundAck(
	method: MarketplaceMethod,
	refund: Record<string, unknown>,
): { refundId: string; status: NormalisedRefundStatus } {
	const refundId = toText(refund.id);
	const status = REFUND_STATUSES[toText(refund.status).toLowerCase()];
	if (!refundId || !status) return malformed(method);
	return { refundId, status };
}
