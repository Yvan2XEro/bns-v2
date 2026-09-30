import { describe, expect, it } from "bun:test";
import {
	badgeLabelKey,
	buildTimeline,
	canOpenRequest,
	formatRenewalWindow,
	LEVEL3_CHECKLIST_ITEMS,
	levelLadder,
	POLL_INTERVAL_MS,
	POLL_TIMEOUT_MS,
	REJECT_REASONS,
	REQUEST_INFO_REASONS,
	REVOKE_REASONS,
	type ShopVerificationResponse,
	shouldKeepPolling,
	statusToneKey,
} from "./verification";

/**
 * `over` is deliberately loose (`Record<string, unknown>`, not
 * `Partial<ShopVerificationResponse>`): several tests below override
 * `requests.level2` with an intentionally-incomplete stand-in for
 * `OwnerVerificationRequest` to exercise one negative path, the same way
 * they cast the call result with `as never`. The trailing cast is what makes
 * a *valid* fixture (no `over`, or a benign one) resolve to the real
 * response type instead of a widened literal, so calls that pass a
 * well-formed fixture typecheck without a cast of their own.
 */
const view = (over: Record<string, unknown> = {}): ShopVerificationResponse =>
	({
		enabled: true,
		capabilities: {
			effectiveLevel: 1,
			badge: "phone",
			codOrders: true,
			protectedPayment: false,
			teamMembers: false,
			maxMembers: 1,
			supplier: false,
			fasterPayouts: false,
			legalInfoVerified: false,
		},
		levelExpiresAt: null,
		consentVersion: "kyc-2026-10-v1",
		requests: { level2: null, level3: null },
		renewableFrom: { level2: null, level3: null },
		nextLevel: {
			level: 2,
			unlocks: ["protectedPayment", "teamMembers"],
			eligible: true,
		},
		cooldownUntil: null,
		...over,
	}) as ShopVerificationResponse;

describe("badgeLabelKey", () => {
	it("names one key per badge and nothing for none", () => {
		expect(badgeLabelKey("phone")).toBe("levelPhone");
		expect(badgeLabelKey("identity")).toBe("levelIdentity");
		expect(badgeLabelKey("business")).toBe("levelBusiness");
		expect(badgeLabelKey(null)).toBeNull();
	});
});

describe("levelLadder", () => {
	it("marks each rung reached, current or locked", () => {
		expect(levelLadder(view().capabilities).map((r) => r.state)).toEqual([
			"current",
			"locked",
			"locked",
		]);
		expect(
			levelLadder({ ...view().capabilities, effectiveLevel: 3 }).map(
				(r) => r.state,
			),
		).toEqual(["reached", "reached", "current"]);
	});
});

describe("canOpenRequest", () => {
	it("refuses while the feature is off, even when everything else is fine", () => {
		expect(canOpenRequest(view({ enabled: false }), 2)).toEqual({
			ok: false,
			reason: "disabled",
		});
	});

	it("refuses level 3 before level 2", () => {
		expect(canOpenRequest(view(), 3)).toEqual({
			ok: false,
			reason: "notEligible",
		});
	});

	it("refuses while a request for that level is open", () => {
		const open = {
			...view(),
			requests: { level2: { status: "submitted" }, level3: null },
		};
		expect(canOpenRequest(open as never, 2)).toEqual({
			ok: false,
			reason: "open",
		});
	});

	it("refuses during a cooldown and says until when", () => {
		const until = new Date(Date.now() + 3_600_000).toISOString();
		expect(canOpenRequest(view({ cooldownUntil: until }), 2)).toEqual({
			ok: false,
			reason: "cooldown",
			until,
		});
	});

	it("allows it otherwise", () => {
		expect(canOpenRequest(view(), 2)).toEqual({ ok: true });
	});

	it("allows a renewal once inside the window, and not before", () => {
		const soon = new Date(Date.now() - 1000).toISOString();
		const later = new Date(Date.now() + 86_400_000).toISOString();
		const approved = {
			status: "approved",
			expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
		};
		expect(
			canOpenRequest(
				view({
					requests: { level2: approved, level3: null },
					renewableFrom: { level2: soon, level3: null },
				}) as never,
				2,
			),
		).toEqual({ ok: true });
		expect(
			canOpenRequest(
				view({
					requests: { level2: approved, level3: null },
					renewableFrom: { level2: later, level3: null },
				}) as never,
				2,
			),
		).toEqual({ ok: false, reason: "notRenewableYet", until: later });
	});
});

describe("statusToneKey", () => {
	it("maps each status to a tone a screen can colour", () => {
		expect(statusToneKey("approved")).toBe("positive");
		expect(statusToneKey("rejected")).toBe("negative");
		expect(statusToneKey("revoked")).toBe("negative");
		expect(statusToneKey("needs_info")).toBe("warning");
		expect(statusToneKey("submitted")).toBe("neutral");
		expect(statusToneKey("in_review")).toBe("neutral");
		expect(statusToneKey("draft")).toBe("neutral");
		expect(statusToneKey("expired")).toBe("neutral");
	});
});

describe("formatRenewalWindow", () => {
	it("returns null when there is nothing to show", () => {
		expect(formatRenewalWindow(view() as never, 2)).toBeNull();
	});

	it("returns the boundary while still in the future, and null once past", () => {
		const later = new Date(Date.now() + 86_400_000).toISOString();
		const soon = new Date(Date.now() - 1000).toISOString();
		expect(
			formatRenewalWindow(
				view({ renewableFrom: { level2: later, level3: null } }) as never,
				2,
			),
		).toBe(later);
		expect(
			formatRenewalWindow(
				view({ renewableFrom: { level2: soon, level3: null } }) as never,
				2,
			),
		).toBeNull();
	});
});

