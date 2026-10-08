import { existsSync, readFileSync } from "node:fs";
import { NotchPayMarketplaceProvider } from "../../../src/lib/payments/notchpayMarketplace";
import { liveTransport } from "../../../src/lib/payments/notchpayWire";
import {
	type InboxDelivery,
	parseInbox,
} from "../../../src/scripts/webhookInbox";
import type {
	MarketplaceContractDriver,
	SignedWebhook,
} from "./marketplaceContract";
import { chargeOf, payoutOf } from "./notchpayContractDriver";
import { RecordTransport } from "./notchpayReplay";

type Env = Record<string, string | undefined>;

export const isRecordRun = (env: Env): boolean =>
	env.NOTCHPAY_SANDBOX === "record";

export interface SandboxConfig {
	publicKey: string;
	privateKey: string;
	hashKey: string;
	inbox: string;
	channel: string;
	phone: string;
	baseUrl?: string;
}

const REQUIRED = [
	["NOTCHPAY_PUBLIC_KEY", "publicKey"],
	["NOTCHPAY_PRIVATE_KEY", "privateKey"],
	["NOTCHPAY_HASH_KEY", "hashKey"],
	["NOTCHPAY_WEBHOOK_INBOX", "inbox"],
	["NOTCHPAY_TEST_CHANNEL", "channel"],
	["NOTCHPAY_TEST_PHONE", "phone"],
] as const;

