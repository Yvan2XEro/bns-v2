import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FakeMarketplaceProvider } from "../../../src/lib/payments/fakeMarketplace";
import {
	type ConnectedAccountStatus,
	type MarketplaceMethod,
	type MarketplaceProvider,
	type NormalisedEvent,
	type NormalisedRefundStatus,
	type NormalisedTransferStatus,
	ProviderCapabilityError,
	ProviderRequestError,
} from "../../../src/lib/payments/marketplace";
import { WebhookSignatureError } from "../../../src/lib/payments/types";

/**
 * The port's semantics, written against `MarketplaceProvider` alone. It runs
 * today against the fake and, unchanged, against any future adapter in its
 * sandbox. The only adapter-specific part is the driver: the few things a test
 * cannot do through the port itself (finish onboarding, have the payer
 * approve, let a transfer land, put money on an account). A sandbox driver
 * does them with the provider's test tooling, or by polling.
 *
 * Lives outside the spec file so an adapter's spec can import it without also
 * running the fake's suite; the contract spec re-exports it.
 */

export interface SignedWebhook {
	rawBody: string;
	headers: Record<string, string>;
}

export interface MarketplaceContractDriver {
	/** An account that can take charges and receive payouts right now. */
	activeAccount(provider: MarketplaceProvider): Promise<string>;
	/** Whatever the seller does on the onboarding page, done. */
	completeOnboarding(
		provider: MarketplaceProvider,
		accountId: string,
	): Promise<void>;
	/** The payer approves the charge; returns the webhook the provider sends. */
	settlePayment(
		provider: MarketplaceProvider,
		reference: string,
	): Promise<SignedWebhook>;
	/** The payout lands; returns every webhook the provider sends on the way, in order. */
	settleTransfer(
		provider: MarketplaceProvider,
		transfer: { transferId: string; reference: string },
	): Promise<SignedWebhook[]>;
	/** Puts money on the account and returns the balance the provider should now report. */
	seedBalance(
		provider: MarketplaceProvider,
		accountId: string,
	): Promise<{ available: number; pending: number }>;
	/** A port call this provider cannot make; omit it when the adapter covers every method. */
	capabilityGap?: (provider: MarketplaceProvider) => {
		method: MarketplaceMethod;
		call: () => Promise<unknown>;
	};
}

// Records so a status added to the port without being added here fails to compile.
const ACCOUNT_PRE_ONBOARDING: Record<ConnectedAccountStatus, boolean> = {
	created: true,
	onboarding: true,
	restricted: true,
	active: false,
	disabled: false,
	deauthorized: false,
};
const REFUND_STATUSES: Record<NormalisedRefundStatus, true> = {
	pending: true,
	processing: true,
	succeeded: true,
	failed: true,
};
const TRANSFER_STATUSES: Record<NormalisedTransferStatus, true> = {
	pending: true,
	sent: true,
	processing: true,
	complete: true,
	failed: true,
	reversed: true,
};

const BUYER_TOTAL = 10_300;
const APPLICATION_FEE = 1_492;
const DESTINATION_AMOUNT = 8_808;
const WHOLE_HISTORY = {
	from: new Date("2000-01-01T00:00:00.000Z"),
	to: new Date("2100-01-01T00:00:00.000Z"),
};

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected the call to reject, it resolved");
}

const flipLast = (value: string) =>
	value.slice(0, -1) + (value.endsWith("0") ? "1" : "0");

