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
