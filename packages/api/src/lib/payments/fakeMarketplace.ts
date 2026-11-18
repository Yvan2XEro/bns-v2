import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
	type ConnectedAccountStatus,
	type CreateConnectedAccountInput,
	type CreateDestinationChargeInput,
	type CreateRefundInput,
	type ListTransactionsInput,
	type MarketplaceMethod,
	type MarketplaceProvider,
	type NormalisedAccount,
	type NormalisedDebitStatus,
	type NormalisedEvent,
	type NormalisedPayment,
	type NormalisedRefund,
	type NormalisedRefundStatus,
	type NormalisedTransaction,
	type NormalisedTransfer,
	type NormalisedTransferStatus,
	type PaymentFailureCode,
	type PayoutSchedule,
	ProviderCapabilityError,
	ProviderRequestError,
	ProviderUnavailableError,
} from "./marketplace";
import { type ProviderPaymentStatus, WebhookSignatureError } from "./types";

type Args<M extends MarketplaceMethod> = Parameters<MarketplaceProvider[M]>;

export type FakeCall = {
	[M in MarketplaceMethod]: { method: M; args: Args<M>; rejected: boolean };
}[MarketplaceMethod];

/** One step of provider truth, applied by `advance` to the object keyed by the scripted reference. */
export type ScriptedOutcome =
	| {
			entity: "payment";
			status: ProviderPaymentStatus;
			failureCode?: PaymentFailureCode;
			fee?: number;
	  }
	| {
			entity: "refund";
			status: NormalisedRefundStatus;
			failureReason?: string;
			fee?: number;
	  }
	| {
			entity: "transfer";
			status: NormalisedTransferStatus;
			failureReason?: string;
			fee?: number;
	  }
	| { entity: "debit"; status: NormalisedDebitStatus }
	| {
			entity: "account";
			status: ConnectedAccountStatus;
			chargesEnabled?: boolean;
			payoutsEnabled?: boolean;
			requirementsDue?: string[];
			kycStatus?: string | null;
			kycName?: string | null;
	  };

export interface SignedEvent {
	event: NormalisedEvent;
	rawBody: string;
	headers: Record<string, string>;
}

/** A complete event; the fake numbers it and names it `{entity}/{status}` unless told otherwise. */
export type EmitInput = NormalisedEvent extends infer E
	? E extends NormalisedEvent
		? Omit<E, "providerEventId" | "type"> &
				Partial<Pick<E, "providerEventId" | "type">>
		: never
	: never;

export interface FakeMarketplaceOptions {
	webhookSecret?: string;
	/** Stamps `occurredAt`; pass a fixed clock for byte-identical runs. */
	now?: () => Date;
	pageSize?: number;
	/** Debits carry no currency on the port; the fake reports this one. */
	currency?: string;
	/** Accounts that already exist at the provider; active and fully enabled unless overridden. */
	accounts?: Array<Partial<NormalisedAccount> & { accountId: string }>;
}

interface FailRule {
	method: MarketplaceMethod;
	remaining: number;
	// Method syntax on purpose: its bivariance lets a predicate typed for one
	// method's arguments live in a list of every method's rules.
	matches?(args: readonly unknown[]): boolean;
}

interface PaymentState extends NormalisedPayment {
	providerTransactionId: string;
	amount: number;
	currency: string;
	occurredAt: string;
	refunds: string[];
}

interface DebitState {
	debitId: string;
	accountId: string;
	reference: string;
	amount: number;
	currency: string;
	status: NormalisedDebitStatus;
	occurredAt: string;
}

type Stored =
	| { entity: "payment"; key: string }
	| { entity: "refund"; key: string }
	| { entity: "transfer"; key: string }
	| { entity: "debit"; key: string };

export const FAKE_SIGNATURE_HEADER = "x-fake-signature";
const ORIGIN = "https://fake-provider.test";

