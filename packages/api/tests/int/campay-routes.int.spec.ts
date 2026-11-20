// @vitest-environment node
import { createHmac } from "node:crypto";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { processWebhookEvent } from "../../src/services/webhookEvents";
import { fakePayload } from "./helpers/fakePayload";

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => {
	const actual = await importOriginal<typeof import("payload")>();
	return { ...actual, getPayload: getPayloadMock };
});

const BASE = "https://demo.campay.net";
const KEY = "campay-webhook-key";
const CP_REF = "0b6a3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

type Handler = (request: Request) => Promise<Response>;
let webhookGET: Handler;
let webhookPOST: Handler;
let returnGET: Handler;
let boostCallbackGET: Handler;

beforeAll(async () => {
	({ GET: webhookGET, POST: webhookPOST } = await import(
		"../../src/app/(frontend)/api/public/payments/webhook/campay/route"
	));
	({ GET: returnGET } = await import(
		"../../src/app/(frontend)/api/public/payments/campay/return/route"
	));
	({ GET: boostCallbackGET } = await import(
		"../../src/app/(frontend)/api/public/boost/callback/route"
	));
}, 30_000);

function jwt(key = KEY): string {
	const enc = (v: unknown) =>
		Buffer.from(JSON.stringify(v)).toString("base64url");
	const now = Math.floor(Date.now() / 1000);
	const head = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ iat: now, nbf: now })}`;
	return `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
}

/** CamPay's own record of the payment, as the status endpoint returns it. */
let campayRecord: Record<string, unknown>;
const fetchMock = vi.fn(async (input: string | URL | Request) => {
	const url = String(input);
	if (url === `${BASE}/api/transaction/${CP_REF}/`)
		return new Response(JSON.stringify(campayRecord), { status: 200 });
	return new Response("{}", { status: 404 });
});

function world(provider = "campay") {
	return fakePayload(
		{
			listings: [{ id: "l-1", status: "published", boostedUntil: null }],
			"boost-payments": [
				{
					id: "bp-1",
					listing: "l-1",
					duration: "7",
					status: "pending",
					amount: 900,
				},
			],
			"payment-intents": [
				{
					id: "pi-1",
					purpose: "boost",
					targetId: "bp-1",
					amount: 900,
					currency: "XAF",
					status: "pending",
					reference: "PI-pi-1",
					provider,
					providerReference: CP_REF,
					customer: "u-1",
					statusHistory: [],
				},
			],
		},
		{ uniques: { "webhook-events": [["provider", "providerEventId"]] } },
	);
}

describe("CamPay routes", () => {
	let payload: ReturnType<typeof world>;

	beforeEach(() => {
		vi.stubEnv("CAMPAY_BASE_URL", BASE);
		vi.stubEnv("CAMPAY_PERMANENT_TOKEN", "perm");
		vi.stubEnv("CAMPAY_WEBHOOK_KEY", KEY);
		vi.stubEnv("PUBLIC_WEB_URL", "https://web.test");
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockClear();
		campayRecord = {
			reference: CP_REF,
			external_reference: "PI-pi-1",
			status: "SUCCESSFUL",
			amount: "900",
			currency: "XAF",
			phone_number: "237677777777",
			extra_email: "payer@example.com",
		};
		payload = world();
		getPayloadMock.mockResolvedValue(payload);
		for (const method of ["warn", "error"] as const)
			vi.spyOn(console, method).mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	const callbackQuery = (signature: string, status = "SUCCESSFUL") =>
		new URLSearchParams({
			reference: CP_REF,
			external_reference: "PI-pi-1",
			status,
			amount: "900",
			signature,
		}).toString();

	it("stores CamPay's own record of a signed GET callback, then settles it", async () => {
		const res = await webhookGET(
			new Request(
				`http://localhost/api/public/payments/webhook/campay?${callbackQuery(jwt())}`,
			),
		);
		expect(res.status).toBe(200);
		const [event] = payload.store["webhook-events"];
		expect(event).toMatchObject({
			provider: "campay",
			providerEventId: `campay:${CP_REF}:SUCCESSFUL`,
		});
		expect(event.raw).toMatchObject({
			reference: CP_REF,
			status: "SUCCESSFUL",
			amount: "900",
		});
		expect(JSON.stringify(event.raw)).not.toMatch(
			/237677777777|payer@example|signature/,
		);
		expect(payload.jobs.queue).toHaveBeenCalledWith(
			expect.objectContaining({
				task: "processWebhookEvent",
				input: { eventId: event.id },
			}),
		);

		expect(await processWebhookEvent(payload, event.id)).toEqual({
			outcome: "applied",
		});
		expect(payload.store["payment-intents"][0].status).toBe("succeeded");
		expect(payload.store["boost-payments"][0].status).toBe("completed");
	});

	it("refuses a forged callback without asking CamPay or storing anything", async () => {
		const res = await webhookGET(
			new Request(
				`http://localhost/api/public/payments/webhook/campay?${callbackQuery(jwt("forged"))}`,
			),
		);
		expect(res.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(payload.store["webhook-events"] ?? []).toHaveLength(0);
	});

	it("takes the same callback as a POST body", async () => {
		const res = await webhookPOST(
			new Request("http://localhost/api/public/payments/webhook/campay", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(
					Object.fromEntries(new URLSearchParams(callbackQuery(jwt()))),
				),
			}),
		);
		expect(res.status).toBe(200);
		expect(payload.store["webhook-events"]).toHaveLength(1);
	});

	it("settles on the return page and sends the payer back to the seller space", async () => {
		const res = await returnGET(
			new Request(
				"http://localhost/api/public/payments/campay/return?ref=PI-pi-1&next=/seller/payments",
			),
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(
			"https://web.test/seller/payments?payment=success",
		);
		expect(payload.store["payment-intents"][0].status).toBe("succeeded");
	});

	it("never redirects outside the seller space, and ignores an intent CamPay did not open", async () => {
		payload = world("notchpay");
		getPayloadMock.mockResolvedValue(payload);
		const res = await returnGET(
			new Request(
				"http://localhost/api/public/payments/campay/return?ref=PI-pi-1&next=https://evil.test/x",
			),
		);
		expect(res.headers.get("location")).toBe(
			"https://web.test/seller/payments?payment=failed",
		);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(payload.store["payment-intents"][0].status).toBe("pending");
	});

	it("does not settle a payment CamPay reports as failed", async () => {
		campayRecord.status = "FAILED";
		const res = await returnGET(
			new Request(
				"http://localhost/api/public/payments/campay/return?ref=PI-pi-1&next=/seller/payments",
			),
		);
		expect(res.headers.get("location")).toBe(
			"https://web.test/seller/payments?payment=failed",
		);
		expect(payload.store["payment-intents"][0].status).toBe("failed");
	});

	it("brings a boost payer back to the listing with the outcome", async () => {
		const res = await boostCallbackGET(
			new Request(
				"http://localhost/api/public/boost/callback?listingId=l-1&provider=campay&ref=PI-pi-1",
			),
		);
		expect(res.headers.get("location")).toBe(
			"https://web.test/listing/l-1?boostStatus=success",
		);
		expect(payload.store["payment-intents"][0].status).toBe("succeeded");
	});
});
