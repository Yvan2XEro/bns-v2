// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	ProviderRequestError,
	ProviderUnavailableError,
} from "../../src/lib/payments/marketplace";
import {
	ACCOUNT_STATUSES,
	NotchPayMarketplaceProvider,
} from "../../src/lib/payments/notchpayMarketplace";
import {
	type NotchPayTransport,
	TransportFailure,
} from "../../src/lib/payments/notchpayWire";
import {
	type NotchPayFixture,
	ReplayTransport,
} from "./helpers/notchpayReplay";

function build(fixtures: NotchPayFixture[], transport?: NotchPayTransport) {
	const replay = new ReplayTransport(fixtures);
	const provider = new NotchPayMarketplaceProvider({
		publicKey: "pk",
		privateKey: "sk",
		hashKey: "hash-key",
		transport: transport ?? replay.transport(),
	});
	return { replay, provider };
}

const accountFixtures: NotchPayFixture[] = [
	{
		key: "sync-account-missing",
		request: { method: "GET", path: "/sync/accounts/ghost" },
		response: { status: 404, body: { message: "Account not found" } },
	},
	{
		key: "sync-account-down",
		request: { method: "GET", path: "/sync/accounts/down" },
		response: { status: 503, body: { message: "secret upstream detail" } },
	},
	{
		key: "sync-account-create",
		request: { method: "POST", path: "/sync/accounts" },
		response: {
			status: 201,
			body: { account: { id: "acc_1", status: "pending" } },
		},
		sets: "account:acc_1=initial",
		assumed: ["A1"],
	},
	{
		key: "sync-account-onboarding",
		request: { method: "POST", path: "/sync/accounts/{id}/onboarding" },
		response: { status: 200, body: { url: "https://onboard.example/{id}" } },
		assumed: ["A2"],
	},
	{
		key: "sync-account-fresh",
		request: {
			method: "GET",
			path: "/sync/accounts/{id}",
			when: "account:{id}=initial",
		},
		response: {
			status: 200,
			body: {
				account: {
					id: "{id}",
					status: "pending",
					name: "Boutique",
					charges_enabled: false,
					payouts_enabled: false,
					requirements: { currently_due: ["business_profile", 7] },
					verification: { status: "unverified" },
				},
			},
		},
		assumed: ["A3"],
	},
	{
		key: "sync-account-active",
		request: {
			method: "GET",
			path: "/sync/accounts/{id}",
			when: "account:{id}=active",
		},
		response: {
			status: 200,
			body: {
				account: {
					id: "{id}",
					status: "active",
					name: "Boutique",
					charges_enabled: true,
					payouts_enabled: true,
					requirements: { currently_due: [] },
					verification: { status: "verified", name: "A B" },
					payout_schedule: "manual",
				},
			},
		},
		assumed: ["A3"],
	},
	{
		key: "sync-account-schedule",
		request: { method: "PUT", path: "/sync/accounts/{id}" },
		response: { status: 200, body: {} },
		assumed: ["A4"],
	},
];