const base = {
	providerEventId: z.string(),
	type: z.string(),
	reference: z.string(),
	amount: z.number().nullable(),
	currency: z.string().nullable(),
	providerTransactionId: z.string().nullable(),
};
const eventSchema = z.discriminatedUnion("entity", [
	z
		.object({
			...base,
			entity: z.literal("payment"),
			status: z.enum([
				"pending",
				"succeeded",
				"failed",
				"cancelled",
				"expired",
			]),
			accountId: z.string().nullable(),
			fee: z.number().nullable(),
			failureCode: z
				.enum([
					"declined",
					"insufficient_funds",
					"timeout",
					"limit_exceeded",
					"invalid_number",
					"provider_error",
				])
				.nullable(),
		})
		.strict(),
	z
		.object({
			...base,
			entity: z.literal("refund"),
			status: z.enum(["pending", "processing", "succeeded", "failed"]),
			refundId: z.string(),
			paymentReference: z.string(),
			accountId: z.string().nullable(),
			fee: z.number().nullable(),
		})
		.strict(),
	z
		.object({
			...base,
			entity: z.literal("transfer"),
			status: z.enum([
				"pending",
				"sent",
				"processing",
				"complete",
				"failed",
				"reversed",
			]),
			transferId: z.string(),
			accountId: z.string(),
			fee: z.number().nullable(),
			failureReason: z.string().nullable(),
		})
		.strict(),
	z
		.object({
			...base,
			entity: z.literal("account"),
			status: z.enum([
				"created",
				"onboarding",
				"restricted",
				"active",
				"disabled",
				"deauthorized",
			]),
			accountId: z.string(),
		})
		.strict(),
	z
		.object({
			...base,
			entity: z.literal("debit"),
			status: z.enum(["pending", "succeeded", "failed"]),
			debitId: z.string(),
			accountId: z.string(),
		})
		.strict(),
]);

const isAmount = (value: number, allowZero: boolean) =>
	Number.isInteger(value) && (allowZero ? value >= 0 : value > 0);

/**
 * The deterministic in-memory provider every P5 service spec runs against, and
 * the first implementation of the port contract. Ids are numbered per kind
 * (`acct_1`, `pay_1`, `re_1`, `tr_1`, `dbt_1`, `evt_1`), so the same calls in
 * the same order produce the same ids. Provider truth only moves through port
 * calls and `advance`; `emit` is pure wire, so a test chooses delivery order
 * (and replays) independently of what the provider believes.
 */
export class FakeMarketplaceProvider implements MarketplaceProvider {
	readonly id = "fake";
	readonly calls: FakeCall[] = [];

	private readonly secret: string;
	private readonly now: () => Date;
	private readonly pageSize: number;
	private readonly currency: string;
	private readonly counters = new Map<string, number>();
	private readonly accounts = new Map<string, NormalisedAccount>();
	private readonly balances = new Map<
		string,
		{ available: number; pending: number }
	>();
	private readonly payments = new Map<string, PaymentState>();
	private readonly refunds = new Map<
		string,
		NormalisedRefund & {
			accountId: string | null;
			fee: number | null;
			occurredAt: string;
		}
	>();
	private readonly refundKeys = new Map<string, string>();
	private readonly transfers = new Map<
		string,
		NormalisedTransfer & { occurredAt: string }
	>();
	private readonly transferRefs = new Map<string, string>();
	private readonly debits = new Map<string, DebitState>();
	private readonly order: Stored[] = [];
	private readonly extraTransactions: NormalisedTransaction[] = [];
	private readonly scripts = new Map<string, ScriptedOutcome[]>();
	private readonly actions = new Map<string, string>();
	private readonly failRules: FailRule[] = [];
	private readonly unsupportedMethods = new Set<MarketplaceMethod>();

	constructor(options: FakeMarketplaceOptions = {}) {
		this.secret = options.webhookSecret ?? "fake-marketplace-webhook-secret";
		this.now = options.now ?? (() => new Date());
		this.pageSize = options.pageSize ?? 50;
		this.currency = options.currency ?? "XAF";
		for (const account of options.accounts ?? []) this.seedAccount(account);
	}

	// ---- test controls (not port calls, never journaled) ----

