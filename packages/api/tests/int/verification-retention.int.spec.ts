import { afterEach, describe, expect, it, vi } from "vitest";
import { purgeVerificationData } from "../../src/jobs/purgeVerificationData";
import {
	documentPurgeDueAt,
	RETENTION,
} from "../../src/lib/verificationRetention";
import { fakePayload } from "./helpers/fakePayload";

process.env.DIDIT_API_KEY = "key-test";
process.env.DIDIT_WORKFLOW_ID = "wf-1";

const NOW = new Date("2027-01-01T00:00:00.000Z");
const days = (n: number) =>
	new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("retention periods", () => {
	it("declares the periods the processing register names", () => {
		expect(RETENTION).toMatchObject({
			documentsAfterTerminalDays: 90,
			documentsAfterFraudRevocationDays: 365,
			requestRowYears: 5,
			documentViewYears: 3,
			vendorDeletionAfterDecisionDays: 30,
			hashesAfterAccountDeletionDays: 365,
		});
	});

	it("keeps an approved request's files until it leaves approved", () => {
		expect(
			documentPurgeDueAt({ status: "approved", updatedAt: days(400) }, NOW),
		).toBeNull();
	});

	it("purges 90 days after an ordinary terminal status", () => {
		expect(
			documentPurgeDueAt(
				{ status: "rejected", updatedAt: days(91) },
				NOW,
			)?.getTime(),
		).toBeLessThanOrEqual(NOW.getTime());
		expect(
			documentPurgeDueAt(
				{ status: "rejected", updatedAt: days(89) },
				NOW,
			)?.getTime(),
		).toBeGreaterThan(NOW.getTime());
	});

	it("keeps a fraud revocation's files for a year", () => {
		const fraud = {
			status: "revoked",
			updatedAt: days(100),
			decision: { reasonCode: "fraud" },
		};
		expect(documentPurgeDueAt(fraud, NOW)!.getTime()).toBeGreaterThan(
			NOW.getTime(),
		);
		expect(
			documentPurgeDueAt({ ...fraud, updatedAt: days(366) }, NOW)!.getTime(),
		).toBeLessThanOrEqual(NOW.getTime());
		expect(
			documentPurgeDueAt(
				{ ...fraud, decision: { reasonCode: "document_forged" } },
				NOW,
			)!.getTime(),
		).toBeGreaterThan(NOW.getTime());
	});
});