describe("NotchPay adapter — connected accounts", () => {
	it("creates an account with the shop id in metadata", async () => {
		const { provider, replay } = build(accountFixtures);
		expect(
			await provider.createConnectedAccount({
				shopId: "shop-1",
				name: "Boutique",
				email: "a@b.co",
				phone: "+237600000000",
				type: "express",
			}),
		).toEqual({ accountId: "acc_1" });
		expect(replay.journal).toEqual([
			{
				method: "POST",
				path: "/sync/accounts",
				body: {
					type: "express",
					business_profile: { name: "Boutique" },
					email: "a@b.co",
					phone: "+237600000000",
					metadata: { shop_id: "shop-1" },
				},
			},
		]);
	});

	it("echoes the onboarding url", async () => {
		const { provider, replay } = build(accountFixtures);
		expect(
			await provider.createOnboardingLink("acc_1", {
				returnUrl: "https://app/return",
				refreshUrl: "https://app/refresh",
			}),
		).toEqual({ url: "https://onboard.example/acc_1" });
		expect(replay.journal).toEqual([
			{
				method: "POST",
				path: "/sync/accounts/acc_1/onboarding",
				body: {
					redirect_url: "https://app/return",
					refresh_url: "https://app/refresh",
				},
			},
		]);
	});

	it("normalises a fresh account, then an activated one", async () => {
		const { provider, replay } = build(accountFixtures);
		expect(await provider.getConnectedAccount("acc_1")).toEqual({
			accountId: "acc_1",
			status: "created",
			chargesEnabled: false,
			payoutsEnabled: false,
			requirementsDue: ["business_profile"],
			kycStatus: "unverified",
			kycName: "Boutique",
			payoutSchedule: null,
		});
		replay.setMode("account:acc_1", "active");
		expect(await provider.getConnectedAccount("acc_1")).toEqual({
			accountId: "acc_1",
			status: "active",
			chargesEnabled: true,
			payoutsEnabled: true,
			requirementsDue: [],
			kycStatus: "verified",
			kycName: "A B",
			payoutSchedule: "manual",
		});
	});

	it("writes the payout schedule", async () => {
		const { provider, replay } = build(accountFixtures);
		await provider.setPayoutSchedule("acc_1", "weekly");
		expect(replay.journal).toEqual([
			{
				method: "PUT",
				path: "/sync/accounts/acc_1",
				body: { payout_schedule: "weekly" },
			},
		]);
	});

	it("maps a 404 to ProviderRequestError with the provider message", async () => {
		const { provider } = build(accountFixtures);
		await expect(provider.getConnectedAccount("ghost")).rejects.toMatchObject({
			name: "ProviderRequestError",
			method: "getConnectedAccount",
			status: 404,
			message: "Account not found",
		});
	});

	it("maps a 5xx to ProviderUnavailableError without echoing the body", async () => {
		const { provider } = build(accountFixtures);
		const error = await provider.getConnectedAccount("down").catch((e) => e);
		expect(error).toBeInstanceOf(ProviderUnavailableError);
		expect(error).toMatchObject({ method: "getConnectedAccount", status: 503 });
		expect(error.message).not.toContain("secret");
	});

	it("maps a transport failure to ProviderUnavailableError", async () => {
		const { provider } = build([], async () => {
			throw new TransportFailure("timeout");
		});
		await expect(provider.getConnectedAccount("x")).rejects.toBeInstanceOf(
			ProviderUnavailableError,
		);
	});

	it("rejects a body without its envelope as a 502", async () => {
		const { provider } = build([
			{
				key: "empty",
				request: { method: "GET", path: "/sync/accounts/{id}" },
				response: { status: 200, body: {} },
			},
		]);
		await expect(provider.getConnectedAccount("a")).rejects.toMatchObject({
			status: 502,
		});
		await expect(provider.getConnectedAccount("a")).rejects.toBeInstanceOf(
			ProviderRequestError,
		);
	});

	it("keeps the account status table deliberate", () => {
		expect(Object.keys(ACCOUNT_STATUSES)).toHaveLength(8);
	});
});

