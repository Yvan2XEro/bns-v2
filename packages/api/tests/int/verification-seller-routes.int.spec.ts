// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationRequests } from "../../src/collections/VerificationRequests";
import { CAPABILITY_UNLOCKS } from "../../src/lib/shopCapabilities";
import { fakePayload } from "./helpers/fakePayload";

const { getPayloadMock, startKycSessionMock } = vi.hoisted(() => ({
	getPayloadMock: vi.fn(),
	startKycSessionMock: vi.fn(async () => ({
		url: "https://verify.didit.me/s/sess-1",
		expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
	})),
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
// `startKycSession` is Task 11's addition to services/verification.ts; every
// other export used here (openRequest, submitRequest, deleteDraft, ...) is
// the real implementation.
vi.mock("../../src/services/verification", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/verification")>()),
	startKycSession: startKycSessionMock,
}));

const SHOP_VERIFICATION_ROUTE =
	"../../src/app/(frontend)/api/shops/[id]/verification/route";
const OPEN_ROUTE =
	"../../src/app/(frontend)/api/shops/[id]/verification-requests/route";
const DETAIL_ROUTE =
	"../../src/app/(frontend)/api/verification-requests/[id]/route";
const BUSINESS_ROUTE =
	"../../src/app/(frontend)/api/verification-requests/[id]/business/route";
const SUBMIT_ROUTE =
	"../../src/app/(frontend)/api/verification-requests/[id]/submit/route";
const KYC_ROUTE =
	"../../src/app/(frontend)/api/verification-requests/[id]/kyc-session/route";
const DOCUMENTS_ROUTE =
	"../../src/app/(frontend)/api/verification-requests/[id]/documents/route";
const DOCUMENT_DELETE_ROUTE =
	"../../src/app/(frontend)/api/verification-requests/[id]/documents/[docId]/route";

const OWNER = { id: "u-1", role: "user", name: "Aïcha" };
const OTHER = { id: "u-2", role: "user", name: "Autre" };
const SUSPENDED_OWNER = {
	...OWNER,
	suspendedAt: "2026-08-01T00:00:00.000Z",
	suspendedUntil: null,
};

const AUTHORISED = {
	enabled: true,
	kycProvider: "didit" as const,
	autoApproveIdentity: false,
	authorisation: { consentVersion: "v1" },
};

function seed(
	over: {
		shop?: Record<string, unknown>;
		requests?: Record<string, unknown>[];
		documents?: Record<string, unknown>[];
		settings?: Record<string, unknown>;
	} = {},
) {
	const payload = fakePayload(
		{
			users: [OWNER, OTHER],
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					name: "Akwa",
					owner: "u-1",
					status: "active",
					level: 1,
					levelExpiresAt: null,
					...over.shop,
				},
			],
			"shop-members": [
				{
					id: "sm-1",
					shop: "s-1",
					user: "u-1",
					role: "owner",
					status: "active",
				},
			],
			"verification-requests": over.requests ?? [],
			"verification-documents": over.documents ?? [],
		},
		{
			globals: {
				"app-settings": { verification: over.settings ?? AUTHORISED },
			},
		},
	);
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

const asOwner = (payload: ReturnType<typeof seed>) =>
	payload.auth.mockResolvedValue({ user: { id: OWNER.id, role: OWNER.role } });
const asOther = (payload: ReturnType<typeof seed>) =>
	payload.auth.mockResolvedValue({ user: { id: OTHER.id, role: OTHER.role } });
const asSuspendedOwner = (payload: ReturnType<typeof seed>) =>
	payload.auth.mockResolvedValue({
		user: {
			id: SUSPENDED_OWNER.id,
			role: SUSPENDED_OWNER.role,
			suspendedAt: SUSPENDED_OWNER.suspendedAt,
			suspendedUntil: SUSPENDED_OWNER.suspendedUntil,
		},
	});

