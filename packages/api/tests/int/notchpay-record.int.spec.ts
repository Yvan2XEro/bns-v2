// @vitest-environment node
import {
	cpSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NotchPayMarketplaceProvider } from "../../src/lib/payments/notchpayMarketplace";
import type { WireRequest } from "../../src/lib/payments/notchpayWire";
import {
	formatInboxLine,
	parseInboxLine,
} from "../../src/scripts/webhookInbox";
import { runMarketplaceContract } from "./helpers/marketplaceContract";
import {
	bindModeSink,
	FIXTURE_HASH_KEY,
	makeReplayProvider,
	notchpayRecordedDriver,
} from "./helpers/notchpayContractDriver";
import {
	loadNotchpayFixtures,
	type NotchPayFixture,
	RecordTransport,
	ReplayTransport,
	readVerified,
} from "./helpers/notchpayReplay";
import { isRecordRun, sandboxConfig } from "./helpers/notchpaySandbox";

const REAL = join(import.meta.dirname, "fixtures", "notchpay");
const copyOfFixtures = () => {
	const dir = mkdtempSync(join(tmpdir(), "np-record-"));
	cpSync(REAL, dir, { recursive: true });
	return dir;
};
const read = (dir: string, file: string) =>
	JSON.parse(readFileSync(join(dir, file), "utf8"));
const fixtureOf = (dir: string, key: string): NotchPayFixture =>
	loadNotchpayFixtures(dir).find((f) => f.key === key) as NotchPayFixture;

describe("RecordTransport", () => {
	const create: WireRequest = {
		method: "POST",
		path: "/sync/accounts",
		body: { metadata: { shop_id: "shopA" } },
	};

	it("writes the live response tokenised, keeps the request pattern, clears assumed", async () => {
		const dir = copyOfFixtures();
		const recorder = new RecordTransport(
			async () => ({
				status: 201,
				body: { account: { id: "acc_shopA", status: "created", extra: 1 } },
			}),
			{ dir },
		);
		await recorder.transport()(create);
		const fixture = fixtureOf(dir, "sync-account-create");
		expect(fixture.assumed).toBeUndefined();
		expect(fixture.request).toEqual({ method: "POST", path: "/sync/accounts" });
		expect(fixture.binds).toEqual({ shopId: "body.metadata.shop_id" });
		expect(fixture.response.body).toEqual({
			account: { id: "acc_{shopId}", status: "created", extra: 1 },
		});
	});

	it("keeps the skeleton string for an id the server minted, and follows the live id", async () => {
		const dir = copyOfFixtures();
		const recorder = new RecordTransport(
			async (request) =>
				request.method === "POST"
					? { status: 201, body: { account: { id: "acc_live9" } } }
					: { status: 200, body: { account: { id: "acc_live9" } } },
			{ dir },
		);
		await recorder.transport()(create);
		await recorder.transport()({
			method: "GET",
			path: "/sync/accounts/acc_live9",
		});
		expect(fixtureOf(dir, "sync-account-create").response.body).toEqual({
			account: { id: "acc_{shopId}" },
		});
		// The GET reached the "created" fixture, not the 404 one.
		expect(fixtureOf(dir, "sync-account-fresh").response.body).toEqual({
			account: { id: "{id}" },
		});
		expect(fixtureOf(dir, "sync-account-unknown").response.status).toBe(404);
	});

	it("overwrites the fixture wholesale: a stale field of the old file is gone", async () => {
		const dir = copyOfFixtures();
		const file = join(dir, "accounts.json");
		const list = read(dir, "accounts.json");
		list[0].response.body.account.stale = "from the hand-written file";
		list[0].response.body.stale = "from the hand-written file";
		writeFileSync(file, JSON.stringify(list));
		const recorder = new RecordTransport(
			async () => ({ status: 201, body: { account: { id: "acc_shopA" } } }),
			{ dir },
		);
		await recorder.transport()(create);
		const body = fixtureOf(dir, "sync-account-create").response.body;
		expect(JSON.stringify(body)).not.toContain("stale");
		expect(body).toEqual({ account: { id: "acc_{shopId}" } });
	});

	it("never stores credentials: an Authorization echo is dropped, key values redacted", async () => {
		const dir = copyOfFixtures();
		const recorder = new RecordTransport(
			async () => ({
				status: 201,
				body: {
					account: { id: "acc_shopA" },
					request: {
						Authorization: "pk_test.SECRET",
						"x-grant": "sk_test.SECRET",
					},
					note: "called with pk_test.SECRET",
				},
			}),
			{ dir, secrets: ["pk_test.SECRET", "sk_test.SECRET"] },
		);
		await recorder.transport()(create);
		const all = readdirSync(dir, { recursive: true })
			.map(String)
			.filter((f) => f.endsWith(".json"))
			.map((f) => readFileSync(join(dir, f), "utf8"))
			.join("\n");
		expect(all).not.toContain("SECRET");
		expect(all).toContain("[redacted]");
	});

	it("does not record a 5xx", async () => {
		const dir = copyOfFixtures();
		const recorder = new RecordTransport(
			async () => ({ status: 503, body: { message: "down" } }),
			{ dir },
		);
		await recorder.transport()(create);
		expect(fixtureOf(dir, "sync-account-create").assumed).toEqual(["A1"]);
	});

	it("records a webhook as a template: tokenised, signature dropped, assumed cleared", () => {
		const dir = copyOfFixtures();
		const recorder = new RecordTransport(
			async () => ({ status: 200, body: {} }),
			{
				dir,
			},
		);
		recorder.recordWebhook(
			"payment-succeeded-sync",
			JSON.stringify({
				id: "evt_server",
				type: "payment.succeeded",
				signature: "sig",
				data: {
					merchant_reference: "PAY-1",
					amount: 10300,
					destination: { account: "acc_9" },
				},
			}),
			{ ref: "PAY-1", amount: 10300, account: "acc_9" },
		);
		const templates = read(dir, "webhooks/payment.json");
		const recorded = templates.find(
			(t: { key: string }) => t.key === "payment-succeeded-sync",
		);
		expect(recorded.assumed).toBeUndefined();
		expect(recorded.body.id).toBe("evt_{ref}_succeeded");
		expect(recorded.body.data).toEqual({
			merchant_reference: "{ref}",
			amount: "{amount}",
			destination: { account: "{account}" },
		});
		expect(templates).toHaveLength(2);
	});
});