describe("purgeVerificationData", () => {
	function seed(over: Record<string, unknown[]> = {}) {
		return fakePayload({
			users: [{ id: "u-1", role: "user", name: "Aïcha" }],
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					owner: "u-1",
					status: "active",
					level: 2,
					levelExpiresAt: days(-20),
				},
			],
			"verification-requests": over["verification-requests"] ?? [],
			"verification-documents": over["verification-documents"] ?? [],
			"verification-document-views": over["verification-document-views"] ?? [],
			"moderation-log": [],
		});
	}

	it("deletes the file and keeps the row with purgedAt", async () => {
		const payload = seed({
			"verification-requests": [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "rejected",
					updatedAt: days(91),
				},
			],
			"verification-documents": [
				{
					id: "vd-1",
					request: "vr-1",
					shop: "s-1",
					kind: "rccm_extract",
					filename: "a.pdf",
					sha256: "h",
				},
			],
		});
		const report = await purgeVerificationData(payload, NOW);
		expect(report.filesPurged).toEqual(["vd-1"]);
		const doc = payload.store["verification-documents"][0];
		expect(doc).toMatchObject({ filename: null });
		expect(doc.purgedAt).toBeTruthy();
		expect(doc.sha256).toBe("h");
	});

	it("does not purge twice", async () => {
		const payload = seed({
			"verification-requests": [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "rejected",
					updatedAt: days(91),
				},
			],
			"verification-documents": [
				{
					id: "vd-1",
					request: "vr-1",
					shop: "s-1",
					filename: null,
					purgedAt: days(5),
				},
			],
		});
		expect((await purgeVerificationData(payload, NOW)).filesPurged).toEqual([]);
	});

	it("strips the names and the business block five years after a terminal status", async () => {
		const payload = seed({
			"verification-requests": [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "rejected",
					updatedAt: days(5 * 365 + 1),
					kyc: {
						givenNames: "Aicha",
						familyName: "Mbappe",
						documentNumberHash: "h",
					},
					business: { legalName: "AKWA SARL" },
					decision: { sellerMessage: "…", internalNote: "…" },
				},
			],
		});
		await purgeVerificationData(payload, NOW);
		const request = payload.store["verification-requests"][0];
		expect(request.kyc).toMatchObject({
			givenNames: null,
			familyName: null,
			documentNumberHash: null,
		});
		expect(request.business).toBeNull();
		expect(request.decision).toMatchObject({
			sellerMessage: null,
			internalNote: null,
		});
	});

	/**
	 * `processKycEvent` and `startKycSession` are the direct callers of
	 * `getKycProvider`, evaluated statically at import time — the same
	 * reason `vi.doMock` from inside an `it()` cannot reach them applies
	 * here to `purgeVerificationData`. The vendor is faked at `fetch`
	 * instead, through the real `didit` adapter (see `kyc-event.int.spec.ts`
	 * for the same pattern applied to `createSession`/`fetchResult`).
	 */
	function mockDeleteEndpoint(
		respond: () => Response = () => new Response(null, { status: 204 }),
	) {
		const fetchMock = vi.fn(
			async (_url: string, init?: { method?: string }) => {
				if ((init?.method ?? "GET").toUpperCase() === "DELETE")
					return respond();
				return new Response("{}", { status: 200 });
			},
		);
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("asks the vendor to delete 30 days after the decision and records it", async () => {
		const fetchMock = mockDeleteEndpoint();
		const payload = seed({
			"verification-requests": [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "approved",
					kyc: {
						provider: "didit",
						sessionRef: "sess-1",
						decidedAt: days(31),
						vendorDataDeletedAt: null,
					},
				},
			],
		});
		const report = await purgeVerificationData(payload, NOW);
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("sess-1"),
			expect.objectContaining({ method: "DELETE" }),
		);
		expect(report.vendorDeleted).toEqual(["vr-1"]);
		expect(
			payload.store["verification-requests"][0].kyc.vendorDataDeletedAt,
		).toBeTruthy();
	});

	it("retries a failing vendor deletion on the next run instead of giving up", async () => {
		let calls = 0;
		mockDeleteEndpoint(() => {
			calls += 1;
			return calls === 1
				? new Response("error", { status: 502 })
				: new Response(null, { status: 204 });
		});
		const payload = seed({
			"verification-requests": [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "approved",
					kyc: {
						provider: "didit",
						sessionRef: "sess-1",
						decidedAt: days(31),
						vendorDataDeletedAt: null,
					},
				},
			],
		});
		expect((await purgeVerificationData(payload, NOW)).vendorRetried).toEqual([
			"vr-1",
		]);
		expect(
			payload.store["verification-requests"][0].kyc.vendorDataDeletedAt,
		).toBeFalsy();
		expect((await purgeVerificationData(payload, NOW)).vendorDeleted).toEqual([
			"vr-1",
		]);
	});

	it("deletes view rows older than three years", async () => {
		const payload = seed({
			"verification-document-views": [
				{ id: "vv-1", createdAt: days(3 * 365 + 1) },
				{ id: "vv-2", createdAt: days(10) },
			],
		});
		expect((await purgeVerificationData(payload, NOW)).viewsDeleted).toBe(1);
		expect(
			payload.store["verification-document-views"].map((v) => v.id),
		).toEqual(["vv-2"]);
	});

	it("expires a lapsed approval and drops the shop's level", async () => {
		const payload = seed({
			"verification-requests": [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "approved",
					expiresAt: days(1),
					openKey: null,
				},
			],
		});
		await purgeVerificationData(payload, NOW);
		expect(payload.store["verification-requests"][0].status).toBe("expired");
		expect(payload.store.shops[0].level).toBe(1);
	});

	it("expires a draft idle for 30 days and a needs_info unanswered for 30 days", async () => {
		const payload = seed({
			"verification-requests": [
				{
					id: "vr-d",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "draft",
					openKey: "s-1:3",
					updatedAt: days(31),
				},
				{
					id: "vr-n",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 2,
					status: "needs_info",
					openKey: "s-1:2",
					updatedAt: days(31),
				},
			],
		});
		await purgeVerificationData(payload, NOW);
		expect(payload.store["verification-requests"].map((r) => r.status)).toEqual(
			["expired", "expired"],
		);
	});

	it("releases a claim idle for 48 hours back to the queue", async () => {
		const payload = seed({
			"verification-requests": [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "in_review",
					openKey: "s-1:3",
					assignee: "m-1",
					claimedAt: days(3),
				},
			],
		});
		await purgeVerificationData(payload, NOW);
		expect(payload.store["verification-requests"][0]).toMatchObject({
			status: "submitted",
			assignee: null,
		});
		expect(payload.store["moderation-log"].at(-1)).toMatchObject({
			action: "verification.release",
			actorRole: "system",
		});
	});

	it("names the shops whose level expires in 30 or 7 days, once each", async () => {
		const payload = seed();
		payload.store.shops[0].levelExpiresAt = new Date(
			NOW.getTime() + 30 * 86_400_000,
		).toISOString();
		expect(
			(await purgeVerificationData(payload, NOW)).expiringNotified,
		).toEqual(["s-1"]);
		expect(
			(await purgeVerificationData(payload, NOW)).expiringNotified,
		).toEqual([]);
	});
});
