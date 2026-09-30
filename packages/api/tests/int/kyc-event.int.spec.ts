import { afterEach, describe, expect, it, vi } from "vitest";
import { processKycEvent } from "../../src/jobs/processKycEvent";
import { startKycSession } from "../../src/services/verification";
import { fakePayload } from "./helpers/fakePayload";

process.env.VERIFICATION_HASH_PEPPER = "pepper-test";
process.env.DIDIT_API_KEY = "key-test";
process.env.DIDIT_WORKFLOW_ID = "wf-1";

const OWNER = { id: "u-1", role: "user", name: "Aïcha Mbappé" };

const AUTHORISED = {
	enabled: true,
	kycProvider: "didit",
	autoApproveIdentity: false,
	authorisation: {
		reference: "ANTIC-2026-0042",
		grantedAt: "2026-09-01T00:00:00.000Z",
		transfersAuthorised: true,
		consentVersion: "kyc-2026-10-v1",
	},
};

const RESULT = {
	status: "approved" as const,
	documentType: "national_id" as const,
	documentCountry: "CM",
	documentNumber: "123456789",
	documentExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
	givenNames: "Aicha",
	familyName: "Mbappe",
	dateOfBirth: new Date("1995-03-04T00:00:00.000Z"),
	livenessPassed: true,
	faceMatchScore: 93,
	warnings: [],
	reviewUrl: "https://console.didit.me/s/sess-1",
};

function seed(
	over: {
		requests?: Record<string, unknown>[];
		settings?: Record<string, unknown>;
	} = {},
) {
	return fakePayload(
		{
			users: [{ ...OWNER }],
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					name: "Akwa",
					owner: "u-1",
					status: "active",
					level: 1,
				},
			],
			"shop-members": [],
			"verification-requests": over.requests ?? [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "draft",
					openKey: "s-1:2",
					kyc: {
						sessionRef: "sess-1",
						status: "pending",
						attempts: 1,
						provider: "didit",
					},
				},
			],
			"webhook-events": [
				{
					id: "we-1",
					provider: "didit",
					providerEventId: "evt-1",
					processedAt: null,
				},
			],
			"moderation-log": [],
		},
		{
			globals: {
				"app-settings": { verification: over.settings ?? AUTHORISED },
			},
		},
	);
}

const request = (p: ReturnType<typeof seed>) =>
	p.store["verification-requests"][0];
const shop = (p: ReturnType<typeof seed>) => p.store.shops[0];

/**
 * `processKycEvent` and `startKycSession` call the real Didit adapter
 * (`lib/kyc/didit.ts`), so the vendor is faked at the HTTP boundary
 * (`fetch`), the same way `kyc-didit.int.spec.ts` pins the adapter itself —
 * not by mocking `lib/kyc`'s module: both consumers import `getKycProvider`
 * statically, so a `vi.doMock` registered from inside an `it()` never
 * reaches an already-evaluated import binding (Vitest only rewrites a
 * module graph resolved *after* the mock is registered, via
 * `vi.resetModules()` and a dynamic `import()` — see the route-level tests
 * in `shop-moderation.int.spec.ts`/`public-shops.int.spec.ts` for that
 * heavier pattern, unneeded here since these are direct function calls, not
 * a route pulling in a fresh Payload config).
 */
const STATUS_TO_WIRE: Record<string, string> = {
	pending: "Not Started",
	approved: "Approved",
	declined: "Declined",
	review: "In Review",
	abandoned: "Abandoned",
};
const DOCUMENT_TYPE_TO_WIRE: Record<string, string> = {
	national_id: "Identity Card",
	passport: "Passport",
	residence_permit: "Residence Permit",
};

