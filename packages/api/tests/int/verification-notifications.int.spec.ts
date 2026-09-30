// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type NotificationPayloadValue = string | number | boolean | null | undefined;

/** Mirrors `hooks/notificationEvents.ts`'s own (unexported) `TriggerPayload`. */
type TriggerCall = {
	event: string;
	subscriberId: string;
	payload: Record<string, NotificationPayloadValue>;
};

// `vi.hoisted` guarantees this runs before the mock factory below, which
// vitest hoists above every import; a plain top-level `const` here would be
// a TDZ reference error at that point.
const { triggerNotificationEvent } = vi.hoisted(() => ({
	triggerNotificationEvent: vi.fn(async (_args: TriggerCall) => undefined),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent,
}));

import { purgeVerificationData } from "../../src/jobs/purgeVerificationData";
import { CAPABILITY_UNLOCKS } from "../../src/lib/shopCapabilities";
import { WORKFLOWS } from "../../src/scripts/syncNotificationWorkflows";
import { __resetShopLevelListeners } from "../../src/services/shops";
import {
	approveRequest,
	rejectRequest,
	requestInfo,
	revokeRequest,
} from "../../src/services/verification";
import { fakePayload } from "./helpers/fakePayload";

const OWNER = { id: "u-1", role: "user", name: "Aïcha Mbappe" };
const MOD = { id: "m-1", role: "moderator", name: "Grâce" };
const NOW = new Date("2026-10-01T00:00:00.000Z");

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

// Never fed to a notify function on purpose: it stands in for whatever a
// reviewer typed in a `note`/`internalNote`, and for the raw evidence a KYC
// vendor returns. Both are pinned by these tests as things a payload must
// never carry, whatever value they hold.
const REVIEWER_SECRET = "internal-only-reviewer-note-9f31";
const SENSITIVE_KYC = {
	provider: "didit",
	sessionRef: "sess-1",
	status: "approved",
	documentType: "national_id",
	documentCountry: "CM",
	documentNumberHash: "documentNumber-hash-abc123",
	documentNumberLast4: "1234",
	documentExpiresAt: "2030-01-01T00:00:00.000Z",
	givenNames: "Jean",
	familyName: "Dupont",
	adult: true,
	livenessPassed: true,
	faceMatchScore: 97,
	vendorWarnings: { flag: "none" },
	vendorReviewUrl:
		"https://vendor.example/review/abc123?sha256=deadbeef&filename=id.jpg&dateOfBirth=1990-01-01",
	vendorDataDeletedAt: null,
};
const SENSITIVE_BUSINESS = {
	businessType: "company",
	legalName: "Akwa SARL",
	tradeName: "Akwa",
	rccmNumber: "RC/DLA/2020/B/1234",
	entreprenantDeclarationNumber: null,
	niu: "M012345678901X",
	registeredAddress: "123 Rue Principale",
	city: "Douala",
	legalRepresentativeName: "Jean Dupont",
	legalRepresentativeIsOwner: true,
};
const FULL_CHECKLIST = {
	name_matches_registry: true,
	registration_number_matches_document: true,
	niu_matches_certificate: true,
	representative_matches_identity_or_mandate: true,
	documents_legible_and_current: true,
};

function seed(requests: Record<string, unknown>[]) {
	return fakePayload(
		{
			users: [{ ...OWNER }, { ...MOD }],
			shops: [
				{
					id: "s-1",
					handle: "akwa",
					name: "Akwa Shop",
					owner: "u-1",
					status: "active",
					level: 1,
				},
			],
			"shop-members": [],
			"verification-requests": requests,
			"verification-document-views": [],
			"moderation-log": [],
		},
		{ globals: { "app-settings": { verification: AUTHORISED } } },
	);
}

const inReviewL2 = () =>
	seed([
		{
			id: "vr-1",
			shop: "s-1",
			submittedBy: "u-1",
			requestedLevel: 2,
			status: "in_review",
			openKey: null,
			assignee: "m-1",
			claimedAt: "2026-09-20T00:00:00.000Z",
			kyc: SENSITIVE_KYC,
			infoRequests: [],
		},
	]);

const inReviewL3 = () =>
	seed([
		{
			id: "vr-3",
			shop: "s-1",
			submittedBy: "u-1",
			requestedLevel: 3,
			status: "in_review",
			openKey: null,
			assignee: "m-1",
			claimedAt: "2026-09-20T00:00:00.000Z",
			kyc: SENSITIVE_KYC,
			business: SENSITIVE_BUSINESS,
		},
	]);