	/** Queues outcomes for a payment (our reference), refund (idempotency key), transfer or debit (our reference), or account (account id). */
	script(
		reference: string,
		outcomes: ScriptedOutcome[],
		options: { action?: string } = {},
	): this {
		this.scripts.set(reference, [
			...(this.scripts.get(reference) ?? []),
			...outcomes,
		]);
		if (options.action !== undefined)
			this.actions.set(reference, options.action);
		return this;
	}

	/** Applies the next scripted outcome to provider truth and returns its signed webhook. */
	advance(reference: string): SignedEvent {
		const queue = this.scripts.get(reference) ?? [];
		const outcome = queue[0];
		if (!outcome)
			throw new Error(
				`fakeMarketplace: no scripted outcome left for ${reference}`,
			);
		// Consumed only once applied: scripting before the object exists is fine.
		const unsigned = this.apply(reference, outcome);
		queue.shift();
		return this.emit(unsigned);
	}

	advanceAll(reference: string): SignedEvent[] {
		const out: SignedEvent[] = [];
		while ((this.scripts.get(reference) ?? []).length > 0)
			out.push(this.advance(reference));
		return out;
	}

	emit(input: EmitInput): SignedEvent {
		const event = {
			...input,
			providerEventId: input.providerEventId ?? this.nextId("evt"),
			type: input.type ?? `${input.entity}/${input.status}`,
		};
		const rawBody = JSON.stringify(event);
		return { event, rawBody, headers: this.sign(rawBody) };
	}

	sign(rawBody: string): Record<string, string> {
		return {
			[FAKE_SIGNATURE_HEADER]: createHmac("sha256", this.secret)
				.update(rawBody)
				.digest("hex"),
		};
	}

	/** The next `times` calls to `method` (every call when omitted) that match `when` reject as a 503. */
	failWhen<M extends MarketplaceMethod>(
		method: M,
		options: { times?: number; when?: (args: Args<M>) => boolean } = {},
	): this {
		this.failRules.push({
			method,
			remaining: options.times ?? Number.POSITIVE_INFINITY,
			matches: options.when,
		});
		return this;
	}

	unsupported(method: MarketplaceMethod): this {
		this.unsupportedMethods.add(method);
		return this;
	}

	callsTo<M extends MarketplaceMethod>(method: M): Args<M>[] {
		return this.calls.flatMap((call) =>
			call.method === method ? [call.args as Args<M>] : [],
		);
	}

	seedAccount(
		account: Partial<NormalisedAccount> & { accountId: string },
	): this {
		this.accounts.set(account.accountId, {
			status: "active",
			chargesEnabled: true,
			payoutsEnabled: true,
			requirementsDue: [],
			kycStatus: null,
			kycName: null,
			payoutSchedule: null,
			...structuredClone(account),
		});
		return this;
	}

	/** A charge the provider knows about without any port call: fetchable, and listed. */
	seedPayment(payment: {
		reference: string;
		amount: number;
		currency: string;
		status: ProviderPaymentStatus;
		accountId?: string | null;
		fee?: number | null;
		failureCode?: PaymentFailureCode | null;
	}): this {
		this.payments.set(payment.reference, {
			reference: payment.reference,
			status: payment.status,
			amount: payment.amount,
			currency: payment.currency,
			providerTransactionId: this.nextId("pay"),
			failureCode: payment.failureCode ?? null,
			fee: payment.fee ?? null,
			accountId: payment.accountId ?? null,
			occurredAt: this.now().toISOString(),
			refunds: [],
		});
		this.order.push({ entity: "payment", key: payment.reference });
		return this;
	}

	setBalance(
		accountId: string,
		balance: { available: number; pending: number },
	): this {
		this.balances.set(accountId, { ...balance });
		return this;
	}

	/** A row only `listTransactions` knows: nothing can fetch it. */
	addTransaction(transaction: NormalisedTransaction): this {
		this.extraTransactions.push(structuredClone(transaction));
		return this;
	}

	// ---- the port ----

	async createConnectedAccount(
		input: CreateConnectedAccountInput,
	): Promise<{ accountId: string }> {
		return this.track("createConnectedAccount", [input], () => {
			const accountId = this.nextId("acct");
			this.accounts.set(accountId, {
				accountId,
				status: "created",
				chargesEnabled: false,
				payoutsEnabled: false,
				requirementsDue: [],
				kycStatus: null,
				kycName: null,
				payoutSchedule: null,
			});
			return { accountId };
		});
	}

