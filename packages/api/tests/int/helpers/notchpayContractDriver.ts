import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MarketplaceProvider } from "../../../src/lib/payments/marketplace";
import { NotchPayMarketplaceProvider } from "../../../src/lib/payments/notchpayMarketplace";
import type {
	MarketplaceContractDriver,
	SignedWebhook,
} from "./marketplaceContract";
import { loadNotchpayFixtures, ReplayTransport } from "./notchpayReplay";

/** A constant, not a secret: it signs replayed webhooks so the tamper clauses are real. */
export const FIXTURE_HASH_KEY = "np_test_hash_fixture";

export interface WebhookTemplate {
	key: string;
	body: unknown;
	assumed?: string[];
}

const WEBHOOK_DIR = join(
	import.meta.dirname,
	"..",
	"fixtures",
	"notchpay",
	"webhooks",
);

export function loadWebhookTemplates(
	dir: string = WEBHOOK_DIR,
): WebhookTemplate[] {
	return readdirSync(dir)
		.filter((name) => name.endsWith(".json"))
		.sort()
		.flatMap(
			(name) =>
				JSON.parse(readFileSync(join(dir, name), "utf8")) as WebhookTemplate[],
		);
}

export const hmacSha256Hex = (key: string, body: string) =>
	createHmac("sha256", key).update(body).digest("hex");

const replays = new WeakMap<MarketplaceProvider, ReplayTransport>();

export function makeReplayProvider(): {
	provider: NotchPayMarketplaceProvider;
	replay: ReplayTransport;
} {
	const replay = new ReplayTransport(loadNotchpayFixtures());
	const provider = new NotchPayMarketplaceProvider({
		publicKey: "pk_test_fixture",
		privateKey: "sk_test_fixture",
		hashKey: FIXTURE_HASH_KEY,
		transport: replay.transport(),
	});
	replays.set(provider, replay);
	return { provider, replay };
}

function replayOf(provider: MarketplaceProvider): ReplayTransport {
	const replay = replays.get(provider);
	if (!replay) throw new Error("not a provider built by makeReplayProvider");
	return replay;
}

type Vars = Record<string, string | number>;

// A value that is exactly one placeholder keeps the variable's type, so amounts stay numbers.
function fill(value: unknown, vars: Vars): unknown {
	if (typeof value === "string") {
		const whole = /^\{(\w+)\}$/.exec(value);
		if (whole && vars[whole[1] as string] !== undefined)
			return vars[whole[1] as string];
		return value.replace(/\{(\w+)\}/g, (all, name: string) =>
			vars[name] === undefined ? all : String(vars[name]),
		);
	}
	if (Array.isArray(value)) return value.map((item) => fill(item, vars));
	if (typeof value === "object" && value !== null)
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, fill(v, vars)]),
		);
	return value;
}

export function signedFromTemplate(key: string, vars: Vars): SignedWebhook {
	const template = loadWebhookTemplates().find((t) => t.key === key);
	if (!template) throw new Error(`no webhook template ${key}`);
	const rawBody = JSON.stringify(fill(template.body, vars));
	return {
		rawBody,
		headers: { "x-notch-signature": hmacSha256Hex(FIXTURE_HASH_KEY, rawBody) },
	};
}

function chargeOf(replay: ReplayTransport, reference: string) {
	const request = replay.journal.find(
		(r) =>
			r.method === "POST" &&
			r.path === "/payments" &&
			(r.body as { reference?: string }).reference === reference,
	);
	const body = request?.body as
		| { amount: number; destination: { account: string } }
		| undefined;
	if (!body) throw new Error(`no charge ${reference} on the journal`);
	return { amount: body.amount, account: body.destination.account };
}

function payoutOf(replay: ReplayTransport, reference: string) {
	for (const request of replay.journal) {
		const match = /^\/sync\/accounts\/([^/]+)\/payouts$/.exec(request.path);
		const body = request.body as { reference?: string; amount?: number };
		if (match && body.reference === reference)
			return {
				account: decodeURIComponent(match[1] as string),
				amount: body.amount as number,
			};
	}
	throw new Error(`no payout ${reference} on the journal`);
}

let shops = 0;

export const notchpayRecordedDriver: MarketplaceContractDriver = {
	async activeAccount(provider) {
		const { accountId } = await provider.createConnectedAccount({
			shopId: `shop-fixture-${++shops}`,
			name: "Fixture Shop",
			email: "fixture-shop@example.test",
			phone: "+237670000000",
			type: "express",
		});
		replayOf(provider).setMode(`account:${accountId}`, "active");
		return accountId;
	},
	async completeOnboarding(provider, accountId) {
		replayOf(provider).setMode(`account:${accountId}`, "active");
	},
	async settlePayment(provider, reference) {
		const replay = replayOf(provider);
		replay.setMode(`payment:${reference}`, "succeeded");
		const { amount, account } = chargeOf(replay, reference);
		return signedFromTemplate("payment-succeeded-sync", {
			ref: reference,
			amount,
			account,
		});
	},
	async settleTransfer(provider, { transferId, reference }) {
		const replay = replayOf(provider);
		replay.setMode(`transfer:${transferId}`, "complete");
		const { account, amount } = payoutOf(replay, reference);
		const vars = { transferId, ref: reference, account, amount };
		return [
			signedFromTemplate("transfer-sent-sync", vars),
			signedFromTemplate("transfer-complete-sync", vars),
		];
	},
	async seedBalance(provider, accountId) {
		replayOf(provider).setMode(`balance:${accountId}`, "funded");
		return { available: 41_500, pending: 7_200 };
	},
	capabilityGap(provider) {
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