const get = (url: string) => new Request(url);
const del = (url: string) => new Request(url, { method: "DELETE" });
function post(url: string, body?: unknown) {
	return new Request(url, {
		method: "POST",
		headers: body !== undefined ? { "content-type": "application/json" } : {},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}
function upload(url: string, fields: { file?: File; kind?: string }) {
	const form = new FormData();
	if (fields.file) form.set("file", fields.file);
	if (fields.kind !== undefined) form.set("kind", fields.kind);
	return new Request(url, { method: "POST", body: form });
}
const pdfFile = (name = "doc.pdf") =>
	new File(["%PDF-1.4 fake"], name, { type: "application/pdf" });
const textFile = (name = "doc.txt") =>
	new File(["hello"], name, { type: "text/plain" });

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const docParams = (id: string, docId: string) => ({
	params: Promise.resolve({ id, docId }),
});

const VALID_BUSINESS_BODY = {
	businessType: "company",
	legalName: "Akwa Commerce SARL",
	tradeName: null,
	rccmNumber: "  rc/dla/2020/b/1234 ",
	entreprenantDeclarationNumber: " m0123 45678901x ",
	niu: "12345678901234",
	registeredAddress: "Rue de la Joie",
	city: "Douala",
	legalRepresentativeName: "Jean Mbarga",
	legalRepresentativeIsOwner: true,
};

const DRAFT_L3 = {
	id: "vr-1",
	shop: "s-1",
	submittedBy: "u-1",
	requestedLevel: 3,
	status: "draft",
	openKey: "s-1:3",
	business: {
		businessType: "company",
		legalName: "Akwa Commerce SARL",
		niu: "12345678901234",
		registeredAddress: "Rue de la Joie",
		city: "Douala",
		legalRepresentativeName: "Jean Mbarga",
		legalRepresentativeIsOwner: true,
		rccmNumber: "RC/DLA/2020/B/1234",
	},
};

beforeEach(() => {
	startKycSessionMock.mockClear();
});

describe("GET /api/shops/{id}/verification", () => {
	it("answers with the capabilities, the per-level requests and what the next level unlocks", async () => {
		const payload = seed({
			shop: { level: 2, levelExpiresAt: "2027-06-01T00:00:00.000Z" },
			requests: [
				{
					id: "vr-2",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "approved",
					expiresAt: "2027-06-01T00:00:00.000Z",
					approvedAt: "2025-06-01T00:00:00.000Z",
				},
				{
					id: "vr-3",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "submitted",
					submittedAt: "2026-09-01T00:00:00.000Z",
					business: { businessType: "company", legalName: "Akwa SARL" },
				},
			],
		});
		asOwner(payload);

		const { GET } = await import(SHOP_VERIFICATION_ROUTE);
		const response = await GET(
			get("http://x/api/shops/s-1/verification"),
			params("s-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.capabilities.effectiveLevel).toBe(2);
		expect(body.nextLevel).toEqual({
			level: 3,
			unlocks: CAPABILITY_UNLOCKS[3],
			eligible: true,
		});
		expect(body.requests.level2.id).toBe("vr-2");
		expect(body.requests.level3.id).toBe("vr-3");
		expect(body.requests.level3.status).toBe("submitted");
	});

	it("keeps answering when the feature is off, with enabled:false", async () => {
		// The flag gates creation, never access to what already exists. A seller
		// mid-flight when the flag is switched off must still see where they
		// stand — this is the exact shape of the bug that cost P1 a fix round.
		const payload = seed({
			shop: { level: 2, levelExpiresAt: "2027-06-01T00:00:00.000Z" },
			settings: { ...AUTHORISED, enabled: false },
		});
		asOwner(payload);

		const { GET } = await import(SHOP_VERIFICATION_ROUTE);
		const response = await GET(
			get("http://x/api/shops/s-1/verification"),
			params("s-1"),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			enabled: false,
			capabilities: { effectiveLevel: 2 },
		});
	});

	it("refuses a caller who is not the owner", async () => {
		const payload = seed();
		asOther(payload);

		const { GET } = await import(SHOP_VERIFICATION_ROUTE);
		const response = await GET(
			get("http://x/api/shops/s-1/verification"),
			params("s-1"),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			code: "verification.notOwner",
		});
	});

	const POPULATED_LEVEL2 = {
		id: "vr-4",
		shop: "s-1",
		submittedBy: "u-1",
		requestedLevel: 2,
		status: "in_review",
		assignee: "m-1",
		claimedAt: "2026-09-01T00:00:00.000Z",
		reviewSignals: [{ code: "niu_format", detail: "x" }],
		kyc: {
			status: "pending",
			attempts: 1,
			documentNumberHash: "abc",
			faceMatchScore: 80,
			vendorWarnings: ["w"],
			vendorReviewUrl: "https://console.didit.me/s/sess-1",
		},
		decision: { internalNote: "secret", checklist: { a: true } },
	};

	it("strips every reviewer-only field from the owner's own request", async () => {
		const payload = seed({ requests: [POPULATED_LEVEL2] });
		asOwner(payload);

		const { GET } = await import(SHOP_VERIFICATION_ROUTE);
		const response = await GET(
			get("http://x/api/shops/s-1/verification"),
			params("s-1"),
		);
		const serialised = JSON.stringify(await response.json());
		for (const key of [
			"reviewSignals",
			"assignee",
			"claimedAt",
			"internalNote",
			"checklist",
			"documentNumberHash",
			"faceMatchScore",
			"vendorWarnings",
			"vendorReviewUrl",
		]) {
			expect(serialised).not.toContain(key);
		}
	});

	it("matches the same request a direct query returns", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-5",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "submitted",
					submittedAt: "2026-09-01T00:00:00.000Z",
				},
			],
		});
		asOwner(payload);

		const { GET } = await import(SHOP_VERIFICATION_ROUTE);
		const response = await GET(
			get("http://x/api/shops/s-1/verification"),
			params("s-1"),
		);
		const body = await response.json();
		const direct = await payload.find({
			collection: "verification-requests",
			where: { id: { equals: "vr-5" } },
		});
		expect(body.requests.level2.id).toBe(direct.docs[0].id);
	});

	it("never exposes a field the collection itself marks reviewer-only", async () => {
		// The fake has no field-level access-control simulation at all, so the
		// shaped route and Payload's own REST answer cannot be compared through
		// it directly (the same limit Task 12 hit with the `documents` join).
		// Proving agreement instead means reading the collection's own
		// `access: { read: reviewerField }` declarations — the same rule
		// Payload's generic REST route enforces — and checking that the shaped
		// response never contains one of those names, on a request populated
		// with every reviewer-only field the collection defines.
		const restricted = reviewerOnlyFieldNames(VerificationRequests.fields);
		expect(restricted.length).toBeGreaterThan(0);

		const payload = seed({
			requests: [
				{
					...POPULATED_LEVEL2,
					id: "vr-6",
					infoRequests: [
						{
							requestedBy: "m-1",
							reasonCode: "other",
							message: "x",
							requestedAt: "2026-09-01T00:00:00.000Z",
						},
					],
				},
			],
		});
		asOwner(payload);

		const { GET } = await import(SHOP_VERIFICATION_ROUTE);
		const response = await GET(
			get("http://x/api/shops/s-1/verification"),
			params("s-1"),
		);
		const serialised = JSON.stringify(await response.json());
		for (const name of restricted) {
			expect(serialised).not.toContain(`"${name}"`);
		}
	});
});