export function runMarketplaceContract(
	makeProvider: () => MarketplaceProvider,
	driver: MarketplaceContractDriver = fakeContractDriver,
): void {
	const nonce = randomUUID().slice(0, 8);
	let sequence = 0;
	const ref = (prefix: string) => `${prefix}-contract-${nonce}-${++sequence}`;

	async function charge(provider: MarketplaceProvider, accountId: string) {
		const reference = ref("PI");
		const result = await provider.createDestinationCharge({
			reference,
			amount: BUYER_TOTAL,
			currency: "XAF",
			applicationFee: APPLICATION_FEE,
			destination: { accountId, amount: DESTINATION_AMOUNT },
			customer: { email: "contract-buyer@example.test", name: "Contract" },
			description: `Contract charge ${reference}`,
			callbackUrl: "https://api.example.test/payments/callback",
		});
		return { reference, result };
	}

	async function paidCharge(provider: MarketplaceProvider) {
		const accountId = await driver.activeAccount(provider);
		const { reference } = await charge(provider, accountId);
		const webhook = await driver.settlePayment(provider, reference);
		return { accountId, reference, webhook };
	}

	describe("MarketplaceProvider contract", () => {
		it("account: created, onboarded through a link, then active with charges and payouts", async () => {
			const provider = makeProvider();
			const { accountId } = await provider.createConnectedAccount({
				shopId: ref("shop"),
				name: "Contract Shop",
				email: "contract-shop@example.test",
				phone: "+237670000000",
				type: "express",
			});
			expect(accountId).toMatch(/\S/);

			const fresh = await provider.getConnectedAccount(accountId);
			expect(fresh.accountId).toBe(accountId);
			expect(ACCOUNT_PRE_ONBOARDING[fresh.status]).toBe(true);
			expect([fresh.chargesEnabled, fresh.payoutsEnabled]).toEqual([
				false,
				false,
			]);

			const { url } = await provider.createOnboardingLink(accountId, {
				returnUrl: "https://app.example.test/seller/payments/return",
				refreshUrl: "https://app.example.test/seller/payments/refresh",
			});
			expect(new URL(url).protocol).toBe("https:");

			await driver.completeOnboarding(provider, accountId);
			await provider.setPayoutSchedule(accountId, "manual");
			const onboarded = await provider.getConnectedAccount(accountId);
			expect(onboarded).toMatchObject({
				accountId,
				status: "active",
				chargesEnabled: true,
				payoutsEnabled: true,
				requirementsDue: [],
				payoutSchedule: "manual",
			});
		});

		it("account: an unknown account is a 404 request error", async () => {
			const provider = makeProvider();
			const error = await rejectionOf(
				provider.getConnectedAccount(ref("acct-unknown")),
			);
			expect(error).toBeInstanceOf(ProviderRequestError);
			expect(error).toMatchObject({
				method: "getConnectedAccount",
				status: 404,
			});
		});

		it("charge: a destination charge carries the fixed application fee and destination amount", async () => {
			const provider = makeProvider();
			const accountId = await driver.activeAccount(provider);
			const { reference, result } = await charge(provider, accountId);
			expect(result.providerReference).toMatch(/\S/);

			const payment = await provider.verifyPayment(reference);
			expect(payment).toMatchObject({
				reference,
				status: "pending",
				amount: BUYER_TOTAL,
				currency: "XAF",
				accountId,
			});
		});

		it("charge: a split that does not sum to the amount is refused before any money moves", async () => {
			const provider = makeProvider();
			const accountId = await driver.activeAccount(provider);
			const reference = ref("PI");
			const error = await rejectionOf(
				provider.createDestinationCharge({
					reference,
					amount: BUYER_TOTAL,
					currency: "XAF",
					applicationFee: APPLICATION_FEE,
					destination: { accountId, amount: DESTINATION_AMOUNT + 1 },
					customer: { email: "contract-buyer@example.test" },
					description: "Inconsistent split",
					callbackUrl: "https://api.example.test/payments/callback",
				}),
			);
			expect(error).toBeInstanceOf(ProviderRequestError);
			expect(error).toMatchObject({
				method: "createDestinationCharge",
				status: 400,
			});
			const unknown = await rejectionOf(provider.verifyPayment(reference));
			expect(unknown).toMatchObject({ method: "verifyPayment", status: 404 });
		});

		it("webhook: a genuine body verifies to the settled payment, and parses back to the same event", async () => {
			const provider = makeProvider();
			const { accountId, reference, webhook } = await paidCharge(provider);

			const event = await provider.verifyWebhook(
				webhook.rawBody,
				webhook.headers,
			);
			expect(event).toMatchObject({
				entity: "payment",
				reference,
				status: "succeeded",
				amount: BUYER_TOTAL,
				currency: "XAF",
				accountId,
			});
			expect(event.providerEventId).toMatch(/\S/);
			expect(provider.parseWebhookEvent(JSON.parse(webhook.rawBody))).toEqual(
				event,
			);
			expect((await provider.verifyPayment(reference)).status).toBe(
				"succeeded",
			);
		});

		it("webhook: a tampered body or a tampered signature is rejected", async () => {
			const provider = makeProvider();
			const { webhook } = await paidCharge(provider);

			const tamperedBody = webhook.rawBody.replace(String(BUYER_TOTAL), "1");
			expect(tamperedBody).not.toBe(webhook.rawBody);
			const bodyError = await rejectionOf(
				provider.verifyWebhook(tamperedBody, webhook.headers),
			);
			expect(bodyError).toBeInstanceOf(WebhookSignatureError);

			const tamperedHeaders = Object.fromEntries(
				Object.entries(webhook.headers).map(([k, v]) => [k, flipLast(v)]),
			);
			const signatureError = await rejectionOf(
				provider.verifyWebhook(webhook.rawBody, tamperedHeaders),
			);
			expect(signatureError).toBeInstanceOf(WebhookSignatureError);
		});

		it("refund: the same idempotency key returns the same refund and creates nothing new", async () => {
			const provider = makeProvider();
			const { reference } = await paidCharge(provider);
			const idempotencyKey = ref("refund");
			const input = {
				paymentReference: reference,
				amount: 3_000,
				reason: "contract",
				idempotencyKey,
			};

			const first = await provider.createRefund(input);
			const replay = await provider.createRefund(input);
			expect(replay.refundId).toBe(first.refundId);
			expect(REFUND_STATUSES[replay.status]).toBe(true);

			expect(await provider.getRefund(first.refundId)).toMatchObject({
				refundId: first.refundId,
				paymentReference: reference,
				idempotencyKey,
				amount: 3_000,
				currency: "XAF",
			});
			const listed = (
				await provider.listTransactions({ ...WHOLE_HISTORY, page: 1 })
			).filter((t) => t.entity === "refund" && t.reference === idempotencyKey);
			expect(listed).toHaveLength(1);

			const other = await provider.createRefund({
				...input,
				idempotencyKey: ref("refund"),
			});
			expect(other.refundId).not.toBe(first.refundId);
		});

		it("refund: reusing a key for a different amount is a 409, not a second refund", async () => {
			const provider = makeProvider();
			const { reference } = await paidCharge(provider);
			const input = {
				paymentReference: reference,
				amount: 3_000,
				reason: "contract",
				idempotencyKey: ref("refund"),
			};
			await provider.createRefund(input);
			const error = await rejectionOf(
				provider.createRefund({ ...input, amount: 2_000 }),
			);
			expect(error).toBeInstanceOf(ProviderRequestError);
			expect(error).toMatchObject({ method: "createRefund", status: 409 });
		});

		it("transfer: every status a payout reports, fetched or delivered, is a normalised one", async () => {
			const provider = makeProvider();
			const accountId = await driver.activeAccount(provider);
			const reference = ref("PO");
			const { transferId } = await provider.releasePayout(accountId, {
				amount: 5_000,
				currency: "XAF",
				reference,
			});

			const submitted = await provider.getTransfer(transferId);
			expect(submitted).toMatchObject({
				transferId,
				accountId,
				reference,
				amount: 5_000,
				currency: "XAF",
			});
			expect(TRANSFER_STATUSES[submitted.status]).toBe(true);

			const webhooks = await driver.settleTransfer(provider, {
				transferId,
				reference,
			});
			expect(webhooks.length).toBeGreaterThan(0);
			const events: NormalisedEvent[] = [];
			for (const webhook of webhooks)
				events.push(
					await provider.verifyWebhook(webhook.rawBody, webhook.headers),
				);
			const transferEvents = events.flatMap((e) =>
				e.entity === "transfer" ? [e] : [],
			);
			expect(transferEvents).toHaveLength(webhooks.length);
			for (const event of transferEvents) {
				expect(event).toMatchObject({ transferId, accountId, reference });
				expect(event.type).toBe(`transfer/${event.status}`);
				expect(TRANSFER_STATUSES[event.status]).toBe(true);
			}
			const landed = await provider.getTransfer(transferId);
			expect(landed.status).toBe("complete");
			expect(transferEvents.at(-1)?.status).toBe(landed.status);
		});

		it("balance: a funded account answers its balance; an unknown account is a 404", async () => {
			const provider = makeProvider();
			const accountId = await driver.activeAccount(provider);
			const expected = await driver.seedBalance(provider, accountId);
			expect(await provider.getConnectedAccountBalance(accountId)).toEqual(
				expected,
			);

			const error = await rejectionOf(
				provider.getConnectedAccountBalance(ref("acct-unknown")),
			);
			expect(error).toBeInstanceOf(ProviderRequestError);
			expect(error).toMatchObject({
				method: "getConnectedAccountBalance",
				status: 404,
			});
		});

		it.runIf(driver.capabilityGap !== undefined)(
			"capability: a call the provider cannot make surfaces as ProviderCapabilityError naming it",
			async () => {
				const provider = makeProvider();
				const gap = driver.capabilityGap?.(provider);
				if (!gap) throw new Error("the driver declared no capability gap");
				const error = await rejectionOf(gap.call());
				expect(error).toBeInstanceOf(ProviderCapabilityError);
				expect(error).toMatchObject({
					provider: provider.id,
					method: gap.method,
					message: `${provider.id} cannot ${gap.method}`,
				});
			},
		);
	});
}

