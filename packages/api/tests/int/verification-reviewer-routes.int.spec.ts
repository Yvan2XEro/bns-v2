// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	pendingVerificationsWhere,
	queueSort,
	queueWhere,
} from "../../src/lib/verificationQueue";
import { fakePayload } from "./helpers/fakePayload";

// vi.hoisted: getPayloadMock backs the mock factory below, which vitest
// hoists above every import in this file (including the route modules, which
// pull in "payload" itself) — a plain top-level const would still be in its
// temporal dead zone when that factory runs.
const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const QUEUE_ROUTE =
	"../../src/app/(frontend)/api/moderation/verification/route";
const DETAIL_ROUTE =
	"../../src/app/(frontend)/api/moderation/verification/[id]/route";
const SUMMARY_ROUTE = "../../src/app/(frontend)/api/moderation/summary/route";

const NOW = new Date("2026-10-01T12:00:00.000Z");

const OWNER = {
	id: "u-1",
	role: "user",
	name: "Aïcha Mbappe",
	email: "aicha@example.com",
};
const MEMBER = { id: "u-2", role: "user", name: "Colleague" };
const MOD = { id: "m-1", role: "moderator", name: "Grâce" };
const MOD2 = { id: "m-2", role: "moderator", name: "Colleague Mod" };
const ADMIN = { id: "a-1", role: "admin", name: "Boss" };

const FULL_CHECKLIST = {
	name_matches_registry: true,
	registration_number_matches_document: true,
	niu_matches_certificate: true,
	representative_matches_identity_or_mandate: true,
	documents_legible_and_current: true,
};

