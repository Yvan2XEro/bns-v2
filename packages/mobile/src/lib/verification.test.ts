import { describe, expect, test } from "bun:test";
import type {
	OwnerVerificationRequest,
	PublicShop,
	ShopCapabilities,
	ShopVerificationResponse,
	VerificationReviewerViewer,
	VerificationStatus,
} from "../types/api";
import {
	availableActions,
	type BusinessValues,
	badgeForLevel,
	badgeLabelKey,
	buildTimeline,
	CHECKLIST_ITEMS,
	type ChecklistItem,
	canOpenRequest,
	canSubmit,
	checklistComplete,
	levelLadder,
	missingKinds,
	POLL_INTERVAL_MS,
	POLL_TIMEOUT_MS,
	publicShopBadge,
	requiredKinds,
	shouldKeepPolling,
	statusToneKey,
} from "./verification";

/**
 * Same cases as `packages/web/src/lib/verification.test.ts` and its
 * `verification-business.test.ts` / `verification-decision.test.ts` siblings
 * (Tasks 20–23) — the two suites assert the same table, so a divergence
 * between the two clients fails a test rather than shipping.
 */

function baseCapabilities(
	overrides: Partial<ShopCapabilities> = {},
): ShopCapabilities {
	return {
		effectiveLevel: 1,
		badge: "phone",
		codOrders: true,
		protectedPayment: false,
		teamMembers: false,
		maxMembers: 1,
		supplier: false,
		fasterPayouts: false,
		legalInfoVerified: false,
		...overrides,
	};
}

function baseRequest(
	overrides: Partial<OwnerVerificationRequest> = {},
): OwnerVerificationRequest {
	return {
		id: "vr-1",
		requestedLevel: 2,
		status: "submitted",
		consent: null,
		kyc: null,
		business: null,
		documents: [],
		infoRequests: [],
		decision: null,
		statusHistory: [],
		submittedAt: null,
		approvedAt: null,
		expiresAt: null,
		...overrides,
	};
}

function baseView(
	overrides: Partial<ShopVerificationResponse> = {},
): ShopVerificationResponse {
	return {
		enabled: true,
		capabilities: baseCapabilities(),
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
		...overrides,
	};
}

describe("badgeLabelKey", () => {
	test("names one key per badge and nothing for none", () => {
		expect(badgeLabelKey("phone")).toBe("levelPhone");
		expect(badgeLabelKey("identity")).toBe("levelIdentity");
		expect(badgeLabelKey("business")).toBe("levelBusiness");
		expect(badgeLabelKey(null)).toBeNull();
	});
});

describe("levelLadder", () => {
	test("marks each rung reached, current or locked", () => {
		expect(levelLadder(baseCapabilities()).map((r) => r.state)).toEqual([
			"current",
			"locked",
			"locked",
		]);
		expect(
			levelLadder(baseCapabilities({ effectiveLevel: 3 })).map((r) => r.state),
		).toEqual(["reached", "reached", "current"]);
	});
});

describe("canOpenRequest", () => {
	test("refuses while the feature is off, even when everything else is fine", () => {
		expect(canOpenRequest(baseView({ enabled: false }), 2)).toEqual({
			ok: false,
			reason: "disabled",
		});
	});

	test("refuses level 3 before level 2", () => {
		expect(canOpenRequest(baseView(), 3)).toEqual({
			ok: false,
			reason: "notEligible",
		});
	});

	test("refuses while a request for that level is open", () => {
		const open = baseView({
			requests: { level2: baseRequest({ status: "submitted" }), level3: null },
		});
		expect(canOpenRequest(open, 2)).toEqual({ ok: false, reason: "open" });
	});

	test("refuses during a cooldown and says until when", () => {
		const until = new Date(Date.now() + 3_600_000).toISOString();
		expect(canOpenRequest(baseView({ cooldownUntil: until }), 2)).toEqual({
			ok: false,
			reason: "cooldown",
			until,
		});
	});

	test("allows it otherwise", () => {
		expect(canOpenRequest(baseView(), 2)).toEqual({ ok: true });
	});

	test("allows a renewal once inside the window, and not before", () => {
		const soon = new Date(Date.now() - 1000).toISOString();
		const later = new Date(Date.now() + 86_400_000).toISOString();
		const approved = baseRequest({
			status: "approved",
			expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
		});

		expect(
			canOpenRequest(
				baseView({
					requests: { level2: approved, level3: null },
					renewableFrom: { level2: soon, level3: null },
				}),
				2,
			),
		).toEqual({ ok: true });

		expect(
			canOpenRequest(
				baseView({
					requests: { level2: approved, level3: null },
					renewableFrom: { level2: later, level3: null },
				}),
				2,
			),
		).toEqual({ ok: false, reason: "notRenewableYet", until: later });
	});
});

