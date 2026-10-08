import {
	type CreateConnectedAccountInput,
	type CreateDestinationChargeInput,
	type MarketplaceMethod,
	type MarketplaceProvider,
	type NormalisedAccount,
	type NormalisedPayment,
	type PayoutSchedule,
	ProviderRequestError,
	ProviderUnavailableError,
} from "./marketplace";
import { mapNotchPayStatus, toAmount, toCurrency, toText } from "./notchpay";
import { ACCOUNT_STATUSES, failureCodeOf } from "./notchpayTables";
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
	| "verifyPayment";

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
}