/** A scripted server: replays the hand-written truth under server-minted ids and a changed fee. */
function scriptedServer(dir: string) {
	const replay = new ReplayTransport(loadNotchpayFixtures(dir));
	const toMinted = new Map<string, string>();
	const toOriginal = new Map<string, string>();
	const unmint = (text: string) =>
		[...toOriginal].reduce((t, [m, o]) => t.split(m).join(o), text);
	const mint = (text: string) =>
		text
			.replace(/\b(acc|tr)_[\w.-]+/g, (id) => {
				const existing = toMinted.get(id);
				if (existing) return existing;
				const minted = `${id.split("_")[0]}_srv${toMinted.size + 1}`;
				toMinted.set(id, minted);
				toOriginal.set(minted, id);
				return minted;
			})
			.replace(/"fee":1492/g, '"fee":1555');
	const inner = replay.transport();
	return {
		unmint,
		replay,
		transport: async (request: WireRequest) => {
			const mapped = JSON.parse(unmint(JSON.stringify(request))) as WireRequest;
			const response = await inner(mapped);
			return {
				status: response.status,
				body: JSON.parse(mint(JSON.stringify(response.body))),
			};
		},
	};
}

const recordedDir = copyOfFixtures();

describe("a record pass against a scripted server", () => {
	const dir = recordedDir;
	const server = scriptedServer(REAL);
	const recorder = new RecordTransport(server.transport, { dir });
	const makeProvider = () => {
		const provider = new NotchPayMarketplaceProvider({
			publicKey: "pk_test_double",
			privateKey: "sk_test_double",
			hashKey: FIXTURE_HASH_KEY,
			transport: recorder.transport(),
		});
		bindModeSink(provider, {
			journal: recorder.journal,
			setMode: (key, value) => {
				recorder.setMode(key, value);
				server.replay.setMode(server.unmint(key), value);
			},
		});
		return provider;
	};

	runMarketplaceContract(makeProvider, notchpayRecordedDriver);

	it("clears what it reached, and says what it did not", () => {
		const { cleared, stillAssumed, verified } = recorder.summary();
		expect(cleared).toContain("A1");
		expect(cleared).toContain("A10");
		expect([...stillAssumed, ...verified].length).toBeGreaterThanOrEqual(16);
		expect(readVerified(join(dir, "manifest", "verified.json"))).toEqual(
			verified,
		);
		expect(fixtureOf(dir, "payment-succeeded").response.body).toMatchObject({
			transaction: { fee: 1555 },
		});
	});
});

