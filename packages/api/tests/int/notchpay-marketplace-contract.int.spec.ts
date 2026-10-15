// @vitest-environment node
import { describe, expect, it } from "vitest";
import { WebhookSignatureError } from "../../src/lib/payments/types";
import { runMarketplaceContract } from "./helpers/marketplaceContract";
import {
	loadWebhookTemplates,
	makeReplayProvider,
	notchpayRecordedDriver,
	signedFromTemplate,
} from "./helpers/notchpayContractDriver";
import { loadNotchpayFixtures, readVerified } from "./helpers/notchpayReplay";

runMarketplaceContract(
	() => makeReplayProvider().provider,
	notchpayRecordedDriver,
);

describe("NotchPay recorded driver", () => {
	it("settles a payout through sent, then complete", async () => {
		const { provider } = makeReplayProvider();
		const accountId = await notchpayRecordedDriver.activeAccount(provider);
		const { transferId } = await provider.releasePayout(accountId, {
			amount: 5_000,
			currency: "XAF",
			reference: "PO-sequence",
		});
		const webhooks = await notchpayRecordedDriver.settleTransfer(provider, {
			transferId,
			reference: "PO-sequence",
		});
		const events = await Promise.all(
			webhooks.map((w) => provider.verifyWebhook(w.rawBody, w.headers)),
		);
		expect(events.map((e) => e.type)).toEqual([
			"transfer/sent",
			"transfer/complete",
		]);
	});

	describe("account events", () => {
		const { provider } = makeReplayProvider();
		const verify = (key: string) => {
			const { rawBody, headers } = signedFromTemplate(key, {
				account: "acc_1",
			});
			return provider.verifyWebhook(rawBody, headers);
		};

		it("reads a mapped status and a bare account.created", async () => {
			expect(await verify("account-updated-active-sync")).toMatchObject({
				entity: "account",
				status: "active",
				accountId: "acc_1",
			});
			expect(await verify("account-created-bare-sync")).toMatchObject({
				entity: "account",
				status: "created",
			});
		});

		it("refuses an unmapped status as the fake does, never guessing one", async () => {
			await expect(
				verify("account-updated-unmapped-sync"),
			).rejects.toBeInstanceOf(WebhookSignatureError);
		});
	});
});

// The record run moves tags into fixtures/notchpay/manifest/verified.json; it is
// never edited by hand, so a tag can neither rot nor appear unledgered.
const LEDGER = Array.from({ length: 16 }, (_, i) => `A${i + 1}`);

describe("NotchPay fixture manifest", () => {
	const carriers = [
		...loadNotchpayFixtures().map((f) => ({ key: f.key, assumed: f.assumed })),
		...loadWebhookTemplates().map((t) => ({ key: t.key, assumed: t.assumed })),
	];

	it("carries only ledgered assumption tags", () => {
		for (const { key, assumed } of carriers)
			for (const tag of assumed ?? [])
				expect(LEDGER, `${key} carries ${tag}`).toContain(tag);
	});

	it("accounts for exactly the assumptions still open", () => {
		const present = new Set(carriers.flatMap((c) => c.assumed ?? []));
		const verified = readVerified();
		for (const tag of verified) expect(present.has(tag)).toBe(false);
		expect(
			[...present, ...verified].sort(
				(a, b) => Number(a.slice(1)) - Number(b.slice(1)),
			),
		).toEqual(LEDGER);
	});

	it("keeps fixture keys unique", () => {
		const keys = carriers.map((c) => c.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