describe("statusToneKey", () => {
	test("maps each status to a tone a screen can colour", () => {
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

describe("buildTimeline", () => {
	const request = baseRequest({
		status: "needs_info",
		statusHistory: [
			{ status: "draft", at: "2026-10-01T09:00:00.000Z", source: "seller" },
			{ status: "submitted", at: "2026-10-01T10:00:00.000Z", source: "seller" },
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
	});

	test("is newest first and marks the current step", () => {
		const timeline = buildTimeline(request);
		expect(timeline[0]).toMatchObject({ status: "needs_info", current: true });
		expect(timeline.at(-1)).toMatchObject({ status: "draft", current: false });
	});

	test("attaches the reviewer's message to the needs_info entry", () => {
		expect(buildTimeline(request)[0].message).toBe("Send the NIU certificate.");
	});

	test("attaches the decision message to a rejection", () => {
		const rejected = baseRequest({
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
		});
		expect(buildTimeline(rejected)[0]).toMatchObject({
			status: "rejected",
			reasonCode: "document_expired",
			message: "Your RCCM extract is from 2019.",
		});
	});

	test("hides a vendor step from the seller's timeline", () => {
		const withVendor: OwnerVerificationRequest = {
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
			buildTimeline(withVendor).some((entry) => entry.source === "vendor"),
		).toBe(false);
	});

	test("is empty, not undefined, for a request with no history", () => {
		expect(
			buildTimeline(
				baseRequest({
					status: "draft",
					statusHistory: [],
					infoRequests: [],
					decision: null,
				}),
			),
		).toEqual([]);
	});
});

describe("shouldKeepPolling", () => {
	const pending = (
		status: VerificationStatus,
	): Pick<ShopVerificationResponse, "requests"> => ({
		requests: { level2: baseRequest({ status }), level3: null },
	});

	test("polls every 3 seconds for at most 2 minutes", () => {
		expect(POLL_INTERVAL_MS).toBe(3000);
		expect(POLL_TIMEOUT_MS).toBe(120_000);
	});

	test("keeps polling while the request is still with the vendor", () => {
		expect(shouldKeepPolling(pending("draft"), 2, 0)).toBe(true);
		expect(shouldKeepPolling(pending("submitted"), 2, 0)).toBe(true);
	});

	test("stops once the request has an answer", () => {
		for (const status of [
			"approved",
			"rejected",
			"needs_info",
			"in_review",
			"revoked",
			"expired",
		] as const) {
			expect(shouldKeepPolling(pending(status), 2, 0)).toBe(false);
		}
	});

	test("stops at the timeout even when nothing has changed", () => {
		expect(shouldKeepPolling(pending("draft"), 2, POLL_TIMEOUT_MS)).toBe(false);
	});

	test("stops when there is no request at all", () => {
		expect(
			shouldKeepPolling({ requests: { level2: null, level3: null } }, 2, 0),
		).toBe(false);
	});
});

const businessBase: BusinessValues = {
	businessType: "company",
	legalName: "AKWA SARL",
	tradeName: "",
	rccmNumber: "RC/DLA/2020/B/1234",
	entreprenantDeclarationNumber: "",
	niu: "M012345678901X",
	registeredAddress: "Rue Njo-Njo, Bonapriso",
	city: "Douala",
	legalRepresentativeName: "Aïcha Mbappé",
	legalRepresentativeIsOwner: true,
};

describe("requiredKinds", () => {
	test("asks for the right kinds per business type", () => {
		expect(requiredKinds("entreprenant", true)).toEqual([
			"entreprenant_declaration",
			"niu_certificate",
		]);
		expect(requiredKinds("company", true)).toEqual([
			"rccm_extract",
			"niu_certificate",
		]);
		expect(requiredKinds("company", false)).toEqual([
			"rccm_extract",
			"niu_certificate",
			"legal_representative_id",
			"mandate",
		]);
	});
});

describe("missingKinds and canSubmit", () => {
	test("names what is still missing and gates submit on it", () => {
		expect(missingKinds(businessBase, [{ kind: "rccm_extract" }])).toEqual([
			"niu_certificate",
		]);
		expect(canSubmit(businessBase, [{ kind: "rccm_extract" }])).toBe(false);
		expect(
			canSubmit(businessBase, [
				{ kind: "rccm_extract" },
				{ kind: "niu_certificate" },
			]),
		).toBe(true);
	});

	test("does not let an incomplete form submit even with every document present", () => {
		expect(
			canSubmit({ ...businessBase, legalName: "" }, [
				{ kind: "rccm_extract" },
				{ kind: "niu_certificate" },
			]),
		).toBe(false);
	});
});

function viewer(
	overrides: Partial<VerificationReviewerViewer> = {},
): VerificationReviewerViewer {
	return {
		canClaim: false,
		canDecide: false,
		canRevoke: false,
		isAssignee: false,
		isAdmin: false,
		conflictOfInterest: false,
		...overrides,
	};
}

describe("availableActions", () => {
	test("reads the permission the API states, never a value being present", () => {
		expect(availableActions(viewer({ canClaim: true }), "submitted")).toEqual([
			"claim",
		]);
		expect(
			availableActions(
				viewer({ canDecide: true, isAssignee: true }),
				"in_review",
			),
		).toEqual(["release", "request_info", "approve", "reject"]);
	});

	test("offers nothing to a reviewer with a conflict of interest", () => {
		expect(
			availableActions(
				viewer({ canClaim: true, conflictOfInterest: true }),
				"submitted",
			),
		).toEqual([]);
	});

	test("offers revoke on an approved request to a reviewer the server clears to revoke", () => {
		expect(availableActions(viewer({ canRevoke: true }), "approved")).toEqual([
			"revoke",
		]);
	});

	test("never offers revoke from canDecide — an approved request's assignee is always null, so canDecide is always false", () => {
		expect(availableActions(viewer({ canDecide: true }), "approved")).toEqual(
			[],
		);
	});

	test("offers nothing on a terminal request", () => {
		for (const status of ["rejected", "revoked", "expired"] as const) {
			expect(
				availableActions(viewer({ canDecide: true, isAdmin: true }), status),
			).toEqual([]);
		}
	});
});

describe("checklistComplete", () => {
	test("names the five items", () => {
		expect(CHECKLIST_ITEMS).toEqual([
			"name_matches_registry",
			"registration_number_matches_document",
			"niu_matches_certificate",
			"representative_matches_identity_or_mandate",
			"documents_legible_and_current",
		]);
	});

	test("is complete only when every item is true", () => {
		const all: Record<ChecklistItem, boolean> = {
			name_matches_registry: true,
			registration_number_matches_document: true,
			niu_matches_certificate: true,
			representative_matches_identity_or_mandate: true,
			documents_legible_and_current: true,
		};
		expect(checklistComplete(all)).toBe(true);
		expect(checklistComplete({ ...all, niu_matches_certificate: false })).toBe(
			false,
		);
		expect(checklistComplete({})).toBe(false);
	});
});

describe("publicShopBadge", () => {
	function shop(overrides: Partial<PublicShop> = {}): PublicShop {
		return {
			id: "shop-1",
			handle: "acme",
			name: "Acme",
			description: null,
			logo: null,
			banner: null,
			contact: { phone: null, whatsapp: null, email: null },
			location: { city: null, region: null, country: null, countryCode: null },
			categories: [],
			level: 3,
			badge: "business",
			legalVerified: true,
			legal: null,
			publishedListingCount: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			owner: {
				id: "owner-1",
				name: "Owner",
				avatar: null,
				rating: 0,
				totalReviews: 0,
				memberSince: "2026-01-01T00:00:00.000Z",
			},
			...overrides,
		};
	}

	/**
	 * A depth-populated `listing.shop` relation only ever carries the raw,
	 * stale `level` (P2 review finding I5) — this is the regression case: a
	 * shop still stored at level 3 whose approval has actually expired, so
	 * the server's `shopCapabilities()` already stepped its badge down to
	 * "phone". Reading `.badge` off the re-fetched public shop must agree
	 * with the server, never `badgeForLevel(shop.level)` over the stale 3.
	 */
	test("reads the server's badge for an expired level-3 shop, not badgeForLevel(level)", () => {
		const response = { shop: shop({ level: 3, badge: "phone" }) };

		expect(badgeForLevel(3)).toBe("business");
		expect(publicShopBadge(response)).toBe("phone");
	});

	test("returns null while the fetch is pending", () => {
		expect(publicShopBadge(undefined)).toBeNull();
	});

	test("returns null when the shop redirected to a new handle", () => {
		expect(publicShopBadge({ redirectTo: "/s/new-handle" })).toBeNull();
	});
});