describe("the re-recorded fixtures, replayed with zero network", () => {
	runMarketplaceContract(
		() => makeReplayProvider(recordedDir).provider,
		notchpayRecordedDriver,
	);
});

describe("the sandbox gate", () => {
	it("is off unless NOTCHPAY_SANDBOX=record", () => {
		expect(isRecordRun({})).toBe(false);
		expect(isRecordRun({ NOTCHPAY_SANDBOX: "1" })).toBe(false);
		expect(isRecordRun({ NOTCHPAY_SANDBOX: "record" })).toBe(true);
	});

	it("refuses to run without the sandbox keys, and with a live one", () => {
		expect(() => sandboxConfig({ NOTCHPAY_SANDBOX: "record" })).toThrow(
			/NOTCHPAY_PUBLIC_KEY/,
		);
		const full = {
			NOTCHPAY_PUBLIC_KEY: "pk_test.x",
			NOTCHPAY_PRIVATE_KEY: "sk.x",
			NOTCHPAY_HASH_KEY: "h",
			NOTCHPAY_WEBHOOK_INBOX: "/tmp/inbox",
			NOTCHPAY_TEST_CHANNEL: "cm.mtn",
			NOTCHPAY_TEST_PHONE: "+237670000000",
		};
		expect(sandboxConfig(full).inbox).toBe("/tmp/inbox");
		expect(() =>
			sandboxConfig({ ...full, NOTCHPAY_PUBLIC_KEY: "pk_live.x" }),
		).toThrow(/live key/);
	});
});

describe("the webhook inbox", () => {
	it("round-trips a captured delivery, raw body untouched", () => {
		const delivery = {
			rawBody: '{"type":"payment.succeeded", "spaced" : 1}',
			headers: { "x-notch-signature": "abc" },
			receivedAt: "2026-10-08T10:00:00.000Z",
		};
		const line = formatInboxLine(delivery);
		expect(line.endsWith("\n")).toBe(true);
		expect(parseInboxLine(line.trim())).toEqual(delivery);
		expect(() => parseInboxLine('{"rawBody":1}')).toThrow();
	});
});

describe("the sandbox key guard", () => {
	const base = {
		NOTCHPAY_PUBLIC_KEY: "pk_sandbox_1",
		NOTCHPAY_PRIVATE_KEY: "sk_sandbox_1",
		NOTCHPAY_HASH_KEY: "hk_sandbox_1",
		NOTCHPAY_WEBHOOK_INBOX: "https://inbox.test",
		NOTCHPAY_TEST_CHANNEL: "cm.mtn",
		NOTCHPAY_TEST_PHONE: "+237650000001",
	};

	it("refuses a live-looking PUBLIC key, naming it", () => {
		expect(() =>
			sandboxConfig({ ...base, NOTCHPAY_PUBLIC_KEY: "pk_live_9" }),
		).toThrow("NOTCHPAY_PUBLIC_KEY looks like a live key");
	});

	it("refuses a live-looking PRIVATE key beside a sandbox public one — the key that moves money", () => {
		expect(() =>
			sandboxConfig({ ...base, NOTCHPAY_PRIVATE_KEY: "sk_live_9" }),
		).toThrow("NOTCHPAY_PRIVATE_KEY looks like a live key");
	});

	it("refuses a live-looking HASH key", () => {
		expect(() =>
			sandboxConfig({ ...base, NOTCHPAY_HASH_KEY: "hk_live_9" }),
		).toThrow("NOTCHPAY_HASH_KEY looks like a live key");
	});
});