const approvedL2 = () =>
	seed([
		{
			id: "vr-2",
			shop: "s-1",
			submittedBy: "u-1",
			requestedLevel: 2,
			status: "approved",
			openKey: null,
			approvedAt: "2026-09-01T00:00:00.000Z",
			expiresAt: "2028-09-01T00:00:00.000Z",
			kyc: SENSITIVE_KYC,
		},
	]);

function expiringShop(daysUntil: number) {
	const levelExpiresAt = new Date(
		NOW.getTime() + daysUntil * 86_400_000,
	).toISOString();
	return fakePayload({
		users: [{ ...OWNER }],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa Shop",
				owner: "u-1",
				status: "active",
				level: 2,
				levelExpiresAt,
				notifiedExpiryDays: null,
			},
		],
		"verification-requests": [],
		"verification-document-views": [],
		"moderation-log": [],
	});
}

beforeEach(() => {
	triggerNotificationEvent.mockClear();
	__resetShopLevelListeners();
});

describe("verification notifications", () => {
	it("needs_info sends exactly shopName, reasonCode and message", async () => {
		await requestInfo(inReviewL2(), MOD, "vr-1", {
			reasonCode: "document_unclear",
			message: "Merci de renvoyer une photo plus nette.",
		});
		const [call] = triggerNotificationEvent.mock.calls.at(-1) ?? [];
		expect(call?.event).toBe("verification-needs-info");
		expect(call?.subscriberId).toBe("u-1");
		expect(call?.payload).toEqual({
			shopName: "Akwa Shop",
			reasonCode: "document_unclear",
			message: "Merci de renvoyer une photo plus nette.",
		});
	});

	it("rejected sends exactly shopName, reasonCode, sellerMessage and cooldownUntil", async () => {
		await rejectRequest(inReviewL2(), MOD, "vr-1", {
			reasonCode: "fraud_suspected",
			sellerMessage: "Nous n'avons pas pu confirmer votre document.",
			note: REVIEWER_SECRET,
		});
		const [call] = triggerNotificationEvent.mock.calls.at(-1) ?? [];
		expect(call?.event).toBe("verification-rejected");
		const payload = call?.payload ?? {};
		expect(Object.keys(payload).sort()).toEqual(
			["shopName", "reasonCode", "sellerMessage", "cooldownUntil"].sort(),
		);
		expect(payload.shopName).toBe("Akwa Shop");
		expect(payload.reasonCode).toBe("fraud_suspected");
		expect(payload.sellerMessage).toBe(
			"Nous n'avons pas pu confirmer votre document.",
		);
		const cooldown = Date.parse(String(payload.cooldownUntil));
		const sevenDaysFromNow = Date.now() + 7 * 86_400_000;
		expect(Math.abs(cooldown - sevenDaysFromNow)).toBeLessThan(5_000);
	});

	it("approved (level 2) sends exactly shopName, level and unlocks", async () => {
		await approveRequest(inReviewL2(), MOD, "vr-1", { note: REVIEWER_SECRET });
		const [call] = triggerNotificationEvent.mock.calls.at(-1) ?? [];
		expect(call?.event).toBe("verification-approved");
		expect(call?.payload).toEqual({
			shopName: "Akwa Shop",
			level: 2,
			unlocks: CAPABILITY_UNLOCKS[2].join(", "),
		});
	});

	it("approved (level 3) sends exactly shopName, level and unlocks, no business data", async () => {
		await approveRequest(inReviewL3(), MOD, "vr-3", {
			note: REVIEWER_SECRET,
			checklist: FULL_CHECKLIST,
		});
		const [call] = triggerNotificationEvent.mock.calls.at(-1) ?? [];
		expect(call?.event).toBe("verification-approved");
		expect(call?.payload).toEqual({
			shopName: "Akwa Shop",
			level: 3,
			unlocks: CAPABILITY_UNLOCKS[3].join(", "),
		});
	});

	it("revoked sends exactly shopName and reasonCode", async () => {
		await revokeRequest(approvedL2(), MOD, "vr-2", {
			reasonCode: "fraud_suspected",
			note: REVIEWER_SECRET,
		});
		const [call] = triggerNotificationEvent.mock.calls.at(-1) ?? [];
		expect(call?.event).toBe("verification-revoked");
		expect(call?.payload).toEqual({
			shopName: "Akwa Shop",
			reasonCode: "fraud_suspected",
		});
	});

	it("expiring sends exactly shopName and daysUntil", async () => {
		await purgeVerificationData(expiringShop(30), NOW);
		const [call] = triggerNotificationEvent.mock.calls.at(-1) ?? [];
		expect(call?.event).toBe("verification-expiring");
		expect(call?.payload).toEqual({ shopName: "Akwa Shop", daysUntil: 30 });
	});

	it("carries no document data, reviewer notes or vendor payloads in any of the five payloads", async () => {
		await requestInfo(inReviewL2(), MOD, "vr-1", {
			reasonCode: "document_unclear",
			message: "Merci de renvoyer une photo plus nette.",
		});
		await rejectRequest(inReviewL2(), MOD, "vr-1", {
			reasonCode: "fraud_suspected",
			sellerMessage: "Nous n'avons pas pu confirmer votre document.",
			note: REVIEWER_SECRET,
		});
		await approveRequest(inReviewL2(), MOD, "vr-1", { note: REVIEWER_SECRET });
		await approveRequest(inReviewL3(), MOD, "vr-3", {
			note: REVIEWER_SECRET,
			checklist: FULL_CHECKLIST,
		});
		await revokeRequest(approvedL2(), MOD, "vr-2", {
			reasonCode: "fraud_suspected",
			note: REVIEWER_SECRET,
		});
		await purgeVerificationData(expiringShop(7), NOW);

		const triggers = triggerNotificationEvent.mock.calls.map(([args]) => args);
		expect(triggers).toHaveLength(6);

		const forbidden = [
			"documentNumber",
			"sha256",
			"filename",
			"dateOfBirth",
			"faceMatchScore",
			"vendorReviewUrl",
			REVIEWER_SECRET,
		];
		for (const trigger of triggers) {
			const body = JSON.stringify(trigger.payload);
			for (const marker of forbidden) {
				expect(body).not.toContain(marker);
			}
		}
	});

	it("fires only once the decision transaction commits", async () => {
		const payload = inReviewL2();
		await requestInfo(payload, MOD, "vr-1", {
			reasonCode: "document_unclear",
			message: "Merci de renvoyer une photo plus nette.",
		});
		expect(
			payload.store["verification-requests"].find((r) => r.id === "vr-1")
				?.status,
		).toBe("needs_info");
		expect(triggerNotificationEvent).toHaveBeenCalledTimes(1);
	});

	it("never fires when the commit itself fails, even though the body already ran", async () => {
		// A queued (`onCommit`) trigger must wait for a real commit; one called
		// inline from inside the body would already have fired by the time the
		// commit below throws, which is exactly the regression this pins.
		const payload = inReviewL2();
		payload.db.commitTransaction = async () => {
			throw new Error("commit failed");
		};
		await expect(
			requestInfo(payload, MOD, "vr-1", {
				reasonCode: "document_unclear",
				message: "Merci de renvoyer une photo plus nette.",
			}),
		).rejects.toThrow("commit failed");
		expect(triggerNotificationEvent).not.toHaveBeenCalled();
	});

	it("never fires, and leaves nothing half-applied, when the transaction rolls back", async () => {
		const payload = inReviewL2();
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "moderation-log";
		await expect(
			requestInfo(payload, MOD, "vr-1", {
				reasonCode: "document_unclear",
				message: "Merci de renvoyer une photo plus nette.",
			}),
		).rejects.toThrow();
		expect(triggerNotificationEvent).not.toHaveBeenCalled();
		expect(
			payload.store["verification-requests"].find((r) => r.id === "vr-1")
				?.status,
		).toBe("in_review");
		expect(payload.store["moderation-log"]).toHaveLength(0);
	});

	it("does not take down the decision, or half-apply it, when the notifier throws", async () => {
		triggerNotificationEvent.mockImplementationOnce(async () => {
			throw new Error("novu is down");
		});
		const payload = inReviewL2();
		const result = await requestInfo(payload, MOD, "vr-1", {
			reasonCode: "document_unclear",
			message: "Merci de renvoyer une photo plus nette.",
		});
		expect(result.status).toBe("needs_info");
		expect(
			payload.store["verification-requests"].find((r) => r.id === "vr-1")
				?.status,
		).toBe("needs_info");
		expect(payload.store["moderation-log"]).toHaveLength(1);
	});
});

describe("syncNotificationWorkflows", () => {
	it("declares the five verification workflows on in-app, push and email", () => {
		for (const id of [
			"verification-needs-info",
			"verification-approved",
			"verification-rejected",
			"verification-revoked",
			"verification-expiring",
		]) {
			const workflow = WORKFLOWS.find((w) => w.workflowId === id);
			expect(workflow?.steps.map((s) => s.type).sort()).toEqual([
				"email",
				"in_app",
				"push",
			]);
		}
	});

	it("keeps user-verified defined for one release so stale in-app tags resolve", () => {
		expect(WORKFLOWS.some((w) => w.workflowId === "user-verified")).toBe(true);
	});
});
