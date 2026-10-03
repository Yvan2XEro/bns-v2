// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import {
	type CreateDestinationChargeInput,
	ProviderCapabilityError,
	ProviderRequestError,
	ProviderUnavailableError,
} from "../../src/lib/payments/marketplace";
import { WebhookSignatureError } from "../../src/lib/payments/types";

const T0 = new Date("2026-10-03T09:00:00.000Z");

const chargeInput = (
	overrides: Partial<CreateDestinationChargeInput> = {},
): CreateDestinationChargeInput => ({
	reference: "PI-1",
	amount: 10_300,
	currency: "XAF",
	applicationFee: 1_492,
	destination: { accountId: "acct_seed", amount: 8_808 },
	customer: { email: "buyer@example.test", name: "Awa" },
	description: "Order 1",
	callbackUrl: "https://api.example.test/callback",
	...overrides,
});

const makeFake = () =>
	new FakeMarketplaceProvider({
		now: () => T0,
		accounts: [{ accountId: "acct_seed" }],
	});

/** A succeeded charge on PI-1, the starting point of refund cases. */
async function paidCharge(fake: FakeMarketplaceProvider) {
	await fake.createDestinationCharge(chargeInput());
	fake.script("PI-1", [{ entity: "payment", status: "succeeded" }]);
	fake.advance("PI-1");
}

describe("FakeMarketplaceProvider journal", () => {
	it("records a destination charge with its exact input, and returns deterministic ids", async () => {
		const fake = makeFake();
		const input = chargeInput();

		const result = await fake.createDestinationCharge(input);
		// The caller mutating its object afterwards must not rewrite history.
		input.destination.amount = 1;

		expect(result).toEqual({
			providerReference: "pay_1",
			checkoutUrl: "https://fake-provider.test/checkout/pay_1",
		});
		expect(fake.calls).toEqual([
			{
				method: "createDestinationCharge",
				args: [chargeInput()],
				rejected: false,
			},
		]);
		expect(fake.callsTo("createDestinationCharge")).toEqual([[chargeInput()]]);
	});

	it("records every port call in order, including the ones that reject", async () => {
		const fake = makeFake();
		await fake.createDestinationCharge(chargeInput());
		await fake.chargeMobileMoney("PI-1", {
			channel: "cm.mtn",
			phone: "+237670000000",
		});
		await expect(fake.verifyPayment("PI-404")).rejects.toBeInstanceOf(
			ProviderRequestError,
		);

		expect(fake.calls.map((c) => [c.method, c.rejected])).toEqual([
			["createDestinationCharge", false],
			["chargeMobileMoney", false],
			["verifyPayment", true],
		]);
		expect(fake.calls[1].args).toEqual([
			"PI-1",
			{ channel: "cm.mtn", phone: "+237670000000" },
		]);
	});
});