const chargeFixtures: NotchPayFixture[] = [
	{
		key: "payment-create",
		request: { method: "POST", path: "/payments" },
		response: {
			status: 201,
			body: {
				transaction: { id: "trx_1", reference: "trx.{reference}" },
				authorization_url: "https://pay.example/{reference}",
			},
		},
		sets: "payment:{reference}=pending",
		assumed: ["A5"],
	},
	{
		key: "payment-process",
		request: { method: "POST", path: "/payments/{ref}" },
		response: {
			status: 202,
			body: {
				status: "Accepted",
				message: "Payment processing initiated",
				transaction: { status: "processing" },
			},
		},
		assumed: ["A5", "A6"],
	},
	{
		key: "payment-failed",
		request: { method: "GET", path: "/payments/PI-failed" },
		response: {
			status: 200,
			body: {
				transaction: {
					status: "failed",
					merchant_reference: "PI-failed",
					amount: 1000,
					currency: "xaf",
					reference: "trx.f",
					failure_reason: "insufficient balance",
				},
			},
		},
		assumed: ["A7"],
	},
	{
		key: "payment-pending",
		request: {
			method: "GET",
			path: "/payments/{ref}",
			when: "payment:{ref}=pending",
		},
		response: {
			status: 200,
			body: {
				transaction: {
					status: "pending",
					merchant_reference: "{ref}",
					amount: 1000,
					currency: "XAF",
					reference: "trx.{ref}",
					fee: 30,
					destination: { account: "acc_1" },
				},
			},
		},
		assumed: ["A7", "A14"],
	},
	{
		key: "payment-succeeded",
		request: {
			method: "GET",
			path: "/payments/{ref}",
			when: "payment:{ref}=succeeded",
		},
		response: {
			status: 200,
			body: {
				transaction: {
					status: "complete",
					merchant_reference: "{ref}",
					amount: 1000,
					currency: "XAF",
					reference: "trx.{ref}",
					fee: 30,
					destination: { account: "acc_1" },
				},
			},
		},
		assumed: ["A7", "A14"],
	},
	{
		key: "payment-unknown",
		request: {
			method: "GET",
			path: "/payments/{ref}",
			when: "payment:{ref}=initial",
		},
		response: { status: 404, body: { message: "Payment not found" } },
	},
];

const charge = {
	reference: "PI-1",
	amount: 1000,
	currency: "XAF",
	applicationFee: 100,
	destination: { accountId: "acc_1", amount: 900 },
	customer: { name: "Buyer", email: "b@b.co", phone: "+237600000000" },
	description: "Order",
	callbackUrl: "https://app/cb",
};

describe("NotchPay adapter — charges", () => {
	it("creates a destination charge with fixed amounts only", async () => {
		const { provider, replay } = build(chargeFixtures);
		expect(await provider.createDestinationCharge(charge)).toEqual({
			providerReference: "trx.PI-1",
			checkoutUrl: "https://pay.example/PI-1",
		});
		expect(replay.journal).toEqual([
			{
				method: "POST",
				path: "/payments",
				body: {
					amount: 1000,
					currency: "XAF",
					customer: charge.customer,
					description: "Order",
					reference: "PI-1",
					callback: "https://app/cb",
					application_fee: 100,
					destination: { account: "acc_1", amount: 900 },
				},
			},
		]);
		expect(
			"application_fee_percent" in (replay.journal[0]?.body as object),
		).toBe(false);
	});

	it("refuses a split that does not sum, before any wire call", async () => {
		const { provider, replay } = build(chargeFixtures);
		await expect(
			provider.createDestinationCharge({
				...charge,
				destination: { accountId: "acc_1", amount: 800 },
			}),
		).rejects.toMatchObject({
			name: "ProviderRequestError",
			method: "createDestinationCharge",
			status: 400,
		});
		expect(replay.journal).toHaveLength(0);
	});

	it("starts mobile-money processing from the 202 envelope", async () => {
		const { provider, replay } = build(chargeFixtures);
		expect(
			await provider.chargeMobileMoney("PI-1", {
				channel: "cm.mtn",
				phone: "+237600000000",
			}),
		).toEqual({ status: "pending", action: "Payment processing initiated" });
		expect(replay.journal).toEqual([
			{
				method: "POST",
				path: "/payments/PI-1",
				body: { channel: "cm.mtn", data: { account_number: "+237600000000" } },
			},
		]);
	});

	it("verifies a payment, pending then succeeded", async () => {
		const { provider, replay } = build(chargeFixtures);
		await provider.createDestinationCharge(charge);
		expect(await provider.verifyPayment("PI-1")).toEqual({
			reference: "PI-1",
			status: "pending",
			amount: 1000,
			currency: "XAF",
			providerTransactionId: "trx.PI-1",
			failureCode: null,
			fee: 30,
			accountId: "acc_1",
		});
		replay.setMode("payment:PI-1", "succeeded");
		expect((await provider.verifyPayment("PI-1")).status).toBe("succeeded");
	});

	it("classifies a failure reason", async () => {
		const { provider } = build(chargeFixtures);
		expect(await provider.verifyPayment("PI-failed")).toMatchObject({
			status: "failed",
			currency: "XAF",
			failureCode: "insufficient_funds",
			accountId: null,
		});
	});

	it("maps an unknown reference to a 404", async () => {
		const { provider } = build(chargeFixtures);
		await expect(provider.verifyPayment("PI-nope")).rejects.toMatchObject({
			name: "ProviderRequestError",
			method: "verifyPayment",
			status: 404,
		});
	});
});