	async createOnboardingLink(
		accountId: string,
		urls: { returnUrl: string; refreshUrl: string },
	): Promise<{ url: string }> {
		return this.track("createOnboardingLink", [accountId, urls], () => {
			this.account("createOnboardingLink", accountId);
			return { url: `${ORIGIN}/onboarding/${accountId}/${this.next("link")}` };
		});
	}

	async getConnectedAccount(accountId: string): Promise<NormalisedAccount> {
		return this.track("getConnectedAccount", [accountId], () => {
			return structuredClone(this.account("getConnectedAccount", accountId));
		});
	}

	async setPayoutSchedule(
		accountId: string,
		schedule: PayoutSchedule,
	): Promise<void> {
		return this.track("setPayoutSchedule", [accountId, schedule], () => {
			this.account("setPayoutSchedule", accountId).payoutSchedule = schedule;
		});
	}

	async createDestinationCharge(
		input: CreateDestinationChargeInput,
	): Promise<{ providerReference: string; checkoutUrl?: string }> {
		const m = "createDestinationCharge";
		return this.track(m, [input], () => {
			const { amount, applicationFee, destination } = input;
			if (
				!isAmount(amount, false) ||
				!isAmount(applicationFee, true) ||
				!isAmount(destination.amount, true) ||
				applicationFee + destination.amount !== amount
			) {
				this.refuse(
					m,
					400,
					"amounts must be integers with applicationFee + destination.amount = amount",
				);
			}
			if (!this.account(m, destination.accountId).chargesEnabled)
				this.refuse(
					m,
					400,
					`account ${destination.accountId} cannot take charges`,
				);
			if (this.payments.has(input.reference))
				this.refuse(m, 409, `duplicate reference ${input.reference}`);
			const providerTransactionId = this.nextId("pay");
			this.payments.set(input.reference, {
				reference: input.reference,
				status: "pending",
				amount,
				currency: input.currency,
				providerTransactionId,
				failureCode: null,
				fee: null,
				accountId: destination.accountId,
				occurredAt: this.now().toISOString(),
				refunds: [],
			});
			this.order.push({ entity: "payment", key: input.reference });
			return {
				providerReference: providerTransactionId,
				checkoutUrl: `${ORIGIN}/checkout/${providerTransactionId}`,
			};
		});
	}

	async chargeMobileMoney(
		reference: string,
		payer: { channel: string; phone: string },
	): Promise<{ status: ProviderPaymentStatus; action?: string }> {
		return this.track("chargeMobileMoney", [reference, payer], () => {
			const payment = this.payment("chargeMobileMoney", reference);
			if (payment.status !== "pending")
				this.refuse(
					"chargeMobileMoney",
					409,
					`${reference} is ${payment.status}`,
				);
			const action = this.actions.get(reference);
			return action === undefined
				? { status: payment.status }
				: { status: payment.status, action };
		});
	}

	async verifyPayment(reference: string): Promise<NormalisedPayment> {
		return this.track("verifyPayment", [reference], () => {
			const {
				occurredAt: _,
				refunds: __,
				...payment
			} = this.payment("verifyPayment", reference);
			return structuredClone(payment);
		});
	}

	async releasePayout(
		accountId: string,
		payout: { amount: number; currency: string; reference: string },
	): Promise<{ transferId: string }> {
		const m = "releasePayout";
		return this.track(m, [accountId, payout], () => {
			if (!isAmount(payout.amount, false))
				this.refuse(m, 400, "amount must be a positive integer");
			if (!this.account(m, accountId).payoutsEnabled)
				this.refuse(m, 400, `account ${accountId} cannot be paid out`);
			if (this.transferRefs.has(payout.reference))
				this.refuse(m, 409, `duplicate reference ${payout.reference}`);
			const transferId = this.nextId("tr");
			this.transfers.set(transferId, {
				transferId,
				accountId,
				reference: payout.reference,
				amount: payout.amount,
				currency: payout.currency,
				fee: null,
				status: "pending",
				failureReason: null,
				occurredAt: this.now().toISOString(),
			});
			this.transferRefs.set(payout.reference, transferId);
			this.order.push({ entity: "transfer", key: transferId });
			return { transferId };
		});
	}

