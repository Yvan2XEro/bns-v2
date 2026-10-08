import {
	type ConnectedAccountStatus,
	type CreateConnectedAccountInput,
	type MarketplaceMethod,
	type MarketplaceProvider,
	type NormalisedAccount,
	type PayoutSchedule,
	ProviderRequestError,
	ProviderUnavailableError,
} from "./marketplace";
import { toText } from "./notchpay";
import {
	liveTransport,
	type NotchPayTransport,
	TransportFailure,
	type WireRequest,
} from "./notchpayWire";
import { isRecord } from "./types";

export interface NotchPayMarketplaceConfig {
	publicKey: string;
	privateKey: string;
	hashKey: string;
	baseUrl?: string;
	transport?: NotchPayTransport;
}

/** ASSUMED(A3): the sandbox's account status vocabulary. */
export const ACCOUNT_STATUSES: Record<string, ConnectedAccountStatus> = {
	pending: "created",
	created: "created",
	onboarding: "onboarding",
	incomplete: "onboarding",
	restricted: "restricted",
	active: "active",
	disabled: "disabled",
	deauthorized: "deauthorized",
};

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
	| "setPayoutSchedule";

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
}
