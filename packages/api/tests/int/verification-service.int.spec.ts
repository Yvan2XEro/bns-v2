import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetShopLevelListeners } from "../../src/services/shops";
import {
	approveRequest,
	claimRequest,
	cooldownUntil,
	expireRequest,
	expiryFor,
	openRequest,
	rejectRequest,
	releaseRequest,
	requestInfo,
	revokeRequest,
	startKycSession,
	submitRequest,
} from "../../src/services/verification";
import { fakePayload } from "./helpers/fakePayload";

// `startKycSession` calls the real Didit adapter (`lib/kyc/didit.ts`), so
// the vendor is faked at the HTTP boundary the same way `kyc-didit.int.spec.ts`
// pins the adapter itself.
process.env.DIDIT_API_KEY = "key-test";
process.env.DIDIT_WORKFLOW_ID = "wf-1";
process.env.PUBLIC_WEB_URL = "https://buynsellem.com";

const OWNER = { id: "u-1", role: "user", name: "Aïcha Mbappe" };
const MOD = { id: "m-1", role: "moderator", name: "Grâce" };
const MOD2 = { id: "m-2", role: "moderator", name: "Colleague" };
const ADMIN = { id: "a-1", role: "admin", name: "Boss" };

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

function seed(
	over: {
		requests?: Record<string, unknown>[];
		settings?: Record<string, unknown>;
	} = {},
) {
	return fakePayload(
		{
			users: [OWNER, MOD, MOD2, ADMIN].map((u) => ({ ...u })),
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					name: "Akwa",
					owner: "u-1",
					status: "active",
					level: 1,
				},
				{
					id: "s-m",
					handle: "modshop",
					name: "Mod",
					owner: "m-1",
					status: "active",
					level: 1,
				},
			],
			"shop-members": [{ id: "sm-1", shop: "s-1", user: "u-1", role: "owner" }],
			"verification-requests": over.requests ?? [],
			"verification-documents": [],
			"moderation-log": [],
		},
		{
			globals: {
				"app-settings": { verification: over.settings ?? AUTHORISED },
			},
		},
	);
}

const requests = (p: ReturnType<typeof seed>) =>
	p.store["verification-requests"];
const log = (p: ReturnType<typeof seed>) => p.store["moderation-log"];
const shop = (p: ReturnType<typeof seed>) =>
	p.store.shops.find((s) => s.id === "s-1");

const approvedL2 = (over: Record<string, unknown> = {}) => ({
	id: "vr-2",
	shop: "s-1",
	submittedBy: "u-1",
	requestedLevel: 2,
	status: "approved",
	openKey: null,
	approvedAt: "2026-09-01T00:00:00.000Z",
	expiresAt: "2028-09-01T00:00:00.000Z",
	...over,
});

beforeEach(() => {
	__resetShopLevelListeners();
});

describe("expiryFor", () => {
	const approvedAt = new Date("2026-10-01T00:00:00.000Z");

	it("gives level 2 two years, or the document's own expiry when that is sooner", () => {
		expect(expiryFor(2, approvedAt).toISOString()).toBe(
			"2028-10-01T00:00:00.000Z",
		);
		expect(
			expiryFor(
				2,
				approvedAt,
				new Date("2027-01-01T00:00:00.000Z"),
			).toISOString(),
		).toBe("2027-01-01T00:00:00.000Z");
	});

	it("keeps an already-expired document from granting anything", () => {
		const past = new Date("2026-01-01T00:00:00.000Z");
		expect(expiryFor(2, approvedAt, past).getTime()).toBeLessThan(
			approvedAt.getTime(),
		);
	});

	it("gives level 3 two years and ignores any document expiry", () => {
		expect(
			expiryFor(
				3,
				approvedAt,
				new Date("2027-01-01T00:00:00.000Z"),
			).toISOString(),
		).toBe("2028-10-01T00:00:00.000Z");
	});
});

describe("cooldownUntil", () => {
	it("is 24 hours after an ordinary rejection and 7 days after a fraud one", () => {
		const decidedAt = "2026-10-01T00:00:00.000Z";
		expect(
			cooldownUntil({
				decidedAt,
				reasonCode: "document_invalid",
			})?.toISOString(),
		).toBe("2026-10-02T00:00:00.000Z");
		expect(
			cooldownUntil({
				decidedAt,
				reasonCode: "fraud_suspected",
			})?.toISOString(),
		).toBe("2026-10-08T00:00:00.000Z");
		expect(cooldownUntil(null)).toBeNull();
	});
});