function asFake(provider: MarketplaceProvider): FakeMarketplaceProvider {
	if (!(provider instanceof FakeMarketplaceProvider))
		throw new Error(
			`the fake driver drives FakeMarketplaceProvider, not ${provider.id}: pass the adapter's own driver`,
		);
	return provider;
}

let fakeAccounts = 0;

export const fakeContractDriver: MarketplaceContractDriver = {
	async activeAccount(provider) {
		const accountId = `acct_contract_${++fakeAccounts}`;
		asFake(provider).seedAccount({ accountId });
		return accountId;
	},
	async completeOnboarding(provider, accountId) {
		const fake = asFake(provider);
		fake.script(accountId, [
			{ entity: "account", status: "onboarding" },
			{
				entity: "account",
				status: "active",
				chargesEnabled: true,
				payoutsEnabled: true,
			},
		]);
		fake.advanceAll(accountId);
	},
	async settlePayment(provider, reference) {
		const fake = asFake(provider);
		fake.script(reference, [{ entity: "payment", status: "succeeded" }]);
		const { rawBody, headers } = fake.advance(reference);
		return { rawBody, headers };
	},
	async settleTransfer(provider, { reference }) {
		const fake = asFake(provider);
		fake.script(reference, [
			{ entity: "transfer", status: "sent" },
			{ entity: "transfer", status: "complete", fee: 50 },
		]);
		return fake
			.advanceAll(reference)
			.map(({ rawBody, headers }) => ({ rawBody, headers }));
	},
	async seedBalance(provider, accountId) {
		const balance = { available: 41_500, pending: 7_200 };
		asFake(provider).setBalance(accountId, balance);
		return balance;
	},
	capabilityGap(provider) {
		asFake(provider).unsupported("debitConnectedAccount");
		return {
			method: "debitConnectedAccount",
			call: () =>
				provider.debitConnectedAccount("acct_contract_any", {
					amount: 1_000,
					reference: "DB-contract",
					description: "capability probe",
				}),
		};
	},
};