const TRANSFER_STATUS_NAMES = [
	"pending",
	"sent",
	"processing",
	"complete",
	"failed",
	"reversed",
];

const moneyOutFixtures: NotchPayFixture[] = [
	{
		key: "refund-list-empty",
		request: {
			method: "GET",
			path: "/payments/{ref}/refunds",
			when: "refunds:{ref}=initial",
		},
		response: { status: 200, body: { refunds: [] } },
	},
	{
		key: "refund-list-made",
		request: {
			method: "GET",
			path: "/payments/{ref}/refunds",
			when: "refunds:{ref}=made",
		},
		response: {
			status: 200,
			body: {
				refunds: [
					{
						id: "ref_{refundIdempotencyKey}",
						status: "pending",
						amount: 500,
						metadata: { idempotency_key: "{refundIdempotencyKey}" },
					},
				],
			},
		},
		assumed: ["A8", "A9"],
	},
	{
		key: "refund-create",
		request: { method: "POST", path: "/refunds" },
		response: {
			status: 201,
			body: {
				refund: { id: "ref_{refundIdempotencyKey}", status: "pending" },
			},
		},
		sets: "refunds:{payment}=made",
		binds: { refundIdempotencyKey: "body.metadata.idempotency_key" },
		assumed: ["A8"],
	},
	{
		key: "refund-with-metadata",
		request: { method: "GET", path: "/refunds/ref_meta" },
		response: {
			status: 200,
			body: {
				refund: {
					id: "ref_meta",
					status: "complete",
					amount: 500,
					currency: "xaf",
					payment: "trx.abc",
					metadata: { idempotency_key: "order:1:1", payment_reference: "PI-9" },
				},
			},
		},
		assumed: ["A9"],
	},
	{
		key: "refund-dashboard",
		request: { method: "GET", path: "/refunds/ref_dash" },
		response: {
			status: 200,
			body: {
				refund: {
					id: "ref_dash",
					status: "failed",
					amount: 300,
					currency: "XAF",
					payment: "trx.abc",
					failure_reason: "account closed",
				},
			},
		},
		assumed: ["A9"],
	},
	{
		key: "payment-by-provider-reference",
		request: { method: "GET", path: "/payments/trx.abc" },
		response: {
			status: 200,
			body: { transaction: { trxref: "PI-9", status: "complete" } },
		},
	},
	{
		key: "payout-create",
		request: { method: "POST", path: "/sync/accounts/{id}/payouts" },
		response: { status: 201, body: { transfer: { id: "tr_pay" } } },
		assumed: ["A10"],
	},
	...TRANSFER_STATUS_NAMES.map(
		(status): NotchPayFixture => ({
			key: `transfer-${status}`,
			request: { method: "GET", path: `/transfers/tr_${status}` },
			response: {
				status: 200,
				body: {
					transfer: {
						id: `tr_${status}`,
						status,
						account: "acc_1",
						reference: "RP-1",
						amount: 700,
						currency: "XAF",
						fee: 20,
						message: "bank refused",
					},
				},
			},
			assumed: ["A15"],
		}),
	),
	{
		key: "transfer-alien",
		request: { method: "GET", path: "/transfers/tr_alien" },
		response: {
			status: 200,
			body: { transfer: { id: "tr_alien", status: "on_hold", amount: 1 } },
		},
	},
	{
		key: "balance-ghost",
		request: { method: "GET", path: "/sync/accounts/ghost/balance" },
		response: { status: 404, body: { message: "Account not found" } },
	},
	{
		key: "balance",
		request: { method: "GET", path: "/sync/accounts/{id}/balance" },
		response: {
			status: 200,
			body: { balance: { available: { XAF: 1500.0, EUR: 3 }, pending: 250 } },
		},
		assumed: ["A11"],
	},
	{
		key: "history",
		request: { method: "GET", path: "/balance/history" },
		response: {
			status: 200,
			body: {
				items: [
					{
						id: "h1",
						type: "payment",
						reference: "trx.PI-1",
						merchant_reference: "PI-1",
						amount: 1000,
						currency: "XAF",
						fee: 30,
						account: "acc_1",
						created_at: "2026-10-01T10:00:00Z",
					},
					{
						id: "h2",
						type: "refund",
						reference: "ref_meta",
						amount: -500,
						currency: "XAF",
						created_at: "2026-10-02T10:00:00Z",
					},
					{
						id: "h3",
						type: "transfer",
						reference: "tr_complete",
						amount: -700,
						currency: "XAF",
						created_at: "2026-10-03T10:00:00Z",
					},
					{
						id: "h4",
						type: "adjustment",
						reference: "ADJ-1",
						amount: -50,
						currency: "XAF",
						created_at: "2026-10-04T10:00:00Z",
					},
				],
			},
		},
		assumed: ["A12"],
	},
];