describe("openRequest", () => {
	it("creates a draft with an openKey and no log entry", async () => {
		const payload = seed();
		const request = await openRequest(payload, OWNER, "s-1", 2);
		expect(request).toMatchObject({
			status: "draft",
			requestedLevel: 2,
			openKey: "s-1:2",
			submittedBy: "u-1",
		});
		expect(log(payload)).toHaveLength(0);
	});

	it("returns the existing open request instead of a second one", async () => {
		const payload = seed();
		const first = await openRequest(payload, OWNER, "s-1", 2);
		expect(await openRequest(payload, OWNER, "s-1", 2)).toMatchObject({
			id: first.id,
		});
		expect(requests(payload)).toHaveLength(1);
	});

	it("refuses anyone but the owner", async () => {
		await expect(
			openRequest(seed(), { id: "m-1", role: "moderator" }, "s-1", 2),
		).rejects.toMatchObject({ code: "verification.notOwner", status: 403 });
	});

	it("refuses level 3 before level 2 is effective", async () => {
		await expect(openRequest(seed(), OWNER, "s-1", 3)).rejects.toMatchObject({
			code: "verification.levelNotEligible",
			status: 409,
		});
	});

	it("allows level 3 once level 2 is effective", async () => {
		const payload = seed({ requests: [approvedL2()] });
		shop(payload)!.level = 2;
		shop(payload)!.levelExpiresAt = "2028-09-01T00:00:00.000Z";
		await expect(openRequest(payload, OWNER, "s-1", 3)).resolves.toMatchObject({
			requestedLevel: 3,
		});
	});

	it("refuses during the cooldown after a rejection", async () => {
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
		await expect(openRequest(payload, OWNER, "s-1", 2)).rejects.toMatchObject({
			code: "verification.cooldown",
			status: 429,
		});
	});

	it("refuses when the feature is off", async () => {
		const payload = seed({ settings: { ...AUTHORISED, enabled: false } });
		await expect(openRequest(payload, OWNER, "s-1", 2)).rejects.toMatchObject({
			code: "verification.disabled",
			status: 403,
		});
	});

	it("refuses when the shop is not active", async () => {
		const payload = seed();
		shop(payload)!.status = "suspended";
		await expect(openRequest(payload, OWNER, "s-1", 2)).rejects.toMatchObject({
			code: "shop.inactive",
		});
	});

	it("refuses a suspended owner", async () => {
		const payload = seed();
		const suspendedOwner = {
			...OWNER,
			suspendedAt: "2026-09-01T00:00:00.000Z",
			suspendedUntil: null,
		};
		await expect(
			openRequest(payload, suspendedOwner, "s-1", 2),
		).rejects.toMatchObject({
			status: 403,
			data: { code: "moderation.accountSuspended" },
		});
		expect(requests(payload)).toHaveLength(0);
	});
});

describe("startKycSession", () => {
	const draftL2 = (over: Record<string, unknown> = {}) => ({
		id: "vr-1",
		shop: "s-1",
		submittedBy: "u-1",
		requestedLevel: 2,
		status: "draft",
		openKey: "s-1:2",
		...over,
	});

	const stubDiditCreate = () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						session_id: "sess-1",
						url: "https://verify.didit.me/s/sess-1",
					}),
					{ status: 201 },
				),
		);
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	};

	const callbackOf = (fetchMock: ReturnType<typeof stubDiditCreate>) =>
		JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).callback as string;

	it("sends a web seller to the web return page, with no app marker", async () => {
		const payload = seed({ requests: [draftL2()] });
		const fetchMock = stubDiditCreate();
		await startKycSession(payload, OWNER, "vr-1", {
			consentVersion: "kyc-2026-10-v1",
			locale: "fr",
			platform: "web",
		});
		expect(callbackOf(fetchMock)).toBe(
			"https://buynsellem.com/seller/verification/identity/return?request=vr-1",
		);
		vi.unstubAllGlobals();
	});

	it("adds the app=1 marker for a mobile seller, so the web return page hands off to the app", async () => {
		const payload = seed({ requests: [draftL2()] });
		const fetchMock = stubDiditCreate();
		await startKycSession(payload, OWNER, "vr-1", {
			consentVersion: "kyc-2026-10-v1",
			locale: "fr",
			platform: "mobile",
		});
		expect(callbackOf(fetchMock)).toBe(
			"https://buynsellem.com/seller/verification/identity/return?request=vr-1&app=1",
		);
		vi.unstubAllGlobals();
	});

	it("defaults to the web return page when the caller predates the platform field", async () => {
		const payload = seed({ requests: [draftL2()] });
		const fetchMock = stubDiditCreate();
		await startKycSession(payload, OWNER, "vr-1", {
			consentVersion: "kyc-2026-10-v1",
			locale: "fr",
		});
		expect(callbackOf(fetchMock)).toBe(
			"https://buynsellem.com/seller/verification/identity/return?request=vr-1",
		);
		vi.unstubAllGlobals();
	});

	it("refuses a suspended owner before a vendor session is created (I2)", async () => {
		const payload = seed({ requests: [draftL2()] });
		const fetchMock = stubDiditCreate();
		const suspendedOwner = {
			...OWNER,
			suspendedAt: "2026-09-01T00:00:00.000Z",
			suspendedUntil: null,
		};
		await expect(
			startKycSession(payload, suspendedOwner, "vr-1", {
				consentVersion: "kyc-2026-10-v1",
				locale: "fr",
			}),
		).rejects.toMatchObject({
			status: 403,
			data: { code: "moderation.accountSuspended" },
		});
		expect(fetchMock).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});