	async createRefund(
		input: CreateRefundInput,
	): Promise<{ refundId: string; status: NormalisedRefundStatus }> {
		const m = "createRefund";
		return this.track(m, [input], () => {
			const existingId = this.refundKeys.get(input.idempotencyKey);
			if (existingId) {
				const existing = this.refunds.get(existingId);
				if (
					!existing ||
					existing.paymentReference !== input.paymentReference ||
					existing.amount !== input.amount
				)
					this.refuse(m, 409, `idempotency key ${input.idempotencyKey} reused`);
				return { refundId: existing.refundId, status: existing.status };
			}
			const payment = this.payment(m, input.paymentReference);
			if (payment.status !== "succeeded")
				this.refuse(m, 400, `${input.paymentReference} is ${payment.status}`);
			if (!isAmount(input.amount, false))
				this.refuse(m, 400, "amount must be a positive integer");
			const refunded = payment.refunds
				.map((id) => this.refunds.get(id))
				.filter((r) => r && r.status !== "failed")
				.reduce((sum, r) => sum + (r?.amount ?? 0), 0);
			if (refunded + input.amount > payment.amount)
				this.refuse(m, 400, "refund exceeds the refundable amount");
			const refundId = this.nextId("re");
			this.refunds.set(refundId, {
				refundId,
				paymentReference: input.paymentReference,
				idempotencyKey: input.idempotencyKey,
				amount: input.amount,
				currency: payment.currency,
				status: "pending",
				failureReason: null,
				accountId: payment.accountId,
				fee: null,
				occurredAt: this.now().toISOString(),
			});
			this.refundKeys.set(input.idempotencyKey, refundId);
			payment.refunds.push(refundId);
			this.order.push({ entity: "refund", key: refundId });
			return { refundId, status: "pending" };
		});
	}

	async getRefund(refundId: string): Promise<NormalisedRefund> {
		return this.track("getRefund", [refundId], () => {
			const refund = this.refunds.get(refundId);
			if (!refund) this.refuse("getRefund", 404, `unknown refund ${refundId}`);
			const { accountId: _, fee: __, occurredAt: ___, ...out } = refund;
			return structuredClone(out);
		});
	}

	async getTransfer(transferId: string): Promise<NormalisedTransfer> {
		return this.track("getTransfer", [transferId], () => {
			const transfer = this.transfers.get(transferId);
			if (!transfer)
				this.refuse("getTransfer", 404, `unknown transfer ${transferId}`);
			const { occurredAt: _, ...out } = transfer;
			return structuredClone(out);
		});
	}

	async debitConnectedAccount(
		accountId: string,
		debit: { amount: number; reference: string; description: string },
	): Promise<{ debitId: string }> {
		const m = "debitConnectedAccount";
		return this.track(m, [accountId, debit], () => {
			this.account(m, accountId);
			if (!isAmount(debit.amount, false))
				this.refuse(m, 400, "amount must be a positive integer");
			if (this.debits.has(debit.reference))
				this.refuse(m, 409, `duplicate reference ${debit.reference}`);
			const debitId = this.nextId("dbt");
			this.debits.set(debit.reference, {
				debitId,
				accountId,
				reference: debit.reference,
				amount: debit.amount,
				currency: this.currency,
				status: "pending",
				occurredAt: this.now().toISOString(),
			});
			this.order.push({ entity: "debit", key: debit.reference });
			return { debitId };
		});
	}

	async listTransactions(
		input: ListTransactionsInput,
	): Promise<NormalisedTransaction[]> {
		return this.track("listTransactions", [input], () => {
			const from = input.from.getTime();
			const to = input.to.getTime();
			const rows = [
				...this.order.map((stored) => this.transactionOf(stored)),
				...this.extraTransactions,
			].filter((row) => {
				const at = Date.parse(row.occurredAt);
				return (
					at >= from &&
					at < to &&
					(input.accountId === undefined || row.accountId === input.accountId)
				);
			});
			const start = (input.page - 1) * this.pageSize;
			return structuredClone(rows.slice(start, start + this.pageSize));
		});
	}