describe("NotchPay adapter — refunds, transfers, balance", () => {
	const refund = (key: string, amount = 500) => ({
		paymentReference: "PI-1",
		amount,
		reason: "returned",
		idempotencyKey: key,
	});
	const posts = (journal: { method: string }[]) =>
		journal.filter((request) => request.method === "POST");

	it("replays a refund by key with exactly one POST", async () => {
		const { provider, replay } = build(moneyOutFixtures);
		const first = await provider.createRefund(refund("order:1:1"));
		const second = await provider.createRefund(refund("order:1:1"));
		expect(second).toEqual(first);
		expect(first).toEqual({ refundId: "ref_order:1:1", status: "pending" });
		expect(posts(replay.journal)).toEqual([
			{
				method: "POST",
				path: "/refunds",
				body: {
					payment: "PI-1",
					amount: 500,
					reason: "returned",
					metadata: {
						idempotency_key: "order:1:1",
						payment_reference: "PI-1",
					},
				},
				idempotencyKey: "order:1:1",
			},
		]);
	});

	it("refuses the same key with a new amount before any write", async () => {
		const { provider, replay } = build(moneyOutFixtures);
		await provider.createRefund(refund("order:1:1"));
		await expect(
			provider.createRefund(refund("order:1:1", 600)),
		).rejects.toMatchObject({
			name: "ProviderRequestError",
			method: "createRefund",
			status: 409,
		});
		expect(posts(replay.journal)).toHaveLength(1);
	});

	it("mints a second refund for a new key", async () => {
		const { provider, replay } = build(moneyOutFixtures);
		const first = await provider.createRefund(refund("order:1:1"));
		const second = await provider.createRefund(refund("order:1:2"));
		expect(second.refundId).not.toBe(first.refundId);
		expect(posts(replay.journal)).toHaveLength(2);
	});

	it("reads a refund from its metadata without a payment lookup", async () => {
		const { provider, replay } = build(moneyOutFixtures);
		expect(await provider.getRefund("ref_meta")).toEqual({
			refundId: "ref_meta",
			paymentReference: "PI-9",
			idempotencyKey: "order:1:1",
			amount: 500,
			currency: "XAF",
			status: "succeeded",
			failureReason: null,
		});
		expect(replay.journal).toHaveLength(1);
	});

	it("falls back to the payment's trxref for a dashboard refund", async () => {
		const { provider, replay } = build(moneyOutFixtures);
		expect(await provider.getRefund("ref_dash")).toMatchObject({
			paymentReference: "PI-9",
			idempotencyKey: null,
			status: "failed",
			failureReason: "account closed",
		});
		expect(replay.journal.map((request) => request.path)).toEqual([
			"/refunds/ref_dash",
			"/payments/trx.abc",
		]);
	});

	it("releases a payout with the reference as idempotency key", async () => {
		const { provider, replay } = build(moneyOutFixtures);
		expect(
			await provider.releasePayout("acc_1", {
				amount: 700,
				currency: "XAF",
				reference: "PO-1",
			}),
		).toEqual({ transferId: "tr_pay" });
		expect(replay.journal).toEqual([
			{
				method: "POST",
				path: "/sync/accounts/acc_1/payouts",
				body: { amount: 700, currency: "XAF", reference: "PO-1" },
				idempotencyKey: "PO-1",
			},
		]);
	});

	it.each(TRANSFER_STATUS_NAMES)("reads a %s transfer", async (status) => {
		const { provider } = build(moneyOutFixtures);
		expect(await provider.getTransfer(`tr_${status}`)).toEqual({
			transferId: `tr_${status}`,
			accountId: "acc_1",
			reference: "RP-1",
			amount: 700,
			currency: "XAF",
			fee: 20,
			status,
			failureReason: status === "failed" ? "bank refused" : null,
		});
	});

	it("never leaks a transfer status outside the port's vocabulary", async () => {
		const { provider } = build(moneyOutFixtures);
		await expect(provider.getTransfer("tr_alien")).rejects.toMatchObject({
			name: "ProviderRequestError",
			method: "getTransfer",
			status: 502,
		});
	});

	it("reads the XAF balance, and refuses an unknown account", async () => {
		const { provider } = build(moneyOutFixtures);
		expect(await provider.getConnectedAccountBalance("acc_1")).toEqual({
			available: 1500,
			pending: 250,
		});
		await expect(
			provider.getConnectedAccountBalance("ghost"),
		).rejects.toMatchObject({ status: 404 });
	});

	it("lists one page of all four kinds, enriching refunds and transfers", async () => {
		const { provider, replay } = build(moneyOutFixtures);
		expect(
			await provider.listTransactions({
				from: new Date("2026-10-01T00:00:00Z"),
				to: new Date("2026-10-05T00:00:00Z"),
				page: 1,
				accountId: "acc_1",
			}),
		).toEqual([
			{
				providerId: "h1",
				reference: "PI-1",
				accountId: "acc_1",
				amount: 1000,
				currency: "XAF",
				fee: 30,
				occurredAt: "2026-10-01T10:00:00Z",
				entity: "payment",
				status: "succeeded",
			},
			{
				providerId: "ref_meta",
				reference: "order:1:1",
				accountId: null,
				amount: 500,
				currency: "XAF",
				fee: null,
				occurredAt: "2026-10-02T10:00:00Z",
				entity: "refund",
				status: "succeeded",
			},
			{
				providerId: "tr_complete",
				reference: "RP-1",
				accountId: null,
				amount: 700,
				currency: "XAF",
				fee: null,
				occurredAt: "2026-10-03T10:00:00Z",
				entity: "transfer",
				status: "complete",
			},
			{
				providerId: "h4",
				reference: "ADJ-1",
				accountId: null,
				amount: 50,
				currency: "XAF",
				fee: null,
				occurredAt: "2026-10-04T10:00:00Z",
				entity: "debit",
				status: "succeeded",
			},
		]);
		expect(replay.journal[0]).toEqual({
			method: "GET",
			path: "/balance/history",
			query: {
				page: "1",
				limit: "100",
				date_start: "2026-10-01",
				date_end: "2026-10-05",
				account: "acc_1",
			},
		});
	});

	it("declares the debit gap as a capability error", async () => {
		const { provider } = build([]);
		await expect(provider.debitConnectedAccount()).rejects.toMatchObject({
			name: "ProviderCapabilityError",
			message: "notchpay cannot debitConnectedAccount",
		});
	});
});