describe("write routes", () => {
	it("returns 403 verification.disabled for every write while the flag is off", async () => {
		const payload = seed({
			settings: { ...AUTHORISED, enabled: false },
			requests: [DRAFT_L3],
		});
		asOwner(payload);

		const { POST: openPOST } = await import(OPEN_ROUTE);
		const { POST: kycPOST } = await import(KYC_ROUTE);
		const { POST: businessPOST } = await import(BUSINESS_ROUTE);
		const { POST: submitPOST } = await import(SUBMIT_ROUTE);
		const { POST: documentsPOST } = await import(DOCUMENTS_ROUTE);

		const calls = [
			() =>
				openPOST(
					post("http://x/api/shops/s-1/verification-requests", { level: 2 }),
					params("s-1"),
				),
			() =>
				kycPOST(
					post("http://x/api/verification-requests/vr-1/kyc-session", {
						consentVersion: "v1",
						locale: "fr",
					}),
					params("vr-1"),
				),
			() =>
				businessPOST(
					post(
						"http://x/api/verification-requests/vr-1/business",
						VALID_BUSINESS_BODY,
					),
					params("vr-1"),
				),
			() =>
				submitPOST(
					post("http://x/api/verification-requests/vr-1/submit"),
					params("vr-1"),
				),
			() =>
				documentsPOST(
					upload("http://x/api/verification-requests/vr-1/documents", {
						file: pdfFile(),
						kind: "rccm_extract",
					}),
					params("vr-1"),
				),
		];

		for (const call of calls) {
			const response = await call();
			expect(response.status).toBe(403);
			expect(await response.json()).toMatchObject({
				code: "verification.disabled",
			});
		}
	});

	it("refuses a level-3 request before level 2 is effective", async () => {
		const payload = seed();
		asOwner(payload);

		const { POST } = await import(OPEN_ROUTE);
		const response = await POST(
			post("http://x/api/shops/s-1/verification-requests", { level: 3 }),
			params("s-1"),
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: "verification.levelNotEligible",
		});
	});

	it("refuses a second open request for the same level", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "draft",
					openKey: "s-1:2",
				},
			],
		});
		asOwner(payload);

		const { POST } = await import(OPEN_ROUTE);
		const response = await POST(
			post("http://x/api/shops/s-1/verification-requests", { level: 2 }),
			params("s-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.id).toBe("vr-1");
	});

	it("refuses during a cooldown", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-old",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "rejected",
					openKey: null,
					decision: {
						decidedAt: new Date().toISOString(),
						reasonCode: "document_invalid",
					},
				},
			],
		});
		asOwner(payload);

		const { POST } = await import(OPEN_ROUTE);
		const response = await POST(
			post("http://x/api/shops/s-1/verification-requests", { level: 2 }),
			params("s-1"),
		);
		expect(response.status).toBe(429);
		expect(await response.json()).toMatchObject({
			code: "verification.cooldown",
		});
	});

	it("validates and normalises the business group", async () => {
		const payload = seed({ requests: [DRAFT_L3] });
		asOwner(payload);

		const { POST } = await import(BUSINESS_ROUTE);
		const response = await POST(
			post(
				"http://x/api/verification-requests/vr-1/business",
				VALID_BUSINESS_BODY,
			),
			params("vr-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.business.rccmNumber).toBe("RC/DLA/2020/B/1234");
		expect(body.business.entreprenantDeclarationNumber).toBe("M012345678901X");
	});

	it("uppercases the niu the same way it does the registration numbers", async () => {
		const payload = seed({ requests: [DRAFT_L3] });
		asOwner(payload);

		const { POST } = await import(BUSINESS_ROUTE);
		const response = await POST(
			post("http://x/api/verification-requests/vr-1/business", {
				...VALID_BUSINESS_BODY,
				// A non-browser caller (or one that skips the client's own
				// upper-casing) can post any case here; the server is the only
				// place `niu_reused` duplicate detection can rely on.
				niu: "m012312345678n",
			}),
			params("vr-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.business.niu).toBe("M012312345678N");
	});

	it("refuses a business group missing a required field with verification.fieldsInvalid", async () => {
		const payload = seed({ requests: [DRAFT_L3] });
		asOwner(payload);

		const { POST } = await import(BUSINESS_ROUTE);
		const { legalName: _legalName, ...incomplete } = VALID_BUSINESS_BODY;
		const response = await POST(
			post("http://x/api/verification-requests/vr-1/business", incomplete),
			params("vr-1"),
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			code: "verification.fieldsInvalid",
		});
	});

	it("refuses an unknown document kind and a type outside the four", async () => {
		const payload = seed({ requests: [DRAFT_L3] });
		asOwner(payload);

		const { POST } = await import(DOCUMENTS_ROUTE);

		const badKind = await POST(
			upload("http://x/api/verification-requests/vr-1/documents", {
				file: pdfFile(),
				kind: "not_a_real_kind",
			}),
			params("vr-1"),
		);
		expect(badKind.status).toBe(400);

		const badType = await POST(
			upload("http://x/api/verification-requests/vr-1/documents", {
				file: textFile(),
				kind: "rccm_extract",
			}),
			params("vr-1"),
		);
		expect(badType.status).toBe(400);
		expect(await badType.json()).toMatchObject({ code: "upload.invalidType" });
	});

	it("refuses submit while a required document is missing", async () => {
		const payload = seed({ requests: [DRAFT_L3] });
		asOwner(payload);

		const { POST } = await import(SUBMIT_ROUTE);
		const response = await POST(
			post("http://x/api/verification-requests/vr-1/submit"),
			params("vr-1"),
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: "verification.documentsMissing",
		});
	});

	it("submits once every required document is present", async () => {
		const payload = seed({
			requests: [DRAFT_L3],
			documents: [
				{ id: "vd-1", request: "vr-1", shop: "s-1", kind: "rccm_extract" },
				{ id: "vd-2", request: "vr-1", shop: "s-1", kind: "niu_certificate" },
			],
		});
		asOwner(payload);

		const { POST } = await import(SUBMIT_ROUTE);
		const response = await POST(
			post("http://x/api/verification-requests/vr-1/submit"),
			params("vr-1"),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).status).toBe("submitted");
	});

	it("deletes a draft and its documents", async () => {
		const payload = seed({
			requests: [DRAFT_L3],
			documents: [
				{ id: "vd-1", request: "vr-1", shop: "s-1", kind: "rccm_extract" },
			],
		});
		asOwner(payload);

		const { DELETE } = await import(DETAIL_ROUTE);
		const response = await DELETE(
			del("http://x/api/verification-requests/vr-1"),
			params("vr-1"),
		);
		expect(response.status).toBe(204);
		expect(payload.store["verification-requests"]).toHaveLength(0);
		expect(payload.store["verification-documents"]).toHaveLength(0);
	});

	it("refuses to delete a submitted request", async () => {
		const payload = seed({
			requests: [{ ...DRAFT_L3, status: "submitted", openKey: null }],
		});
		asOwner(payload);

		const { DELETE } = await import(DETAIL_ROUTE);
		const response = await DELETE(
			del("http://x/api/verification-requests/vr-1"),
			params("vr-1"),
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: "verification.invalidTransition",
		});
	});

	it("refuses a document upload from someone who does not own the request", async () => {
		const payload = seed({ requests: [DRAFT_L3] });
		asOther(payload);

		const { POST } = await import(DOCUMENTS_ROUTE);
		const response = await POST(
			upload("http://x/api/verification-requests/vr-1/documents", {
				file: pdfFile(),
				kind: "rccm_extract",
			}),
			params("vr-1"),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			code: "verification.notOwner",
		});
	});

	it("removes a document belonging to the request", async () => {
		const payload = seed({
			requests: [DRAFT_L3],
			documents: [
				{ id: "vd-1", request: "vr-1", shop: "s-1", kind: "rccm_extract" },
			],
		});
		asOwner(payload);

		const { DELETE } = await import(
			"../../src/app/(frontend)/api/verification-requests/[id]/documents/[docId]/route"
		);
		const response = await DELETE(
			del("http://x/api/verification-requests/vr-1/documents/vd-1"),
			docParams("vr-1", "vd-1"),
		);
		expect(response.status).toBe(204);
		expect(payload.store["verification-documents"]).toHaveLength(0);
	});

	it("starts a KYC session through the service and returns its URL", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "draft",
					openKey: "s-1:2",
				},
			],
		});
		asOwner(payload);

		const { POST } = await import(KYC_ROUTE);
		const response = await POST(
			post("http://x/api/verification-requests/vr-1/kyc-session", {
				consentVersion: "v1",
				locale: "fr",
			}),
			params("vr-1"),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			url: expect.stringContaining("https://"),
		});
		expect(startKycSessionMock).toHaveBeenCalledWith(
			payload,
			expect.objectContaining({ id: "u-1" }),
			"vr-1",
			{ consentVersion: "v1", locale: "fr" },
		);
	});
});

