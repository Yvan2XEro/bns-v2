// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { campayConfigured, getCamPayProvider } from "../../src/lib/payments";
import {
	CamPayProvider,
	campayCallbackFields,
	campayPhone,
	parseCamPayTransaction,
	verifyCamPayJwt,
} from "../../src/lib/payments/campay";
import { WebhookSignatureError } from "../../src/lib/payments/types";

const BASE = "https://demo.campay.net";
const KEY = "webhook-key-test";
const NOW = 1_800_000_000_000;

type Call = {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: unknown;
};

/** A fetch that answers from `routes` and records every request. */
function fakeFetch(
	routes: Record<string, (call: Call) => { status?: number; body: unknown }>,
) {
	const calls: Call[] = [];
	const impl = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		const call: Call = {
			url,
			method: init?.method ?? "GET",
			headers: Object.fromEntries(new Headers(init?.headers).entries()),
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		};
		calls.push(call);
		const path = url.replace(BASE, "");
		const route = routes[`${call.method} ${path}`];
		if (!route) return new Response("{}", { status: 404 });
		const { status = 200, body } = route(call);
		return new Response(JSON.stringify(body), { status });
	}) as typeof fetch;
	return { impl, calls };
}

function jwt(
	claims: Record<string, unknown>,
	key = KEY,
	header: Record<string, unknown> = { alg: "HS256", typ: "JWT" },
): string {
	const enc = (v: unknown) =>
		Buffer.from(JSON.stringify(v)).toString("base64url");
	const head = `${enc(header)}.${enc(claims)}`;
	const sig = createHmac("sha256", key).update(head).digest("base64url");
	return `${head}.${sig}`;
}

const tokenRoute = () => ({ body: { token: "tmp-token", expires_in: 3600 } });
const linkRoute = () => ({
	body: {
		link: "https://demo.campay.net/pay/abc",
		reference: "11111111-2222-4333-8444-555555555555",
	},
});

function provider(
	routes: Parameters<typeof fakeFetch>[0],
	extra: Partial<ConstructorParameters<typeof CamPayProvider>[0]> = {},
) {
	const f = fakeFetch(routes);
	let now = NOW;
	const p = new CamPayProvider({
		baseUrl: BASE,
		username: "user",
		password: "pass",
		webhookKey: KEY,
		fetch: f.impl,
		now: () => now,
		...extra,
	});
	const advance = (ms: number) => {
		now += ms;
	};
	return { p, calls: f.calls, advance };
}

const params = {
	reference: "PI-abc123",
	amount: 2500,
	currency: "XAF",
	description: "Boost annonce: Vélo",
	callbackUrl:
		"https://api.example.com/api/public/boost/callback?provider=campay",
	customer: {
		email: "seller@example.com",
		name: "Awa Ngono Belinga",
		phone: "+237 6 99 00 11 22",
	},
};

