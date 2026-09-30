import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { diditProvider } from "../../src/lib/kyc/didit";
import approved from "./fixtures/didit-approved.json";
import declined from "./fixtures/didit-declined.json";

process.env.DIDIT_WEBHOOK_SECRET = "whsec-test";
process.env.DIDIT_API_KEY = "key-test";
process.env.DIDIT_WORKFLOW_ID = "wf-1";

function signed(
	body: string,
	secret = "whsec-test",
	timestamp = String(Math.floor(Date.now() / 1000)),
) {
	return new Headers({
		"x-signature": createHmac("sha256", secret).update(body).digest("hex"),
		"x-timestamp": timestamp,
	});
}

describe("didit webhook verification", () => {
	it("accepts a body signed with the configured secret", async () => {
		const body = JSON.stringify({
			session_id: "sess-1",
			status: "Approved",
			webhook_id: "evt-1",
		});
		await expect(
			diditProvider.verifyWebhook(body, signed(body)),
		).resolves.toEqual({
			providerEventId: "evt-1",
			type: "Approved",
			sessionRef: "sess-1",
		});
	});

	it("refuses a body signed with another secret", async () => {
		const body = JSON.stringify({
			session_id: "sess-1",
			status: "Approved",
			webhook_id: "evt-1",
		});
		await expect(
			diditProvider.verifyWebhook(body, signed(body, "wrong")),
		).rejects.toThrow();
	});

	it("refuses an unsigned body and a body with a stale timestamp", async () => {
		const body = JSON.stringify({ session_id: "sess-1" });
		await expect(
			diditProvider.verifyWebhook(body, new Headers()),
		).rejects.toThrow();
		const stale = String(Math.floor(Date.now() / 1000) - 3600);
		await expect(
			diditProvider.verifyWebhook(body, signed(body, "whsec-test", stale)),
		).rejects.toThrow();
	});

	it("never puts the secret in the thrown message", async () => {
		const body = JSON.stringify({ session_id: "sess-1" });
		await diditProvider
			.verifyWebhook(body, signed(body, "wrong"))
			.catch((error: Error) => {
				expect(error.message).not.toContain("whsec-test");
			});
	});
});

describe("didit result normalisation", () => {
	const fetchReturning = (payload: unknown) =>
		vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));

	it("maps an approved result onto our own shape", async () => {
		vi.stubGlobal("fetch", fetchReturning(approved));
		const result = await diditProvider.fetchResult("sess-1");
		expect(result).toMatchObject({
			status: "approved",
			documentType: "national_id",
			documentCountry: "CM",
			livenessPassed: true,
		});
		expect(result.documentNumber).toBeTypeOf("string");
		expect(result.dateOfBirth).toBeInstanceOf(Date);
		expect(result.faceMatchScore).toBeGreaterThan(0);
		vi.unstubAllGlobals();
	});

	it("maps a declined result and carries its warnings", async () => {
		vi.stubGlobal("fetch", fetchReturning(declined));
		const result = await diditProvider.fetchResult("sess-1");
		expect(result.status).toBe("declined");
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.documentNumber).toBeNull();
		vi.unstubAllGlobals();
	});

	it("reports an unusable body as an error rather than an approval", async () => {
		vi.stubGlobal("fetch", fetchReturning({ session_id: "sess-1" }));
		await expect(diditProvider.fetchResult("sess-1")).resolves.toMatchObject({
			status: "pending",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 500 })),
		);
		await expect(diditProvider.fetchResult("sess-1")).rejects.toThrow();
		vi.unstubAllGlobals();
	});
});

describe("didit session creation", () => {
	it("sends the workflow id and the reference, and returns the hosted URL", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						session_id: "sess-9",
						url: "https://verify.didit.me/s/sess-9",
					}),
					{ status: 201 },
				),
		);
		vi.stubGlobal("fetch", fetchMock);
		const session = await diditProvider.createSession({
			reference: "VR-vr-1-1",
			locale: "fr",
			returnUrl:
				"https://buynsellem.com/seller/verification/identity/return?request=vr-1",
		});
		expect(session).toMatchObject({
			sessionRef: "sess-9",
			url: "https://verify.didit.me/s/sess-9",
		});
		const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
		expect(body).toMatchObject({
			workflow_id: "wf-1",
			vendor_data: "VR-vr-1-1",
		});
		expect(String(fetchMock.mock.calls[0][1]?.headers?.["x-api-key"])).toBe(
			"key-test",
		);
		vi.unstubAllGlobals();
	});
});