	async getConnectedAccountBalance(
		accountId: string,
	): Promise<{ available: number; pending: number }> {
		return this.track("getConnectedAccountBalance", [accountId], () => {
			this.account("getConnectedAccountBalance", accountId);
			return {
				...(this.balances.get(accountId) ?? { available: 0, pending: 0 }),
			};
		});
	}

	async verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<NormalisedEvent> {
		return this.track("verifyWebhook", [rawBody, headers], () => {
			const signature = headers[FAKE_SIGNATURE_HEADER] ?? "";
			if (!/^[0-9a-f]{64}$/i.test(signature)) throw new WebhookSignatureError();
			const expected = createHmac("sha256", this.secret)
				.update(rawBody)
				.digest();
			if (!timingSafeEqual(Buffer.from(signature, "hex"), expected))
				throw new WebhookSignatureError();
			let raw: unknown;
			try {
				raw = JSON.parse(rawBody);
			} catch {
				throw new WebhookSignatureError();
			}
			const parsed = eventSchema.safeParse(raw);
			if (!parsed.success) throw new WebhookSignatureError();
			return parsed.data;
		});
	}

	parseWebhookEvent(raw: unknown): NormalisedEvent {
		return this.track("parseWebhookEvent", [raw], () => {
			const parsed = eventSchema.safeParse(raw);
			if (!parsed.success)
				throw new Error("fakeMarketplace: body is not a normalised event");
			return parsed.data;
		});
	}

	// ---- internals ----

	/**
	 * Journals the call before anything can refuse it, so a rejected call is
	 * still on the record, then applies capability and failure injection.
	 */
	private track<M extends MarketplaceMethod, R>(
		method: M,
		args: Args<M>,
		body: () => R,
	): R {
		// TS cannot correlate `M` across the mapped union; the shape is exact.
		const call = {
			method,
			args: structuredClone(args),
			rejected: false,
		} as FakeCall;
		this.calls.push(call);
		try {
			if (this.unsupportedMethods.has(method))
				throw new ProviderCapabilityError(this.id, method);
			const rule = this.failRules.find(
				(r) =>
					r.method === method && r.remaining > 0 && (r.matches?.(args) ?? true),
			);
			if (rule) {
				rule.remaining -= 1;
				throw new ProviderUnavailableError(method);
			}
			return body();
		} catch (error) {
			call.rejected = true;
			throw error;
		}
	}

	private refuse(
		method: MarketplaceMethod,
		status: number,
		message: string,
	): never {
		throw new ProviderRequestError(method, status, `fake: ${message}`);
	}

	private account(method: MarketplaceMethod, accountId: string) {
		const account = this.accounts.get(accountId);
		if (!account) this.refuse(method, 404, `unknown account ${accountId}`);
		return account;
	}

	private payment(method: MarketplaceMethod, reference: string): PaymentState {
		const payment = this.payments.get(reference);
		if (!payment) this.refuse(method, 404, `unknown payment ${reference}`);
		return payment;
	}

	private next(kind: string): number {
		const n = (this.counters.get(kind) ?? 0) + 1;
		this.counters.set(kind, n);
		return n;
	}

	private nextId(prefix: string): string {
		return `${prefix}_${this.next(prefix)}`;
	}

