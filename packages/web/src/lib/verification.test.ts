import { describe, expect, it } from "bun:test";
import {
	badgeLabelKey,
	canOpenRequest,
	formatRenewalWindow,
	levelLadder,
	type ShopVerificationResponse,
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