describe("CamPay createPayment", () => {
	it("gets a token, then asks for a payment link with our reference", async () => {
		const { p, calls } = provider({
			"POST /api/token/": tokenRoute,
			"POST /api/get_payment_link/": linkRoute,
		});
		const result = await p.createPayment(params);
		expect(result).toEqual({
			checkoutUrl: "https://demo.campay.net/pay/abc",
			providerReference: "11111111-2222-4333-8444-555555555555",
		});
		expect(calls[0]?.body).toEqual({ username: "user", password: "pass" });
		const link = calls[1];
		expect(link?.headers.authorization).toBe("Token tmp-token");
		expect(link?.body).toEqual({
			amount: "2500",
			currency: "XAF",
			description: "Boost annonce: Vélo",
			external_reference: "PI-abc123",
			redirect_url: params.callbackUrl,
			failure_redirect_url: params.callbackUrl,
			payment_options: "MOMO",
			email: "seller@example.com",
			first_name: "Awa",
			last_name: "Ngono Belinga",
			from: "237699001122",
		});
	});

	it("reuses the temporary token until shortly before it expires", async () => {
		const { p, calls, advance } = provider({
			"POST /api/token/": tokenRoute,
			"POST /api/get_payment_link/": linkRoute,
		});
		await p.createPayment(params);
		await p.createPayment(params);
		expect(calls.filter((c) => c.url.endsWith("/api/token/"))).toHaveLength(1);
		advance(3300 * 1000 + 1);
		await p.createPayment(params);
		expect(calls.filter((c) => c.url.endsWith("/api/token/"))).toHaveLength(2);
	});

	it("uses a permanent token as is, without asking for one", async () => {
		const { p, calls } = provider(
			{ "POST /api/get_payment_link/": linkRoute },
			{
				permanentToken: "perm-token",
				username: undefined,
				password: undefined,
			},
		);
		await p.createPayment(params);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.headers.authorization).toBe("Token perm-token");
	});

	it("renews an expired temporary token once on a 401", async () => {
		let linkAttempts = 0;
		const { p, calls } = provider({
			"POST /api/token/": tokenRoute,
			"POST /api/get_payment_link/": () =>
				++linkAttempts === 1
					? { status: 401, body: { detail: "expired" } }
					: linkRoute(),
		});
		await expect(p.createPayment(params)).resolves.toMatchObject({
			providerReference: expect.any(String),
		});
		expect(calls.filter((c) => c.url.endsWith("/api/token/"))).toHaveLength(2);
	});

	it("refuses what CamPay cannot collect: another currency, a decimal amount", async () => {
		const { p, calls } = provider({});
		await expect(
			p.createPayment({ ...params, currency: "EUR" }),
		).rejects.toThrow(/XAF/);
		await expect(p.createPayment({ ...params, amount: 10.5 })).rejects.toThrow(
			/whole/,
		);
		expect(calls).toHaveLength(0);
	});

	it("reports CamPay's refusal with its message", async () => {
		const { p } = provider({
			"POST /api/token/": tokenRoute,
			"POST /api/get_payment_link/": () => ({
				status: 400,
				body: { message: "ER201" },
			}),
		});
		await expect(p.createPayment(params)).rejects.toThrow(
			"CamPay /api/get_payment_link/ (400): ER201",
		);
	});
});

describe("CamPay verifyPayment", () => {
	it("reads the transaction and maps it to our reference and status", async () => {
		const { p } = provider({
			"POST /api/token/": tokenRoute,
			"GET /api/transaction/11111111-2222-4333-8444-555555555555/": () => ({
				body: {
					reference: "11111111-2222-4333-8444-555555555555",
					external_reference: "PI-abc123",
					status: "SUCCESSFUL",
					amount: "2500",
					currency: "XAF",
				},
			}),
		});
		await expect(
			p.verifyPayment("11111111-2222-4333-8444-555555555555"),
		).resolves.toEqual({
			reference: "PI-abc123",
			status: "succeeded",
			amount: 2500,
			currency: "XAF",
			providerTransactionId: "11111111-2222-4333-8444-555555555555",
		});
	});

	it("never puts a reference with a slash into the URL", async () => {
		const { p, calls } = provider({});
		await expect(p.verifyPayment("../balance")).rejects.toThrow(/invalid/);
		expect(calls).toHaveLength(0);
	});
});

describe("CamPay callback JWT", () => {
	const now = NOW / 1000;
	it("accepts an HS256 token signed with the webhook key", () => {
		expect(
			verifyCamPayJwt(jwt({ iat: now, nbf: now }), KEY, now),
		).toMatchObject({ iat: now });
	});
	it("refuses another key, alg none, an expired or a future token, and garbage", () => {
		const bad = [
			jwt({ iat: now }, "other-key"),
			jwt({ iat: now }, KEY, { alg: "none" }),
			jwt({ iat: now, exp: now - 3600 }),
			jwt({ iat: now, nbf: now + 3600 }),
			"not.a.jwt",
			"",
		];
		for (const token of bad)
			expect(() => verifyCamPayJwt(token, KEY, now), token).toThrow(
				WebhookSignatureError,
			);
	});
});