describe("claim", () => {
	const submitted = () => [
		{
			id: "vr-1",
			shop: "s-1",
			submittedBy: "u-1",
			requestedLevel: 3,
			status: "submitted",
			openKey: "s-1:3",
			submittedAt: "2026-10-01T00:00:00.000Z",
		},
	];

	it("assigns the reviewer, stamps claimedAt and logs it", async () => {
		const payload = seed({ requests: submitted() });
		await claimRequest(payload, MOD, "vr-1");
		expect(requests(payload)[0]).toMatchObject({
			status: "in_review",
			assignee: "m-1",
		});
		expect(requests(payload)[0].claimedAt).toBeTruthy();
		expect(log(payload).at(-1)).toMatchObject({
			action: "verification.claim",
			targetType: "verification-request",
			targetId: "vr-1",
			actor: "m-1",
		});
	});

	it("lets exactly one of two racing claims win", async () => {
		const payload = seed({ requests: submitted() });
		const results = await Promise.allSettled([
			claimRequest(payload, MOD, "vr-1"),
			claimRequest(payload, MOD2, "vr-1"),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const rejected = results.find(
			(r) => r.status === "rejected",
		) as PromiseRejectedResult;
		expect(rejected.reason).toMatchObject({
			code: "verification.invalidTransition",
			status: 409,
		});
		expect(
			log(payload).filter((e) => e.action === "verification.claim"),
		).toHaveLength(1);
	});

	it("refuses a reviewer who owns the shop", async () => {
		const payload = seed({
			requests: [
				{
					...submitted()[0],
					shop: "s-m",
					submittedBy: "m-1",
					openKey: "s-m:3",
				},
			],
		});
		await expect(claimRequest(payload, MOD, "vr-1")).rejects.toMatchObject({
			code: "verification.conflictOfInterest",
			status: 403,
		});
	});

	it("refuses a reviewer who is a member of the shop", async () => {
		const payload = seed({ requests: submitted() });
		payload.store["shop-members"].push({
			id: "sm-2",
			shop: "s-1",
			user: "m-1",
			role: "staff",
		});
		await expect(claimRequest(payload, MOD, "vr-1")).rejects.toMatchObject({
			code: "verification.conflictOfInterest",
		});
	});

	it("refuses a reviewer who cannot act on the owner, and lets an admin force a takeover", async () => {
		const payload = seed({ requests: submitted() });
		payload.store.users.find((u) => u.id === "u-1")!.role = "admin";
		await expect(claimRequest(payload, MOD, "vr-1")).rejects.toMatchObject({
			code: "moderation.rankTooLow",
			status: 403,
		});

		const payload2 = seed({ requests: submitted() });
		await claimRequest(payload2, MOD, "vr-1");
		await expect(claimRequest(payload2, MOD2, "vr-1")).rejects.toMatchObject({
			code: "verification.invalidTransition",
		});
		await expect(
			claimRequest(payload2, ADMIN, "vr-1", { force: true }),
		).resolves.toMatchObject({ assignee: "a-1" });
	});
});

describe("decisions", () => {
	const claimed = (over: Record<string, unknown> = {}) => [
		{
			id: "vr-1",
			shop: "s-1",
			submittedBy: "u-1",
			requestedLevel: 3,
			status: "in_review",
			openKey: "s-1:3",
			assignee: "m-1",
			claimedAt: "2026-10-01T00:00:00.000Z",
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
			...over,
		},
	];
	const FULL_CHECKLIST = {
		name_matches_registry: true,
		registration_number_matches_document: true,
		niu_matches_certificate: true,
		representative_matches_identity_or_mandate: true,
		documents_legible_and_current: true,
	};

	it("lets only the assignee decide", async () => {
		const payload = seed({ requests: claimed() });
		await expect(
			approveRequest(payload, MOD2, "vr-1", { checklist: FULL_CHECKLIST }),
		).rejects.toMatchObject({ code: "verification.notAssignee", status: 403 });
	});

	it("refuses a level-3 approval with an incomplete checklist", async () => {
		const payload = seed({ requests: claimed() });
		await expect(
			approveRequest(payload, MOD, "vr-1", {
				checklist: { ...FULL_CHECKLIST, niu_matches_certificate: false },
			}),
		).rejects.toMatchObject({
			code: "verification.checklistIncomplete",
			status: 400,
		});
	});

	it("approves level 3, copies the reviewed legal block onto the shop and raises the level", async () => {
		const payload = seed({ requests: [...claimed(), approvedL2()] });
		shop(payload)!.level = 2;
		shop(payload)!.levelExpiresAt = "2028-09-01T00:00:00.000Z";

		await approveRequest(payload, MOD, "vr-1", { checklist: FULL_CHECKLIST });

		expect(requests(payload)[0]).toMatchObject({
			status: "approved",
			openKey: null,
		});
		expect(requests(payload)[0].expiresAt).toBeTruthy();
		expect(shop(payload)).toMatchObject({
			level: 3,
			legal: expect.objectContaining({
				legalName: "AKWA SARL",
				niu: "M012345678901X",
			}),
		});
		expect(shop(payload)!.legal.verifiedAt).toBeTruthy();
		expect(log(payload).at(-1)).toMatchObject({
			action: "verification.approve",
			targetId: "vr-1",
		});
	});

	it("requires a reason and a seller message to reject or ask for more", async () => {
		const payload = seed({ requests: claimed() });
		await expect(
			rejectRequest(payload, MOD, "vr-1", {
				reasonCode: "",
				sellerMessage: "",
			}),
		).rejects.toMatchObject({ code: "moderation.reasonRequired", status: 400 });
		await expect(
			requestInfo(payload, MOD, "vr-1", {
				reasonCode: "document_missing",
				message: "",
			}),
		).rejects.toMatchObject({ code: "moderation.reasonRequired" });
	});

	it("refuses a reject reason code outside REJECT_REASONS (I3)", async () => {
		const payload = seed({ requests: claimed() });
		await expect(
			rejectRequest(payload, MOD, "vr-1", {
				reasonCode: "fraud_suspcted", // typo of "fraud_suspected"
				sellerMessage: "Not you.",
			}),
		).rejects.toMatchObject({ code: "moderation.reasonInvalid", status: 400 });
		expect(requests(payload)[0].status).toBe("in_review");
	});

	it("moves to needs_info, then back to submitted on resubmission, stamping respondedAt", async () => {
		const payload = seed({ requests: claimed() });
		await requestInfo(payload, MOD, "vr-1", {
			reasonCode: "document_missing",
			message: "Send the NIU certificate.",
		});
		expect(requests(payload)[0]).toMatchObject({
			status: "needs_info",
			assignee: null,
		});
		expect(requests(payload)[0].infoRequests).toHaveLength(1);

		await submitRequest(payload, OWNER, "vr-1");
		expect(requests(payload)[0].status).toBe("submitted");
		expect(requests(payload)[0].infoRequests[0].respondedAt).toBeTruthy();
	});

	it("releases a claim back to the queue", async () => {
		const payload = seed({ requests: claimed() });
		await releaseRequest(payload, MOD, "vr-1");
		expect(requests(payload)[0]).toMatchObject({
			status: "submitted",
			assignee: null,
			claimedAt: null,
		});
		expect(log(payload).at(-1)).toMatchObject({
			action: "verification.release",
		});
	});

	it("rolls the status and the level back when the log write fails", async () => {
		const payload = seed({ requests: [...claimed(), approvedL2()] });
		shop(payload)!.level = 2;
		const create = payload.create;
		payload.create = async (args: { collection: string }) => {
			if (args.collection === "moderation-log")
				throw new Error("log unavailable");
			return create(args as never);
		};
		await expect(
			approveRequest(payload, MOD, "vr-1", { checklist: FULL_CHECKLIST }),
		).rejects.toThrow();
		expect(requests(payload)[0].status).toBe("in_review");
		expect(shop(payload)!.level).toBe(2);
	});
});

describe("revoke and expiry cascades", () => {
	it("refuses a revoke reason code outside REVOKE_REASONS (I3)", async () => {
		const payload = seed({ requests: [approvedL2()] });
		await expect(
			revokeRequest(payload, MOD, "vr-2", { reasonCode: "frauud" }),
		).rejects.toMatchObject({ code: "moderation.reasonInvalid", status: 400 });
		expect(requests(payload)[0].status).toBe("approved");
	});

	it("revoking level 2 revokes an approved level 3 and drops the shop to 1", async () => {
		const payload = seed({
			requests: [approvedL2(), approvedL2({ id: "vr-3", requestedLevel: 3 })],
		});
		shop(payload)!.level = 3;
		await revokeRequest(payload, MOD, "vr-2", { reasonCode: "fraud" });

		expect(requests(payload).map((r) => r.status)).toEqual([
			"revoked",
			"revoked",
		]);
		expect(shop(payload)!.level).toBe(1);
		expect(log(payload).at(-1)).toMatchObject({
			action: "verification.revoke",
			metadata: expect.objectContaining({ cascadedRequestIds: ["vr-3"] }),
		});
	});

	it("expiring level 2 leaves an approved level 3 alone but still drops the shop to 1", async () => {
		const payload = seed({
			requests: [approvedL2(), approvedL2({ id: "vr-3", requestedLevel: 3 })],
		});
		shop(payload)!.level = 3;
		await expireRequest(payload, "vr-2", "lapsed");
		expect(requests(payload).map((r) => r.status)).toEqual([
			"expired",
			"approved",
		]);
		expect(shop(payload)!.level).toBe(1);
	});

	it("records a system expiry with no actor", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "draft",
					openKey: "s-1:3",
				},
			],
		});
		await expireRequest(payload, "vr-1", "idle");
		expect(log(payload).at(-1)).toMatchObject({
			action: "verification.expire",
			actorRole: "system",
			actor: null,
			metadata: { cause: "idle" },
		});
	});

	it("marks the old approval superseded when a renewal is approved", async () => {
		const payload = seed({ requests: [approvedL2()] });
		await expireRequest(payload, "vr-2", "superseded", {
			supersededBy: "vr-9",
		});
		expect(requests(payload)[0].status).toBe("expired");
		expect(log(payload).at(-1)).toMatchObject({
			metadata: expect.objectContaining({ supersededBy: "vr-9" }),
		});
	});
});