function seed(
	over: {
		requests?: Record<string, unknown>[];
		documents?: Record<string, unknown>[];
		shopMembers?: Record<string, unknown>[];
		log?: Record<string, unknown>[];
		enabled?: boolean;
	} = {},
) {
	const payload = fakePayload(
		{
			users: [OWNER, MEMBER, MOD, MOD2, ADMIN].map((u) => ({ ...u })),
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
			"shop-members": over.shopMembers ?? [
				{ id: "sm-1", shop: "s-1", user: "u-1", role: "owner" },
			],
			"verification-requests": over.requests ?? [],
			"verification-documents": over.documents ?? [],
			"moderation-log": over.log ?? [],
		},
		{
			globals: {
				"app-settings": {
					verification: { enabled: over.enabled ?? true },
				},
			},
		},
	);
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

function authAs(
	payload: ReturnType<typeof seed>,
	user: { id: string; role: string },
) {
	payload.auth.mockResolvedValue({ user });
}

function getRequest(query: Record<string, string> = {}) {
	const url = new URL("http://x/api/moderation/verification");
	for (const [key, value] of Object.entries(query))
		url.searchParams.set(key, value);
	return new Request(url, { method: "GET" });
}

function detailGetRequest(id: string) {
	return new Request(`http://x/api/moderation/verification/${id}`, {
		method: "GET",
	});
}

function detailPostRequest(id: string, body: Record<string, unknown>) {
	return new Request(`http://x/api/moderation/verification/${id}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
	getPayloadMock.mockReset();
});

describe("queueWhere", () => {
	it("puts submitted requests in to_review, oldest first, resubmissions ahead", async () => {
		expect(queueWhere("to_review", "m-1", NOW)).toEqual({
			status: { equals: "submitted" },
		});
		expect(queueSort("to_review")).toBe("submittedAt");

		const payload = fakePayload({
			"verification-requests": [
				{
					id: "vr-new",
					status: "submitted",
					submittedAt: "2026-09-10T00:00:00.000Z",
				},
				{
					id: "vr-resubmitted",
					status: "submitted",
					submittedAt: "2026-09-05T00:00:00.000Z",
					infoRequests: [
						{
							reasonCode: "document_missing",
							message: "please attach",
							requestedAt: "2026-09-02T00:00:00.000Z",
							respondedAt: "2026-09-04T00:00:00.000Z",
						},
					],
				},
				{
					id: "vr-old",
					status: "submitted",
					submittedAt: "2026-09-01T00:00:00.000Z",
				},
				{ id: "vr-draft", status: "draft", submittedAt: null },
			],
		});
		const found = await payload.find({
			collection: "verification-requests",
			where: queueWhere("to_review", "m-1", NOW),
			sort: queueSort("to_review"),
			pagination: false,
		});
		expect(found.docs.map((doc) => doc.id)).toEqual([
			"vr-old",
			"vr-resubmitted",
			"vr-new",
		]);
	});

	it("scopes mine to the caller's own claims", () => {
		expect(queueWhere("mine", "m-1", NOW)).toMatchObject({
			and: expect.arrayContaining([
				{ status: { equals: "in_review" } },
				{ assignee: { equals: "m-1" } },
			]),
		});
	});

	it("limits decided to the last 30 days", () => {
		expect(queueWhere("decided", "m-1", NOW)).toMatchObject({
			and: expect.arrayContaining([
				{
					updatedAt: {
						greater_than: new Date(
							NOW.getTime() - 30 * 86_400_000,
						).toISOString(),
					},
				},
			]),
		});
	});
});

describe("pendingVerificationsWhere", () => {
	it("counts submitted requests and claims idle for 48 hours", async () => {
		const payload = fakePayload({
			"verification-requests": [
				{ id: "vr-1", status: "submitted" },
				{
					id: "vr-2",
					status: "in_review",
					claimedAt: new Date(NOW.getTime() - 49 * 3_600_000).toISOString(),
				},
				{
					id: "vr-3",
					status: "in_review",
					claimedAt: new Date(NOW.getTime() - 1 * 3_600_000).toISOString(),
				},
				{ id: "vr-4", status: "approved" },
			],
		});
		const found = await payload.count({
			collection: "verification-requests",
			where: pendingVerificationsWhere(NOW),
		});
		expect(found.totalDocs).toBe(2);
	});
});

describe("GET /api/moderation/verification", () => {
	it("keeps working while the feature flag is off", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "submitted",
					submittedAt: NOW.toISOString(),
				},
			],
			enabled: false,
		});
		authAs(payload, MOD);
		const findGlobal = vi.spyOn(payload, "findGlobal");

		const { GET } = await import(QUEUE_ROUTE);
		const response = await GET(getRequest());

		expect(response.status).toBe(200);
		expect(findGlobal).not.toHaveBeenCalled();
	});

	it("refuses a non-moderator with moderation.forbidden", async () => {
		const payload = seed();
		authAs(payload, { id: "u-1", role: "user" });

		const { GET } = await import(QUEUE_ROUTE);
		const response = await GET(getRequest());

		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe("moderation.forbidden");
	});

	it("returns the signal codes and the age for each row", async () => {
		const submittedAt = new Date(NOW.getTime() - 3_600_000).toISOString();
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "submitted",
					submittedAt,
					reviewSignals: [{ code: "name_mismatch" }, { code: "niu_format" }],
				},
			],
		});
		authAs(payload, MOD);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);

		const { GET } = await import(QUEUE_ROUTE);
		const body = await (await GET(getRequest())).json();

		expect(body.items).toHaveLength(1);
		expect(body.items[0]).toMatchObject({
			id: "vr-1",
			signals: ["name_mismatch", "niu_format"],
		});
		expect(body.items[0].ageMs).toBeGreaterThanOrEqual(3_600_000);
		vi.useRealTimers();
	});

	it("filters by level and by signal", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-l2",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "submitted",
					submittedAt: NOW.toISOString(),
					reviewSignals: [{ code: "name_mismatch" }],
				},
				{
					id: "vr-l3-match",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "submitted",
					submittedAt: NOW.toISOString(),
					reviewSignals: [{ code: "name_mismatch" }],
				},
				{
					id: "vr-l3-other-signal",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "submitted",
					submittedAt: NOW.toISOString(),
					reviewSignals: [{ code: "niu_format" }],
				},
			],
		});
		authAs(payload, MOD);

		const { GET } = await import(QUEUE_ROUTE);
		const body = await (
			await GET(getRequest({ level: "3", signal: "name_mismatch" }))
		).json();

		expect(body.items.map((item: { id: string }) => item.id)).toEqual([
			"vr-l3-match",
		]);
	});
});

describe("GET /api/moderation/verification/{id}", () => {
	function detailSeed() {
		return seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "in_review",
					assignee: "m-1",
					claimedAt: "2026-09-30T00:00:00.000Z",
					submittedAt: "2026-09-29T00:00:00.000Z",
				},
				{
					id: "vr-0",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "approved",
					submittedAt: "2026-01-01T00:00:00.000Z",
				},
			],
			documents: [
				{
					id: "vd-1",
					request: "vr-1",
					shop: "s-1",
					kind: "rccm_extract",
					originalFilename: "rccm.pdf",
					sha256: "a".repeat(64),
					uploadedBy: "u-1",
					filename: "vd-1.pdf",
					mimeType: "application/pdf",
					url: "https://files.example.com/vd-1.pdf",
				},
			],
			log: [
				{
					id: "log-1",
					actor: "m-1",
					actorRole: "moderator",
					action: "verification.claim",
					targetType: "verification-request",
					targetId: "vr-1",
				},
			],
		});
	}

	it("returns the request, the shop, the owner, the other requests and the log history", async () => {
		const payload = detailSeed();
		authAs(payload, MOD);

		const { GET } = await import(DETAIL_ROUTE);
		const body = await (
			await GET(detailGetRequest("vr-1"), idParams("vr-1"))
		).json();

		expect(body.request).toMatchObject({ id: "vr-1", status: "in_review" });
		expect(body.shop).toMatchObject({ id: "s-1", handle: "akwa" });
		expect(body.owner).toMatchObject({ id: "u-1", email: "aicha@example.com" });
		expect(body.otherRequests.map((r: { id: string }) => r.id)).toEqual([
			"vr-0",
		]);
		expect(body.log).toHaveLength(1);
	});

	it("returns document metadata with no URLs", async () => {
		const payload = detailSeed();
		authAs(payload, MOD);

		const { GET } = await import(DETAIL_ROUTE);
		const response = await GET(detailGetRequest("vr-1"), idParams("vr-1"));
		const body = await response.json();

		expect(body.request.documents[0]).toMatchObject({
			id: expect.any(String),
			kind: "rccm_extract",
		});
		expect(JSON.stringify(body)).not.toContain("http");
	});

	it("states the caller's own standing rather than leaving it to be inferred", async () => {
		const payload = detailSeed();
		authAs(payload, MOD2);
		const { GET } = await import(DETAIL_ROUTE);
		const asOther = await (
			await GET(detailGetRequest("vr-1"), idParams("vr-1"))
		).json();
		expect(asOther.viewer).toEqual({
			canClaim: false,
			canDecide: false,
			canRevoke: false,
			isAssignee: false,
			isAdmin: false,
			conflictOfInterest: false,
		});

		authAs(payload, MOD);
		const asAssignee = await (
			await GET(detailGetRequest("vr-1"), idParams("vr-1"))
		).json();
		expect(asAssignee.viewer).toMatchObject({
			canDecide: true,
			// `vr-1` is `in_review`, not `approved` — `canRevoke` follows the
			// state machine, not the assignee.
			canRevoke: false,
			isAssignee: true,
		});
	});

	it("lets a moderator revoke an approved request from the queue — C6: canDecide is always false once approved, canRevoke is not", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-approved",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "approved",
					assignee: null,
					submittedAt: "2026-09-01T00:00:00.000Z",
					approvedAt: "2026-09-05T00:00:00.000Z",
				},
			],
		});
		authAs(payload, MOD);

		const { GET, POST } = await import(DETAIL_ROUTE);
		const detail = await (
			await GET(detailGetRequest("vr-approved"), idParams("vr-approved"))
		).json();

		expect(detail.viewer.isAssignee).toBe(false);
		expect(detail.viewer.canDecide).toBe(false);
		expect(detail.viewer.canRevoke).toBe(true);

		const response = await POST(
			detailPostRequest("vr-approved", {
				action: "revoke",
				reasonCode: "document_forged",
			}),
			idParams("vr-approved"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.request).toMatchObject({ status: "revoked" });
	});

	it("reports conflictOfInterest for a reviewer who is a member of the shop", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "submitted",
					submittedAt: "2026-09-29T00:00:00.000Z",
				},
			],
			shopMembers: [
				{ id: "sm-1", shop: "s-1", user: "u-1", role: "owner" },
				{ id: "sm-2", shop: "s-1", user: "m-1", role: "staff" },
			],
		});
		authAs(payload, MOD);

		const { GET } = await import(DETAIL_ROUTE);
		const body = await (
			await GET(detailGetRequest("vr-1"), idParams("vr-1"))
		).json();

		expect(body.viewer.conflictOfInterest).toBe(true);
		expect(body.viewer.canClaim).toBe(false);
	});
});

describe("POST /api/moderation/verification/{id}", () => {
	it("claims a submitted request", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "submitted",
					submittedAt: NOW.toISOString(),
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", { action: "claim" }),
			idParams("vr-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.request).toMatchObject({
			status: "in_review",
			assignee: "m-1",
		});
	});

	it("releases a claimed request", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "in_review",
					assignee: "m-1",
					claimedAt: NOW.toISOString(),
					submittedAt: NOW.toISOString(),
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", { action: "release" }),
			idParams("vr-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.request).toMatchObject({ status: "submitted", assignee: null });
	});

	it("requests info on a claimed request", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "in_review",
					assignee: "m-1",
					claimedAt: NOW.toISOString(),
					submittedAt: NOW.toISOString(),
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", {
				action: "request_info",
				reasonCode: "document_missing",
				sellerMessage: "Please attach the RCCM extract.",
			}),
			idParams("vr-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.request).toMatchObject({ status: "needs_info" });
	});

	it("approves a level-3 request with a complete checklist", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "in_review",
					assignee: "m-1",
					claimedAt: NOW.toISOString(),
					submittedAt: NOW.toISOString(),
					business: {
						businessType: "company",
						legalName: "AKWA SARL",
						rccmNumber: "RC/DLA/2020/B/1234",
						niu: "M012345678901X",
						registeredAddress: "Akwa",
						city: "Douala",
						legalRepresentativeName: "Aïcha Mbappe",
						legalRepresentativeIsOwner: true,
					},
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", {
				action: "approve",
				checklist: FULL_CHECKLIST,
			}),
			idParams("vr-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.request).toMatchObject({ status: "approved" });
	});

	it("rejects a claimed request", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "in_review",
					assignee: "m-1",
					claimedAt: NOW.toISOString(),
					submittedAt: NOW.toISOString(),
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", {
				action: "reject",
				reasonCode: "document_invalid",
				sellerMessage: "The document is not readable.",
			}),
			idParams("vr-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.request).toMatchObject({ status: "rejected" });
	});

	it("refuses a reject reason code outside REJECT_REASONS (I3)", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "in_review",
					assignee: "m-1",
					claimedAt: NOW.toISOString(),
					submittedAt: NOW.toISOString(),
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", {
				action: "reject",
				reasonCode: "not_a_real_reason",
				sellerMessage: "The document is not readable.",
			}),
			idParams("vr-1"),
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			code: "moderation.reasonInvalid",
		});
	});

	it("revokes an approved request", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "approved",
					approvedAt: "2026-01-01T00:00:00.000Z",
					expiresAt: "2028-01-01T00:00:00.000Z",
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", { action: "revoke", reasonCode: "fraud" }),
			idParams("vr-1"),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.request).toMatchObject({ status: "revoked" });
	});

	it("refuses a revoke reason code outside REVOKE_REASONS (I3)", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "approved",
					approvedAt: "2026-01-01T00:00:00.000Z",
					expiresAt: "2028-01-01T00:00:00.000Z",
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", { action: "revoke", reasonCode: "fake" }),
			idParams("vr-1"),
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			code: "moderation.reasonInvalid",
		});
	});

	it("lets one of two simultaneous claims win with 409 for the other", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "submitted",
					submittedAt: NOW.toISOString(),
				},
			],
		});
		const { POST } = await import(DETAIL_ROUTE);

		payload.auth.mockResolvedValueOnce({ user: MOD });
		payload.auth.mockResolvedValueOnce({ user: MOD2 });

		const responses = await Promise.all([
			POST(detailPostRequest("vr-1", { action: "claim" }), idParams("vr-1")),
			POST(detailPostRequest("vr-1", { action: "claim" }), idParams("vr-1")),
		]);
		const statuses = responses.map((r) => r.status).sort();
		expect(statuses).toEqual([200, 409]);

		const losing = responses.find((r) => r.status === 409);
		const losingBody = await losing?.json();
		expect(losingBody.code).toBe("verification.invalidTransition");

		expect(
			payload.store["moderation-log"].filter(
				(entry) => entry.action === "verification.claim",
			),
		).toHaveLength(1);
	});

	it("returns 400 verification.checklistIncomplete for a level-3 approval missing an item", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "in_review",
					assignee: "m-1",
					claimedAt: NOW.toISOString(),
					submittedAt: NOW.toISOString(),
					business: {
						businessType: "company",
						legalName: "AKWA SARL",
						rccmNumber: "RC/DLA/2020/B/1234",
						niu: "M012345678901X",
						registeredAddress: "Akwa",
						city: "Douala",
						legalRepresentativeName: "Aïcha Mbappe",
						legalRepresentativeIsOwner: true,
					},
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", {
				action: "approve",
				checklist: { ...FULL_CHECKLIST, niu_matches_certificate: false },
			}),
			idParams("vr-1"),
		);
		expect(response.status).toBe(400);
		expect((await response.json()).code).toBe(
			"verification.checklistIncomplete",
		);
	});

	it("returns 403 verification.notAssignee for a decision by another reviewer", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "in_review",
					assignee: "m-1",
					claimedAt: NOW.toISOString(),
					submittedAt: NOW.toISOString(),
				},
			],
		});
		authAs(payload, MOD2);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", {
				action: "reject",
				reasonCode: "document_invalid",
				sellerMessage: "Not readable.",
			}),
			idParams("vr-1"),
		);
		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe("verification.notAssignee");
	});

	it("returns 400 for an unknown action", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "submitted",
					submittedAt: NOW.toISOString(),
				},
			],
		});
		authAs(payload, MOD);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", { action: "teleport" }),
			idParams("vr-1"),
		);
		expect(response.status).toBe(400);
		expect((await response.json()).code).toBe("generic.badRequest");
	});

	it("refuses force:true from a non-admin", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "in_review",
					assignee: "m-1",
					claimedAt: NOW.toISOString(),
					submittedAt: NOW.toISOString(),
				},
			],
		});
		authAs(payload, MOD2);
		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", { action: "claim", force: true }),
			idParams("vr-1"),
		);
		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe("moderation.forbidden");
	});

	it("keeps working while the feature flag is off", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "submitted",
					submittedAt: NOW.toISOString(),
				},
			],
			enabled: false,
		});
		authAs(payload, MOD);
		const findGlobal = vi.spyOn(payload, "findGlobal");

		const { POST } = await import(DETAIL_ROUTE);
		const response = await POST(
			detailPostRequest("vr-1", { action: "claim" }),
			idParams("vr-1"),
		);

		expect(response.status).toBe(200);
		expect(findGlobal).not.toHaveBeenCalled();
	});
});

describe("moderation/summary", () => {
	it("counts submitted requests plus claims idle for 48 hours, and adds them to the total", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "submitted",
					submittedAt: NOW.toISOString(),
				},
				{
					id: "vr-2",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "submitted",
					submittedAt: NOW.toISOString(),
				},
				{
					id: "vr-3",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "in_review",
					assignee: "m-1",
					claimedAt: new Date(NOW.getTime() - 49 * 3_600_000).toISOString(),
					submittedAt: NOW.toISOString(),
				},
				{
					id: "vr-4",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "in_review",
					assignee: "m-2",
					claimedAt: new Date(NOW.getTime() - 1 * 3_600_000).toISOString(),
					submittedAt: NOW.toISOString(),
				},
			],
		});
		authAs(payload, MOD);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);

		const { GET } = await import(SUMMARY_ROUTE);
		const body = await (
			await GET(new Request("http://x/api/moderation/summary"))
		).json();

		expect(body).toMatchObject({ pendingVerifications: 3 });
		expect(body.total).toBe(
			body.pendingListings + body.pendingReports + body.pendingVerifications,
		);
		vi.useRealTimers();
	});
});
