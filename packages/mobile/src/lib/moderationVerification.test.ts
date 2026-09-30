import { describe, expect, it } from "bun:test";
import {
	decisionSchema,
	parseReasonCode,
	queueTabs,
	relativeAge,
	signalToneKey,
} from "./moderationVerification";

describe("signalToneKey", () => {
	it("separates the signals that mean fraud from the ones that mean paperwork", () => {
		for (const code of [
			"identity_reused",
			"document_reused",
			"kyc_declined",
			"underage",
		]) {
			expect(signalToneKey(code)).toBe("negative");
		}
		for (const code of [
			"name_mismatch",
			"kyc_review",
			"rccm_reused",
			"niu_reused",
		]) {
			expect(signalToneKey(code)).toBe("warning");
		}
		expect(signalToneKey("niu_format")).toBe("neutral");
	});
});

describe("relativeAge", () => {
	const now = new Date("2026-10-02T12:00:00.000Z");

	it("counts minutes, then hours, then days", () => {
		expect(relativeAge("2026-10-02T11:30:00.000Z", now)).toEqual({
			unit: "minutes",
			count: 30,
		});
		expect(relativeAge("2026-10-02T04:00:00.000Z", now)).toEqual({
			unit: "hours",
			count: 8,
		});
		expect(relativeAge("2026-09-28T12:00:00.000Z", now)).toEqual({
			unit: "days",
			count: 4,
		});
	});

	it("never reports a negative age for a clock skew", () => {
		expect(relativeAge("2026-10-02T12:05:00.000Z", now)).toEqual({
			unit: "minutes",
			count: 0,
		});
	});

	it("reports nothing for a request that was never submitted", () => {
		expect(relativeAge(null, now)).toBeNull();
	});
});

describe("queue tabs", () => {
	it("adds a verification tab fed by pendingVerifications", () => {
		expect(
			queueTabs({
				pendingListings: 2,
				pendingReports: 1,
				pendingVerifications: 4,
			}).map((t) => t.key),
		).toEqual(["listings", "reports", "verification"]);
		expect(
			queueTabs({
				pendingListings: 2,
				pendingReports: 1,
				pendingVerifications: 4,
			}).at(-1)?.count,
		).toBe(4);
	});

	it("shows no count rather than zero before the summary loads", () => {
		expect(queueTabs(undefined).at(-1)?.count).toBeNull();
	});
});

describe("decisionSchema", () => {
	it("never shows a sheet field for claim or release", () => {
		for (const action of ["claim", "release"] as const) {
			const config = decisionSchema(action);
			expect(config.reasons).toBeNull();
			expect(config.textKind).toBeNull();
		}
	});

	it("requires a reason and a seller message for request_info and reject", () => {
		for (const action of ["request_info", "reject"] as const) {
			const config = decisionSchema(action);
			expect(config.reasons?.length).toBeGreaterThan(0);
			expect(config.textRequired).toBe(true);
			expect(config.textKind).toBe("sellerMessage");
		}
	});

	it("takes an optional internal note for approve, and a reason plus an optional note for revoke", () => {
		expect(decisionSchema("approve")).toEqual({
			reasons: null,
			textRequired: false,
			textKind: "note",
		});
		const revoke = decisionSchema("revoke");
		expect(revoke.reasons?.length).toBeGreaterThan(0);
		expect(revoke.textRequired).toBe(false);
		expect(revoke.textKind).toBe("note");
	});
});

describe("parseReasonCode", () => {
	it("accepts a code from the action's own list", () => {
		expect(parseReasonCode("reject", "document_invalid")).toEqual({
			ok: true,
			reasonCode: "document_invalid",
		});
		expect(parseReasonCode("revoke", "fraud")).toEqual({
			ok: true,
			reasonCode: "fraud",
		});
	});

	it("refuses a code outside the action's list, including a near-miss typo (I3)", () => {
		expect(parseReasonCode("reject", "fraud_suspcted")).toEqual({ ok: false });
		expect(parseReasonCode("revoke", "document_invalid")).toEqual({
			ok: false,
		});
		expect(parseReasonCode("reject", null)).toEqual({ ok: false });
		expect(parseReasonCode("reject", undefined)).toEqual({ ok: false });
	});

	it("has nothing to parse for an action with no reason at all", () => {
		expect(parseReasonCode("approve", "anything")).toEqual({
			ok: true,
			reasonCode: null,
		});
		expect(parseReasonCode("claim", null)).toEqual({
			ok: true,
			reasonCode: null,
		});
	});
});