describe("buildTimeline", () => {
	const request = {
		status: "needs_info",
		statusHistory: [
			{ status: "draft", at: "2026-10-01T09:00:00.000Z", source: "seller" },
			{
				status: "submitted",
				at: "2026-10-01T10:00:00.000Z",
				source: "seller",
			},
			{
				status: "in_review",
				at: "2026-10-02T10:00:00.000Z",
				source: "reviewer",
			},
			{
				status: "needs_info",
				at: "2026-10-02T11:00:00.000Z",
				source: "reviewer",
			},
		],
		infoRequests: [
			{
				reasonCode: "document_missing",
				message: "Send the NIU certificate.",
				requestedAt: "2026-10-02T11:00:00.000Z",
				respondedAt: null,
			},
		],
		decision: null,
	};

	it("is newest first and marks the current step", () => {
		const timeline = buildTimeline(request as never);
		expect(timeline[0]).toMatchObject({ status: "needs_info", current: true });
		expect(timeline.at(-1)).toMatchObject({ status: "draft", current: false });
	});

	it("attaches the reviewer's message to the needs_info entry", () => {
		expect(buildTimeline(request as never)[0].message).toBe(
			"Send the NIU certificate.",
		);
	});

	it("attaches the decision message to a rejection", () => {
		const rejected = {
			status: "rejected",
			statusHistory: [
				{
					status: "rejected",
					at: "2026-10-03T10:00:00.000Z",
					source: "reviewer",
				},
			],
			infoRequests: [],
			decision: {
				decidedAt: "2026-10-03T10:00:00.000Z",
				reasonCode: "document_expired",
				sellerMessage: "Your RCCM extract is from 2019.",
			},
		};
		expect(buildTimeline(rejected as never)[0]).toMatchObject({
			status: "rejected",
			reasonCode: "document_expired",
			message: "Your RCCM extract is from 2019.",
		});
	});

	it("hides a vendor step from the seller's timeline", () => {
		const withVendor = {
			...request,
			statusHistory: [
				...request.statusHistory,
				{
					status: "submitted",
					at: "2026-10-01T10:00:00.000Z",
					source: "vendor",
				},
			],
		};
		expect(
			buildTimeline(withVendor as never).some((e) => e.source === "vendor"),
		).toBe(false);
	});

	it("is empty, not undefined, for a request with no history", () => {
		expect(
			buildTimeline({
				status: "draft",
				statusHistory: [],
				infoRequests: [],
				decision: null,
			} as never),
		).toEqual([]);
	});
});

describe("shouldKeepPolling", () => {
	const pending = (status: string) =>
		({ requests: { level2: { status }, level3: null } }) as never;

	it("polls every 3 seconds for at most 2 minutes", () => {
		expect(POLL_INTERVAL_MS).toBe(3000);
		expect(POLL_TIMEOUT_MS).toBe(120_000);
	});

	it("keeps polling while the request is still with the vendor", () => {
		expect(shouldKeepPolling(pending("draft"), 2, 0)).toBe(true);
		expect(shouldKeepPolling(pending("submitted"), 2, 0)).toBe(true);
	});

	it("stops once the request has an answer", () => {
		for (const status of [
			"approved",
			"rejected",
			"needs_info",
			"in_review",
			"revoked",
			"expired",
		]) {
			expect(shouldKeepPolling(pending(status), 2, 0)).toBe(false);
		}
	});

	it("stops at the timeout even when nothing has changed", () => {
		expect(shouldKeepPolling(pending("draft"), 2, POLL_TIMEOUT_MS)).toBe(false);
	});

	it("stops when there is no request at all", () => {
		expect(
			shouldKeepPolling(
				{ requests: { level2: null, level3: null } } as never,
				2,
				0,
			),
		).toBe(false);
	});
});

// These four lists are mirrored from
// `packages/api/src/collections/VerificationRequests.ts` rather than imported,
// because importing across the package boundary drags a Payload collection
// into the web type-check. Pinning the exact values is what makes the copy
// safe: a reason code that drifts from the server's list would otherwise only
// surface as a refused decision in production.
describe("reason lists mirrored from the API", () => {
	it("keeps the request-info reasons the API accepts", () => {
		expect(REQUEST_INFO_REASONS).toEqual([
			"document_unreadable",
			"document_missing",
			"information_inconsistent",
			"kyc_retry",
			"other",
		]);
	});

	it("keeps the rejection reasons the API accepts", () => {
		expect(REJECT_REASONS).toEqual([
			"document_invalid",
			"document_expired",
			"identity_mismatch",
			"liveness_failed",
			"business_mismatch",
			"duplicate_identity",
			"fraud_suspected",
			"other",
		]);
	});

	it("keeps the revocation reasons the API accepts", () => {
		expect(REVOKE_REASONS).toEqual([
			"fraud",
			"document_forged",
			"business_closed",
			"identity_reused",
			"other",
		]);
	});

	it("keeps the five level-3 checklist items", () => {
		expect(LEVEL3_CHECKLIST_ITEMS).toEqual([
			"name_matches_registry",
			"registration_number_matches_document",
			"niu_matches_certificate",
			"representative_matches_identity_or_mandate",
			"documents_legible_and_current",
		]);
	});
});