	private transactionOf(stored: Stored): NormalisedTransaction {
		if (stored.entity === "payment") {
			const p = this.payments.get(stored.key);
			if (!p) throw new Error(`fakeMarketplace: lost payment ${stored.key}`);
			return {
				entity: "payment",
				providerId: p.providerTransactionId,
				reference: p.reference,
				accountId: p.accountId,
				amount: p.amount,
				currency: p.currency,
				fee: p.fee,
				status: p.status,
				occurredAt: p.occurredAt,
			};
		}
		if (stored.entity === "refund") {
			const r = this.refunds.get(stored.key);
			if (!r) throw new Error(`fakeMarketplace: lost refund ${stored.key}`);
			return {
				entity: "refund",
				providerId: r.refundId,
				reference: r.idempotencyKey,
				accountId: r.accountId,
				amount: r.amount,
				currency: r.currency,
				fee: r.fee,
				status: r.status,
				occurredAt: r.occurredAt,
			};
		}
		if (stored.entity === "transfer") {
			const t = this.transfers.get(stored.key);
			if (!t) throw new Error(`fakeMarketplace: lost transfer ${stored.key}`);
			return {
				entity: "transfer",
				providerId: t.transferId,
				reference: t.reference,
				accountId: t.accountId,
				amount: t.amount,
				currency: t.currency,
				fee: t.fee,
				status: t.status,
				occurredAt: t.occurredAt,
			};
		}
		const d = this.debits.get(stored.key);
		if (!d) throw new Error(`fakeMarketplace: lost debit ${stored.key}`);
		return {
			entity: "debit",
			providerId: d.debitId,
			reference: d.reference,
			accountId: d.accountId,
			amount: d.amount,
			currency: d.currency,
			fee: null,
			status: d.status,
			occurredAt: d.occurredAt,
		};
	}

	/** Moves provider truth and describes the move as an unsigned event. */
	private apply(reference: string, outcome: ScriptedOutcome): EmitInput {
		const missing = () =>
			new Error(
				`fakeMarketplace: no ${outcome.entity} known by ${reference} to advance`,
			);
		switch (outcome.entity) {
			case "payment": {
				const p = this.payments.get(reference);
				if (!p) throw missing();
				p.status = outcome.status;
				if (outcome.failureCode !== undefined)
					p.failureCode = outcome.failureCode;
				if (outcome.fee !== undefined) p.fee = outcome.fee;
				return {
					entity: "payment",
					reference: p.reference,
					status: p.status,
					amount: p.amount,
					currency: p.currency,
					providerTransactionId: p.providerTransactionId,
					accountId: p.accountId,
					fee: p.fee,
					failureCode: p.failureCode,
				};
			}
			case "refund": {
				const r = this.refunds.get(this.refundKeys.get(reference) ?? "");
				if (!r) throw missing();
				r.status = outcome.status;
				if (outcome.failureReason !== undefined)
					r.failureReason = outcome.failureReason;
				if (outcome.fee !== undefined) r.fee = outcome.fee;
				return {
					entity: "refund",
					reference: r.idempotencyKey ?? "",
					status: r.status,
					amount: r.amount,
					currency: r.currency,
					providerTransactionId: r.refundId,
					refundId: r.refundId,
					paymentReference: r.paymentReference,
					accountId: r.accountId,
					fee: r.fee,
				};
			}
			case "transfer": {
				const t = this.transfers.get(this.transferRefs.get(reference) ?? "");
				if (!t) throw missing();
				t.status = outcome.status;
				if (outcome.failureReason !== undefined)
					t.failureReason = outcome.failureReason;
				if (outcome.fee !== undefined) t.fee = outcome.fee;
				return {
					entity: "transfer",
					reference: t.reference ?? "",
					status: t.status,
					amount: t.amount,
					currency: t.currency,
					providerTransactionId: t.transferId,
					transferId: t.transferId,
					accountId: t.accountId,
					fee: t.fee,
					failureReason: t.failureReason,
				};
			}
			case "debit": {
				const d = this.debits.get(reference);
				if (!d) throw missing();
				d.status = outcome.status;
				return {
					entity: "debit",
					reference: d.reference,
					status: d.status,
					amount: d.amount,
					currency: d.currency,
					providerTransactionId: d.debitId,
					debitId: d.debitId,
					accountId: d.accountId,
				};
			}
			case "account": {
				const a = this.accounts.get(reference);
				if (!a) throw missing();
				const { entity: _, ...patch } = outcome;
				Object.assign(a, structuredClone(patch));
				return {
					entity: "account",
					reference: "",
					status: a.status,
					amount: null,
					currency: null,
					providerTransactionId: null,
					accountId: a.accountId,
				};
			}
		}
	}
}