describe("FakeMarketplaceProvider scripting", () => {
	it("moves a charge through its scripted lifecycle and reports it on verifyPayment", async () => {
		const fake = makeFake();
		fake.script(
			"PI-1",
			[{ entity: "payment", status: "succeeded", fee: 206 }],
			{ action: "Dial *126# to confirm" },
		);
		await fake.createDestinationCharge(chargeInput());

		await expect(
			fake.chargeMobileMoney("PI-1", {
				channel: "cm.mtn",
				phone: "+237670000000",
			}),
		).resolves.toEqual({ status: "pending", action: "Dial *126# to confirm" });
		await expect(fake.verifyPayment("PI-1")).resolves.toEqual({
			reference: "PI-1",
			status: "pending",
			amount: 10_300,
			currency: "XAF",
			providerTransactionId: "pay_1",
			failureCode: null,
			fee: null,
			accountId: "acct_seed",
		});

		const { event } = fake.advance("PI-1");

		expect(event).toEqual({
			entity: "payment",
			providerEventId: "evt_1",
			type: "payment/succeeded",
			reference: "PI-1",
			status: "succeeded",
			amount: 10_300,
			currency: "XAF",
			providerTransactionId: "pay_1",
			accountId: "acct_seed",
			fee: 206,
			failureCode: null,
		});
		await expect(fake.verifyPayment("PI-1")).resolves.toMatchObject({
			status: "succeeded",
			fee: 206,
		});
		expect(() => fake.advance("PI-1")).toThrow(/no scripted outcome left/);
	});

	it("carries a scripted failure code on the event and on verifyPayment", async () => {
		const fake = makeFake();
		await fake.createDestinationCharge(chargeInput());
		fake.script("PI-1", [
			{
				entity: "payment",
				status: "failed",
				failureCode: "insufficient_funds",
			},
		]);

		expect(fake.advance("PI-1").event).toMatchObject({
			type: "payment/failed",
			status: "failed",
			failureCode: "insufficient_funds",
		});
		await expect(fake.verifyPayment("PI-1")).resolves.toMatchObject({
			status: "failed",
			failureCode: "insufficient_funds",
		});
	});

	it("is deterministic: the same script yields the same ids and events", async () => {
		const run = async () => {
			const fake = makeFake();
			const { accountId } = await fake.createConnectedAccount({
				shopId: "shop-1",
				name: "Chez Awa",
				email: "awa@example.test",
				phone: "+237670000001",
				type: "express",
			});
			await fake.createDestinationCharge(chargeInput());
			fake.script("PI-1", [{ entity: "payment", status: "succeeded" }]);
			const paid = fake.advance("PI-1");
			const refund = await fake.createRefund({
				paymentReference: "PI-1",
				amount: 300,
				reason: "order_cancelled",
				idempotencyKey: "order:o1:1",
			});
			fake.script("order:o1:1", [
				{ entity: "refund", status: "processing" },
				{ entity: "refund", status: "succeeded" },
			]);
			return { accountId, paid, refund, rest: fake.advanceAll("order:o1:1") };
		};

		const first = await run();
		expect(first.accountId).toBe("acct_1");
		expect(first.refund).toEqual({ refundId: "re_1", status: "pending" });
		expect(first.rest.map((s) => s.event.providerEventId)).toEqual([
			"evt_2",
			"evt_3",
		]);
		expect(await run()).toEqual(first);
	});

	it("drives a payout and lets the test deliver its events out of order", async () => {
		const fake = makeFake();
		const { transferId } = await fake.releasePayout("acct_seed", {
			amount: 8_808,
			currency: "XAF",
			reference: "PO-1",
		});
		fake.script("PO-1", [
			{ entity: "transfer", status: "sent" },
			{ entity: "transfer", status: "complete", fee: 50 },
		]);

		const [sent, complete] = fake.advanceAll("PO-1");

		expect(transferId).toBe("tr_1");
		expect(complete.event).toEqual({
			entity: "transfer",
			providerEventId: "evt_2",
			type: "transfer/complete",
			reference: "PO-1",
			status: "complete",
			amount: 8_808,
			currency: "XAF",
			providerTransactionId: "tr_1",
			transferId: "tr_1",
			accountId: "acct_seed",
			fee: 50,
			failureReason: null,
		});
		// Provider truth is the last outcome, whatever order delivery takes.
		await expect(fake.getTransfer("tr_1")).resolves.toEqual({
			transferId: "tr_1",
			accountId: "acct_seed",
			reference: "PO-1",
			amount: 8_808,
			currency: "XAF",
			fee: 50,
			status: "complete",
			failureReason: null,
		});
		await expect(
			fake.verifyWebhook(sent.rawBody, sent.headers),
		).resolves.toMatchObject({ status: "sent" });
	});

	it("moves a connected account through onboarding to active", async () => {
		const fake = makeFake();
		const { accountId } = await fake.createConnectedAccount({
			shopId: "shop-1",
			name: "Chez Awa",
			email: "awa@example.test",
			phone: "+237670000001",
			type: "express",
		});
		await fake.setPayoutSchedule(accountId, "manual");
		fake.script(accountId, [
			{
				entity: "account",
				status: "onboarding",
				requirementsDue: ["id_document"],
			},
			{
				entity: "account",
				status: "active",
				chargesEnabled: true,
				payoutsEnabled: true,
				requirementsDue: [],
				kycStatus: "verified",
				kycName: "AWA NDIAYE",
			},
		]);

		const [, active] = fake.advanceAll(accountId);

		expect(active.event).toEqual({
			entity: "account",
			providerEventId: "evt_2",
			type: "account/active",
			reference: "",
			status: "active",
			amount: null,
			currency: null,
			providerTransactionId: null,
			accountId: "acct_1",
		});
		await expect(fake.getConnectedAccount(accountId)).resolves.toEqual({
			accountId: "acct_1",
			status: "active",
			chargesEnabled: true,
			payoutsEnabled: true,
			requirementsDue: [],
			kycStatus: "verified",
			kycName: "AWA NDIAYE",
			payoutSchedule: "manual",
		});
		await expect(
			fake.createOnboardingLink(accountId, {
				returnUrl: "https://web.test/done",
				refreshUrl: "https://web.test/again",
			}),
		).resolves.toEqual({
			url: "https://fake-provider.test/onboarding/acct_1/1",
		});
	});
});