function diditDecisionBody(result: typeof RESULT) {
	return {
		session_id: "sess-1",
		status: STATUS_TO_WIRE[result.status] ?? "Not Started",
		id_verification: {
			document_type: result.documentType
				? (DOCUMENT_TYPE_TO_WIRE[result.documentType] ?? null)
				: null,
			issuing_state: result.documentCountry === "CM" ? "CMR" : null,
			document_number: result.documentNumber,
			date_of_birth: result.dateOfBirth
				? result.dateOfBirth.toISOString().slice(0, 10)
				: null,
			expiration_date: result.documentExpiresAt
				? result.documentExpiresAt.toISOString().slice(0, 10)
				: null,
			first_name: result.givenNames,
			last_name: result.familyName,
		},
		liveness: { status: result.livenessPassed ? "Approved" : "Declined" },
		face_match: { score: result.faceMatchScore },
		warnings: result.warnings,
		review_url: result.reviewUrl,
	};
}

const withProvider = (result: Partial<typeof RESULT> = {}) => {
	const merged = { ...RESULT, ...result };
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: { method?: string }) => {
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST") {
				return new Response(
					JSON.stringify({
						session_id: "sess-9",
						url: "https://verify.didit.me/s/sess-9",
					}),
					{ status: 201 },
				);
			}
			if (method === "DELETE") {
				return new Response(null, { status: 204 });
			}
			return new Response(JSON.stringify(diditDecisionBody(merged)), {
				status: 200,
			});
		}),
	);
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("processKycEvent", () => {
	it("stores the outcome without the document number or the date of birth", async () => {
		withProvider();
		const payload = seed();
		await processKycEvent(payload, {
			webhookEventId: "we-1",
			provider: "didit",
			sessionRef: "sess-1",
		});

		const kyc = request(payload).kyc;
		expect(kyc).toMatchObject({
			status: "approved",
			documentType: "national_id",
			documentCountry: "CM",
			documentNumberLast4: "6789",
			adult: true,
			livenessPassed: true,
			faceMatchScore: 93,
		});
		expect(kyc.documentNumberHash).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(request(payload))).not.toContain("123456789");
		expect(JSON.stringify(request(payload))).not.toContain("1995-03-04");
	});

	it("moves an approved result to submitted and leaves the decision to a person", async () => {
		withProvider();
		const payload = seed();
		await processKycEvent(payload, {
			webhookEventId: "we-1",
			provider: "didit",
			sessionRef: "sess-1",
		});
		expect(request(payload).status).toBe("submitted");
		expect(shop(payload).level).toBe(1);
	});

	it("approves automatically when the setting is on and there is no signal", async () => {
		withProvider();
		const payload = seed({
			settings: { ...AUTHORISED, autoApproveIdentity: true },
		});
		await processKycEvent(payload, {
			webhookEventId: "we-1",
			provider: "didit",
			sessionRef: "sess-1",
		});
		expect(request(payload).status).toBe("approved");
		expect(shop(payload).level).toBe(2);
		expect(payload.store["moderation-log"].at(-1)).toMatchObject({
			action: "verification.approve",
			actorRole: "system",
			metadata: expect.objectContaining({ automatic: true }),
		});
	});

	it("never approves automatically when a signal is present", async () => {
		withProvider({ givenNames: "Jean", familyName: "Nkodo" });
		const payload = seed({
			settings: { ...AUTHORISED, autoApproveIdentity: true },
		});
		await processKycEvent(payload, {
			webhookEventId: "we-1",
			provider: "didit",
			sessionRef: "sess-1",
		});
		expect(request(payload).status).toBe("submitted");
		expect(
			request(payload).reviewSignals.map((s: { code: string }) => s.code),
		).toContain("name_mismatch");
	});

	it("moves a review result to submitted with the kyc_review signal", async () => {
		withProvider({ status: "review" });
		const payload = seed();
		await processKycEvent(payload, {
			webhookEventId: "we-1",
			provider: "didit",
			sessionRef: "sess-1",
		});
		expect(request(payload).status).toBe("submitted");
		expect(
			request(payload).reviewSignals.map((s: { code: string }) => s.code),
		).toContain("kyc_review");
	});

	it("leaves a declined result in draft so the owner can retry, until the third one", async () => {
		withProvider({ status: "declined" });
		const payload = seed();
		await processKycEvent(payload, {
			webhookEventId: "we-1",
			provider: "didit",
			sessionRef: "sess-1",
		});
		expect(request(payload).status).toBe("draft");

		request(payload).kyc.attempts = 3;
		await processKycEvent(payload, {
			webhookEventId: "we-1",
			provider: "didit",
			sessionRef: "sess-1",
		});
		expect(request(payload).status).toBe("submitted");
		expect(
			request(payload).reviewSignals.map((s: { code: string }) => s.code),
		).toContain("kyc_declined");
	});

	it("makes no transition for an abandoned or still-pending result", async () => {
		for (const status of ["abandoned", "pending"] as const) {
			withProvider({ status });
			const payload = seed();
			await processKycEvent(payload, {
				webhookEventId: "we-1",
				provider: "didit",
				sessionRef: "sess-1",
			});
			expect(request(payload).status).toBe("draft");
		}
	});

	it("is a no-op for a request that is already decided", async () => {
		withProvider();
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "rejected",
					openKey: null,
					kyc: { sessionRef: "sess-1", status: "approved", attempts: 1 },
				},
			],
		});
		await expect(
			processKycEvent(payload, {
				webhookEventId: "we-1",
				provider: "didit",
				sessionRef: "sess-1",
			}),
		).resolves.toMatchObject({ handled: false });
		expect(request(payload).status).toBe("rejected");
	});

	it("is a no-op for an unknown session rather than a retry loop", async () => {
		withProvider();
		const payload = seed();
		await expect(
			processKycEvent(payload, {
				webhookEventId: "we-1",
				provider: "didit",
				sessionRef: "sess-unknown",
			}),
		).resolves.toMatchObject({ handled: false, requestId: null });
	});

	it("is idempotent: running the same event twice changes nothing the second time", async () => {
		withProvider();
		const payload = seed();
		await processKycEvent(payload, {
			webhookEventId: "we-1",
			provider: "didit",
			sessionRef: "sess-1",
		});
		const after = JSON.stringify(request(payload));
		await processKycEvent(payload, {
			webhookEventId: "we-1",
			provider: "didit",
			sessionRef: "sess-1",
		});
		expect(JSON.stringify(request(payload))).toBe(after);
	});
});