describe("CamPay verifyCallback", () => {
	const reference = "11111111-2222-4333-8444-555555555555";
	const apiTransaction = {
		reference,
		external_reference: "PI-abc123",
		status: "FAILED",
		amount: "2500",
		currency: "XAF",
		phone_number: "237699001122",
		extra_email: "seller@example.com",
		reason: "insufficient funds",
	};

	it("trusts CamPay's own record, not the callback, and drops the payer's details", async () => {
		const { p } = provider({
			"POST /api/token/": tokenRoute,
			[`GET /api/transaction/${reference}/`]: () => ({ body: apiTransaction }),
		});
		const { event, transaction } = await p.verifyCallback({
			reference,
			status: "SUCCESSFUL", // the callback says paid; CamPay's record says failed
			amount: "999999",
			signature: jwt({ iat: NOW / 1000 }),
		});
		expect(event).toMatchObject({
			reference: "PI-abc123",
			status: "failed",
			amount: 2500,
		});
		expect(event.providerEventId).toBe(`campay:${reference}:FAILED`);
		expect(transaction).not.toHaveProperty("phone_number");
		expect(transaction).not.toHaveProperty("extra_email");
		expect(transaction).not.toHaveProperty("signature");
	});

	it("refuses a callback with a bad signature before calling CamPay", async () => {
		const { p, calls } = provider({});
		await expect(
			p.verifyCallback({
				reference,
				status: "SUCCESSFUL",
				signature: jwt({}, "wrong"),
			}),
		).rejects.toThrow(WebhookSignatureError);
		expect(calls).toHaveLength(0);
	});

	it("accepts no callback at all without a webhook key", async () => {
		const { p } = provider({}, { webhookKey: undefined });
		await expect(
			p.verifyCallback({ reference, signature: jwt({}) }),
		).rejects.toThrow(/CAMPAY_WEBHOOK_KEY/);
	});
});

describe("CamPay helpers", () => {
	it("reads callback fields from a query, a JSON body or a form body", () => {
		expect(
			campayCallbackFields(
				"",
				new URLSearchParams("reference=r&status=SUCCESSFUL"),
			),
		).toEqual({
			reference: "r",
			status: "SUCCESSFUL",
		});
		expect(campayCallbackFields('{"reference":"r","amount":25}')).toEqual({
			reference: "r",
			amount: "25",
		});
		expect(campayCallbackFields("reference=r&status=FAILED")).toEqual({
			reference: "r",
			status: "FAILED",
		});
	});

	it("formats Cameroonian numbers the way CamPay wants them, or not at all", () => {
		expect(campayPhone("+237 699 00 11 22")).toBe("237699001122");
		expect(campayPhone("699001122")).toBe("237699001122");
		expect(campayPhone("+33 6 12 34 56 78")).toBeNull();
		expect(campayPhone(undefined)).toBeNull();
	});

	it("parses a stored record into the same event every time", () => {
		const raw = {
			reference: "r-1",
			external_reference: "PI-1",
			status: "SUCCESSFUL",
			amount: 100,
			currency: "xaf",
		};
		expect(parseCamPayTransaction(raw)).toEqual({
			providerEventId: "campay:r-1:SUCCESSFUL",
			type: "collect.successful",
			reference: "PI-1",
			status: "succeeded",
			amount: 100,
			currency: "XAF",
			providerTransactionId: "r-1",
		});
	});

	it("is configured only with credentials and the webhook key", () => {
		expect(campayConfigured({ CAMPAY_PERMANENT_TOKEN: "t" })).toBe(false);
		expect(
			campayConfigured({
				CAMPAY_PERMANENT_TOKEN: "t",
				CAMPAY_WEBHOOK_KEY: "k",
			}),
		).toBe(true);
		expect(
			campayConfigured({
				CAMPAY_USERNAME: "u",
				CAMPAY_PASSWORD: "p",
				CAMPAY_WEBHOOK_KEY: "k",
			}),
		).toBe(true);
		expect(() => getCamPayProvider({})).toThrow(/CamPay non configuré/);
	});
});