describe("FakeMarketplaceProvider provider rules", () => {
	it("refuses a destination charge whose fixed amounts do not add up", async () => {
		const fake = makeFake();
		await expect(
			fake.createDestinationCharge(chargeInput({ applicationFee: 1_493 })),
		).rejects.toMatchObject({
			name: "ProviderRequestError",
			status: 400,
			method: "createDestinationCharge",
		});
		await expect(
			fake.createDestinationCharge(
				chargeInput({ destination: { accountId: "acct_x", amount: 8_808 } }),
			),
		).rejects.toMatchObject({ status: 404 });
		await fake.createDestinationCharge(chargeInput());
		await expect(
			fake.createDestinationCharge(chargeInput()),
		).rejects.toMatchObject({ status: 409 });
	});

	it("replays a refund by idempotency key and refuses a conflicting reuse", async () => {
		const fake = makeFake();
		await paidCharge(fake);
		const input = {
			paymentReference: "PI-1",
			amount: 10_300,
			reason: "order_cancelled",
			idempotencyKey: "order:o1:1",
		};

		const first = await fake.createRefund(input);
		const replay = await fake.createRefund(input);

		expect(replay).toEqual(first);
		expect(fake.callsTo("createRefund")).toHaveLength(2);
		await expect(
			fake.createRefund({ ...input, amount: 100 }),
		).rejects.toMatchObject({ status: 409 });
		await expect(
			fake.createRefund({ ...input, amount: 1, idempotencyKey: "order:o1:2" }),
		).rejects.toMatchObject({ status: 400 });
		await expect(fake.getRefund(first.refundId)).resolves.toEqual({
			refundId: "re_1",
			paymentReference: "PI-1",
			idempotencyKey: "order:o1:1",
			amount: 10_300,
			currency: "XAF",
			status: "pending",
			failureReason: null,
		});
	});

	it("refuses to refund a charge that has not succeeded", async () => {
		const fake = makeFake();
		await fake.createDestinationCharge(chargeInput());
		await expect(
			fake.createRefund({
				paymentReference: "PI-1",
				amount: 100,
				reason: "order_cancelled",
				idempotencyKey: "order:o1:1",
			}),
		).rejects.toMatchObject({ status: 400 });
	});
});