describe("startKycSession", () => {
	it("records the consent and returns a URL it does not store", async () => {
		withProvider();
		const payload = seed();
		const session = await startKycSession(payload, OWNER, "vr-1", {
			consentVersion: "kyc-2026-10-v1",
			locale: "fr",
		});
		expect(session.url).toContain("https://");
		expect(request(payload).consent).toMatchObject({
			version: "kyc-2026-10-v1",
			locale: "fr",
		});
		expect(request(payload).kyc.sessionRef).toBe("sess-9");
		expect(JSON.stringify(request(payload))).not.toContain(session.url);
	});

	it("refuses a consent version that is not the current one", async () => {
		withProvider();
		await expect(
			startKycSession(seed(), OWNER, "vr-1", {
				consentVersion: "kyc-2025-01-v1",
				locale: "fr",
			}),
		).rejects.toMatchObject({
			code: "verification.consentRequired",
			status: 409,
		});
	});

	it("refuses a fourth attempt on the same request", async () => {
		withProvider();
		const payload = seed();
		request(payload).kyc.attempts = 3;
		await expect(
			startKycSession(payload, OWNER, "vr-1", {
				consentVersion: "kyc-2026-10-v1",
				locale: "fr",
			}),
		).rejects.toMatchObject({
			code: "verification.tooManyAttempts",
			status: 429,
		});
	});

	it("refuses a sixth session by the same owner in 30 days", async () => {
		withProvider();
		const payload = seed();
		for (let i = 0; i < 5; i++) {
			payload.store["verification-requests"].push({
				id: `vr-old-${i}`,
				shop: "s-1",
				submittedBy: "u-1",
				requestedLevel: 2,
				status: "expired",
				kyc: { attempts: 1, decidedAt: new Date().toISOString() },
				createdAt: new Date().toISOString(),
			});
		}
		await expect(
			startKycSession(payload, OWNER, "vr-1", {
				consentVersion: "kyc-2026-10-v1",
				locale: "fr",
			}),
		).rejects.toMatchObject({ code: "verification.tooManyAttempts" });
	});
});