describe("niu duplicate detection across a case mismatch", () => {
	const FULL_BUSINESS = {
		businessType: "company" as const,
		legalName: "Akwa SARL",
		rccmNumber: "RC/DLA/2020/B/9999",
		registeredAddress: "Akwa",
		city: "Douala",
		legalRepresentativeName: "Jean Mbarga",
		legalRepresentativeIsOwner: true,
	};

	it("still flags a reused niu when one of the two rows was stored lowercase", async () => {
		const payload = seed({
			requests: [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "draft",
					openKey: "s-1:3",
					// Lowercase, as a caller that bypasses the client's own
					// upper-casing (or a row written before the server started
					// upper-casing it) would store it.
					business: { ...FULL_BUSINESS, niu: "m012312345678n" },
				},
				{
					id: "vr-2",
					shop: "s-2",
					submittedBy: "u-2",
					requestedLevel: 3,
					status: "submitted",
					business: {
						...FULL_BUSINESS,
						legalName: "Other SARL",
						// A different registration number: the niu is the only
						// field these two rows share, so the pre-filter query has
						// to be the thing that catches the case mismatch, not an
						// incidental rccm match.
						rccmNumber: "RC/DLA/2020/B/1111",
						niu: "M012312345678N",
					},
				},
			],
		});
		payload.store.shops.push({
			id: "s-2",
			handle: "other",
			name: "Other",
			owner: "u-2",
			status: "active",
			level: 1,
		});
		payload.store.users.push({ id: "u-2", role: "user", name: "Autre" });

		await submitRequest(payload, OWNER, "vr-1");

		const vr1 = requests(payload).find((r) => r.id === "vr-1");
		expect(vr1?.reviewSignals).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "niu_reused" })]),
		);
	});
});