describe("FakeMarketplaceProvider failure injection", () => {
	it("failWhen rejects with a 5xx-shaped ProviderUnavailableError and journals the attempt", async () => {
		const fake = makeFake();
		await paidCharge(fake);
		fake.failWhen("createRefund");
		const input = {
			paymentReference: "PI-1",
			amount: 500,
			reason: "seller_declined",
			idempotencyKey: "order:o1:1",
		};

		const error = await fake.createRefund(input).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ProviderUnavailableError);
		expect(error).toMatchObject({ status: 503, method: "createRefund" });
		expect(fake.calls.at(-1)).toEqual({
			method: "createRefund",
			args: [input],
			rejected: true,
		});
		// Nothing reached the provider: the refund does not exist.
		await expect(
			fake.listTransactions({
				from: T0,
				to: new Date(T0.getTime() + 1),
				page: 1,
			}),
		).resolves.toHaveLength(1);
		// Other methods are unaffected.
		await expect(fake.verifyPayment("PI-1")).resolves.toMatchObject({
			status: "succeeded",
		});
	});

	it("failWhen with times fails that many calls, then lets them through", async () => {
		const fake = makeFake();
		await paidCharge(fake);
		fake.failWhen("createRefund", { times: 2 });
		const input = {
			paymentReference: "PI-1",
			amount: 500,
			reason: "seller_declined",
			idempotencyKey: "order:o1:1",
		};

		await expect(fake.createRefund(input)).rejects.toBeInstanceOf(
			ProviderUnavailableError,
		);
		await expect(fake.createRefund(input)).rejects.toBeInstanceOf(
			ProviderUnavailableError,
		);
		await expect(fake.createRefund(input)).resolves.toEqual({
			refundId: "re_1",
			status: "pending",
		});
		expect(
			fake.calls
				.filter((c) => c.method === "createRefund")
				.map((c) => c.rejected),
		).toEqual([true, true, false]);
	});

	it("failWhen with a predicate fails only the matching calls", async () => {
		const fake = makeFake();
		fake.failWhen("getConnectedAccountBalance", {
			when: ([accountId]) => accountId === "acct_seed",
		});
		fake.seedAccount({ accountId: "acct_other" });
		fake.setBalance("acct_other", { available: 1_000, pending: 250 });

		await expect(
			fake.getConnectedAccountBalance("acct_seed"),
		).rejects.toBeInstanceOf(ProviderUnavailableError);
		await expect(
			fake.getConnectedAccountBalance("acct_other"),
		).resolves.toEqual({ available: 1_000, pending: 250 });
	});

	it("unsupported surfaces a ProviderCapabilityError naming the provider and method", async () => {
		const fake = makeFake();
		fake.unsupported("debitConnectedAccount");

		const error = await fake
			.debitConnectedAccount("acct_seed", {
				amount: 100,
				reference: "DB-1",
				description: "clawback",
			})
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ProviderCapabilityError);
		expect(error).toMatchObject({
			provider: "fake",
			method: "debitConnectedAccount",
			message: "fake cannot debitConnectedAccount",
		});
	});
});

describe("FakeMarketplaceProvider webhooks", () => {
	it("emits a signed body that verifyWebhook accepts and parses back to the same event", async () => {
		const fake = makeFake();
		const signed = fake.emit({
			entity: "refund",
			reference: "order:o1:1",
			status: "succeeded",
			amount: 500,
			currency: "XAF",
			providerTransactionId: "re_9",
			refundId: "re_9",
			paymentReference: "PI-1",
			accountId: "acct_seed",
			fee: null,
		});

		expect(signed.event).toEqual({
			entity: "refund",
			providerEventId: "evt_1",
			type: "refund/succeeded",
			reference: "order:o1:1",
			status: "succeeded",
			amount: 500,
			currency: "XAF",
			providerTransactionId: "re_9",
			refundId: "re_9",
			paymentReference: "PI-1",
			accountId: "acct_seed",
			fee: null,
		});
		expect(Object.keys(signed.headers)).toEqual(["x-fake-signature"]);
		expect(signed.headers["x-fake-signature"]).toMatch(/^[0-9a-f]{64}$/);
		await expect(
			fake.verifyWebhook(signed.rawBody, signed.headers),
		).resolves.toEqual(signed.event);
		expect(fake.parseWebhookEvent(JSON.parse(signed.rawBody))).toEqual(
			signed.event,
		);
	});

	it("rejects a tampered body, a foreign signature and a missing one", async () => {
		const fake = makeFake();
		const other = new FakeMarketplaceProvider({ webhookSecret: "other" });
		const { rawBody, headers } = fake.emit({
			entity: "debit",
			reference: "DB-1",
			status: "succeeded",
			amount: 400,
			currency: "XAF",
			providerTransactionId: "dbt_1",
			debitId: "dbt_1",
			accountId: "acct_seed",
		});
		const tampered = rawBody.replace('"amount":400', '"amount":40000');

		expect(tampered).not.toBe(rawBody);
		await expect(fake.verifyWebhook(tampered, headers)).rejects.toBeInstanceOf(
			WebhookSignatureError,
		);
		await expect(
			fake.verifyWebhook(rawBody, other.sign(rawBody)),
		).rejects.toBeInstanceOf(WebhookSignatureError);
		await expect(fake.verifyWebhook(rawBody, {})).rejects.toBeInstanceOf(
			WebhookSignatureError,
		);
		// The genuine pair still passes, so the rejections above are about the tampering.
		await expect(fake.verifyWebhook(rawBody, headers)).resolves.toMatchObject({
			entity: "debit",
			amount: 400,
		});
	});

	it("refuses to parse a body that is not a normalised event", () => {
		const fake = makeFake();
		expect(() =>
			fake.parseWebhookEvent({ entity: "payment", status: "paid" }),
		).toThrow(/not a normalised event/);
	});
});

