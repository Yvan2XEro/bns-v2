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