describe("GET /api/verification-requests/{id}", () => {
	it("returns the owner's own request", async () => {
		const payload = seed({ requests: [DRAFT_L3] });
		asOwner(payload);

		const { GET } = await import(DETAIL_ROUTE);
		const response = await GET(
			get("http://x/api/verification-requests/vr-1"),
			params("vr-1"),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).id).toBe("vr-1");
	});

	it("refuses a caller who is not the owner", async () => {
		const payload = seed({ requests: [DRAFT_L3] });
		asOther(payload);

		const { GET } = await import(DETAIL_ROUTE);
		const response = await GET(
			get("http://x/api/verification-requests/vr-1"),
			params("vr-1"),
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			code: "verification.notOwner",
		});
	});
});

describe("a suspended owner", () => {
	// `kyc-session` is not in this enumeration: this file mocks `startKycSession`
	// itself (see the top of the file), so a route-level call here would only
	// prove the mock ignores suspension, not the real service. That route's
	// suspension check is pinned directly against the real implementation in
	// verification-service.int.spec.ts.
	it("is refused by every seller verification route (I2)", async () => {
		const payload = seed({
			requests: [DRAFT_L3],
			documents: [
				{ id: "vd-1", request: "vr-1", shop: "s-1", kind: "rccm_extract" },
			],
		});
		asSuspendedOwner(payload);

		const { GET: shopGET } = await import(SHOP_VERIFICATION_ROUTE);
		const { POST: openPOST } = await import(OPEN_ROUTE);
		const { GET: detailGET, DELETE: detailDELETE } = await import(DETAIL_ROUTE);
		const { POST: businessPOST } = await import(BUSINESS_ROUTE);
		const { POST: submitPOST } = await import(SUBMIT_ROUTE);
		const { POST: documentsPOST } = await import(DOCUMENTS_ROUTE);
		const { DELETE: documentDELETE } = await import(DOCUMENT_DELETE_ROUTE);

		const calls: Array<[string, () => Promise<Response>]> = [
			[
				"GET /shops/{id}/verification",
				() =>
					shopGET(get("http://x/api/shops/s-1/verification"), params("s-1")),
			],
			[
				"POST /shops/{id}/verification-requests",
				() =>
					openPOST(
						post("http://x/api/shops/s-1/verification-requests", {
							level: 2,
						}),
						params("s-1"),
					),
			],
			[
				"GET /verification-requests/{id}",
				() =>
					detailGET(
						get("http://x/api/verification-requests/vr-1"),
						params("vr-1"),
					),
			],
			[
				"DELETE /verification-requests/{id}",
				() =>
					detailDELETE(
						del("http://x/api/verification-requests/vr-1"),
						params("vr-1"),
					),
			],
			[
				"POST /verification-requests/{id}/business",
				() =>
					businessPOST(
						post(
							"http://x/api/verification-requests/vr-1/business",
							VALID_BUSINESS_BODY,
						),
						params("vr-1"),
					),
			],
			[
				"POST /verification-requests/{id}/submit",
				() =>
					submitPOST(
						post("http://x/api/verification-requests/vr-1/submit"),
						params("vr-1"),
					),
			],
			[
				"POST /verification-requests/{id}/documents",
				() =>
					documentsPOST(
						upload("http://x/api/verification-requests/vr-1/documents", {
							file: pdfFile(),
							kind: "rccm_extract",
						}),
						params("vr-1"),
					),
			],
			[
				"DELETE /verification-requests/{id}/documents/{docId}",
				() =>
					documentDELETE(
						del("http://x/api/verification-requests/vr-1/documents/vd-1"),
						docParams("vr-1", "vd-1"),
					),
			],
		];

		for (const [label, call] of calls) {
			const response = await call();
			expect(response.status, label).toBe(403);
			expect(await response.json(), label).toMatchObject({
				code: "moderation.accountSuspended",
			});
		}
	});
});

// ─── Helpers for the field-agreement proof ──────────────────────────────────

interface FieldLike {
	name?: unknown;
	access?: { read?: unknown };
	fields?: unknown;
}

function isFieldLike(value: unknown): value is FieldLike {
	return typeof value === "object" && value !== null;
}

function reviewerOnlyFieldNames(fields: unknown): string[] {
	if (!Array.isArray(fields)) return [];
	const names: string[] = [];
	for (const raw of fields) {
		if (!isFieldLike(raw)) continue;
		if (raw.access?.read && typeof raw.name === "string") names.push(raw.name);
		if (raw.fields) names.push(...reviewerOnlyFieldNames(raw.fields));
	}
	return names;
}