describe("FakeMarketplaceProvider reconciliation surface", () => {
	it("lists the provider's transactions by window, account and page", async () => {
		let now = T0;
		const fake = new FakeMarketplaceProvider({
			now: () => now,
			pageSize: 2,
			accounts: [{ accountId: "acct_seed" }, { accountId: "acct_b" }],
		});
		await fake.createDestinationCharge(chargeInput());
		now = new Date("2026-10-03T10:00:00.000Z");
		await fake.releasePayout("acct_b", {
			amount: 700,
			currency: "XAF",
			reference: "PO-1",
		});
		fake.seedPayment({
			reference: "PI-ghost",
			amount: 2_000,
			currency: "XAF",
			status: "succeeded",
			accountId: "acct_seed",
		});
		fake.addTransaction({
			entity: "payment",
			providerId: "pay_unfetchable",
			reference: null,
			accountId: "acct_seed",
			amount: 900,
			currency: "XAF",
			fee: null,
			status: "succeeded",
			occurredAt: "2026-10-03T11:00:00.000Z",
		});
		const window = {
			from: T0,
			to: new Date("2026-10-04T00:00:00.000Z"),
		};

		const page1 = await fake.listTransactions({ ...window, page: 1 });
		const page2 = await fake.listTransactions({ ...window, page: 2 });
		const page3 = await fake.listTransactions({ ...window, page: 3 });

		expect([...page1, ...page2].map((t) => t.providerId)).toEqual([
			"pay_1",
			"tr_1",
			"pay_2",
			"pay_unfetchable",
		]);
		expect(page3).toEqual([]);
		expect(page1[0]).toEqual({
			entity: "payment",
			providerId: "pay_1",
			reference: "PI-1",
			accountId: "acct_seed",
			amount: 10_300,
			currency: "XAF",
			fee: null,
			status: "pending",
			occurredAt: "2026-10-03T09:00:00.000Z",
		});
		await expect(
			fake.listTransactions({ ...window, page: 1, accountId: "acct_b" }),
		).resolves.toMatchObject([{ providerId: "tr_1", entity: "transfer" }]);
		await expect(
			fake.listTransactions({
				from: new Date("2026-10-03T09:30:00.000Z"),
				to: new Date("2026-10-03T10:30:00.000Z"),
				page: 1,
			}),
		).resolves.toMatchObject([{ providerId: "tr_1" }, { providerId: "pay_2" }]);
		// A seeded payment is fetchable; a bare transaction row is not.
		await expect(fake.verifyPayment("PI-ghost")).resolves.toMatchObject({
			status: "succeeded",
			amount: 2_000,
			providerTransactionId: "pay_2",
		});
	});

	it("reports the balance a test sets, zero by default, and refuses an unknown account", async () => {
		const fake = makeFake();
		await expect(fake.getConnectedAccountBalance("acct_seed")).resolves.toEqual(
			{ available: 0, pending: 0 },
		);
		fake.setBalance("acct_seed", { available: 8_808, pending: 1 });
		await expect(fake.getConnectedAccountBalance("acct_seed")).resolves.toEqual(
			{ available: 8_808, pending: 1 },
		);
		await expect(
			fake.getConnectedAccountBalance("acct_nope"),
		).rejects.toMatchObject({ status: 404 });
	});

	it("debits a connected account and reports the debit's lifecycle", async () => {
		const fake = makeFake();
		const { debitId } = await fake.debitConnectedAccount("acct_seed", {
			amount: 400,
			reference: "DB-1",
			description: "clawback order o1",
		});
		fake.script("DB-1", [{ entity: "debit", status: "succeeded" }]);

		expect(debitId).toBe("dbt_1");
		expect(fake.advance("DB-1").event).toEqual({
			entity: "debit",
			providerEventId: "evt_1",
			type: "debit/succeeded",
			reference: "DB-1",
			status: "succeeded",
			amount: 400,
			currency: "XAF",
			providerTransactionId: "dbt_1",
			debitId: "dbt_1",
			accountId: "acct_seed",
		});
	});
});