export function sandboxConfig(env: Env): SandboxConfig {
	const missing = REQUIRED.filter(([name]) => !env[name]).map(([n]) => n);
	if (missing.length > 0)
		throw new Error(
			`NotchPay sandbox pass refuses to run without: ${missing.join(", ")}`,
		);
	const [publicKey, privateKey, hashKey, inbox, channel, phone] = REQUIRED.map(
		([name]) => env[name] as string,
	) as [string, string, string, string, string, string];
	if (/live/i.test(publicKey))
		throw new Error(
			"NOTCHPAY_PUBLIC_KEY looks like a live key; use sandbox keys",
		);
	return {
		publicKey,
		privateKey,
		hashKey,
		inbox,
		channel,
		phone,
		baseUrl: env.NOTCHPAY_BASE_URL || undefined,
	};
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const eventTypeOf = (rawBody: string): string => {
	const body = JSON.parse(rawBody) as { type?: string; event?: string };
	return body.type ?? body.event ?? "";
};

/** Polls the inbox until `done` accepts the matching deliveries, or fails naming the manual step. */
export async function waitForDeliveries(
	inbox: string,
	match: (delivery: InboxDelivery) => boolean,
	done: (found: InboxDelivery[]) => boolean,
	options: { timeoutMs: number; step: string; pollMs?: number },
): Promise<InboxDelivery[]> {
	const deadline = Date.now() + options.timeoutMs;
	for (;;) {
		const found = existsSync(inbox)
			? parseInbox(readFileSync(inbox, "utf8")).filter(match)
			: [];
		if (done(found)) return found;
		if (Date.now() >= deadline)
			throw new Error(
				`No matching webhook reached ${inbox} within ${options.timeoutMs / 1000}s. ${options.step} Is the tunnel up and registered as the sandbox webhook endpoint?`,
			);
		await sleep(options.pollMs ?? 1_000);
	}
}

const signed = (d: InboxDelivery): SignedWebhook => ({
	rawBody: d.rawBody,
	headers: d.headers,
});

const WEBHOOK_TIMEOUT_MS = 120_000;
const HUMAN_TIMEOUT_MS = 600_000;

export const debitGap: NonNullable<
	MarketplaceContractDriver["capabilityGap"]
> = (p) => ({
	method: "debitConnectedAccount",
	call: () =>
		p.debitConnectedAccount("acct_contract_any", {
			amount: 1_000,
			reference: "DB-contract",
			description: "capability probe",
		}),
});

export function createSandbox(env: Env = process.env) {
	const config = sandboxConfig(env);
	const baseUrl = config.baseUrl ?? "https://api.notchpay.co";
	const wire = {
		baseUrl,
		publicKey: config.publicKey,
		privateKey: config.privateKey,
	};
	const recorder = new RecordTransport(liveTransport(wire), {
		secrets: [config.publicKey, config.privateKey, config.hashKey],
	});
	const build = (transport: ReturnType<RecordTransport["transport"]>) =>
		new NotchPayMarketplaceProvider({
			publicKey: config.publicKey,
			privateKey: config.privateKey,
			hashKey: config.hashKey,
			transport,
		});
	const provider = build(recorder.transport());
	// Polls without recording: a half-finished state must never become a fixture.
	const watcher = build(liveTransport(wire));

	let shared: Promise<string> | undefined;
	const driver: MarketplaceContractDriver = {
		async activeAccount(p) {
			shared ??= (async () => {
				const { accountId } = await p.createConnectedAccount({
					shopId: `sandbox-${Date.now()}`,
					name: "Sandbox Shop",
					email: "sandbox-shop@example.test",
					phone: config.phone,
					type: "express",
				});
				await p.createOnboardingLink(accountId, {
					returnUrl: "https://app.example.test/seller/payments/return",
					refreshUrl: "https://app.example.test/seller/payments/refresh",
				});
				await driver.completeOnboarding(p, accountId);
				return accountId;
			})();
			return shared;
		},
		async completeOnboarding(_p, accountId) {
			const [event] = await waitForDeliveries(
				config.inbox,
				(d) =>
					d.rawBody.includes(accountId) &&
					eventTypeOf(d.rawBody).startsWith("account.") &&
					d.rawBody.includes('"active"'),
				(found) => found.length > 0,
				{
					timeoutMs: HUMAN_TIMEOUT_MS,
					step: `Manual step: open the onboarding link for ${accountId} in the sandbox dashboard and complete it.`,
				},
			);
			recorder.setMode(`account:${accountId}`, "active");
			if (event)
				recorder.recordWebhook("account-updated-active-sync", event.rawBody, {
					account: accountId,
				});
		},
		async settlePayment(p, reference) {
			await p.chargeMobileMoney(reference, {
				channel: config.channel,
				phone: config.phone,
			});
			const [event] = await waitForDeliveries(
				config.inbox,
				(d) =>
					d.rawBody.includes(reference) &&
					/succeeded|complete/.test(eventTypeOf(d.rawBody)),
				(found) => found.length > 0,
				{
					timeoutMs: WEBHOOK_TIMEOUT_MS,
					step: `Manual step: if the sandbox did not approve ${reference} on its own, approve it with the test number.`,
				},
			);
			if (!event) throw new Error("unreachable: no payment webhook");
			recorder.setMode(`payment:${reference}`, "succeeded");
			const { amount, account } = chargeOf(recorder, reference);
			recorder.recordWebhook("payment-succeeded-sync", event.rawBody, {
				ref: reference,
				amount,
				account,
			});
			return signed(event);
		},
		async settleTransfer(_p, { transferId, reference }) {
			const found = await waitForDeliveries(
				config.inbox,
				(d) =>
					(d.rawBody.includes(reference) || d.rawBody.includes(transferId)) &&
					eventTypeOf(d.rawBody).startsWith("transfer."),
				(list) =>
					list.some((d) => eventTypeOf(d.rawBody) === "transfer.complete"),
				{
					timeoutMs: WEBHOOK_TIMEOUT_MS,
					step: `Manual step: if payout ${reference} stays pending, complete it from the sandbox dashboard.`,
				},
			);
			recorder.setMode(`transfer:${transferId}`, "complete");
			const { account, amount } = payoutOf(recorder, reference);
			const vars = { transferId, ref: reference, account, amount };
			const templates: Record<string, string> = {
				"transfer.sent": "transfer-sent-sync",
				"transfer.complete": "transfer-complete-sync",
			};
			for (const d of found) {
				const template = templates[eventTypeOf(d.rawBody)];
				if (template) recorder.recordWebhook(template, d.rawBody, vars);
			}
			return found.map(signed);
		},
		async seedBalance(_p, accountId) {
			console.error(
				`Manual step: fund sandbox account ${accountId} (dashboard, test funds). Waiting for a positive balance.`,
			);
			const deadline = Date.now() + HUMAN_TIMEOUT_MS;
			for (;;) {
				const balance = await watcher
					.getConnectedAccountBalance(accountId)
					.catch(() => undefined);
				if (balance && balance.available > 0) {
					recorder.setMode(`balance:${accountId}`, "funded");
					return { available: balance.available, pending: balance.pending };
				}
				if (Date.now() >= deadline)
					throw new Error(
						`Account ${accountId} was not funded in time. Manual step: add test funds, then rerun.`,
					);
				await sleep(3_000);
			}
		},
		capabilityGap: debitGap,
	};

	return { provider, driver, recorder, config };
}

export type Sandbox = ReturnType<typeof createSandbox>;
