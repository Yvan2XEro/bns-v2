import { describe, expect, it } from "bun:test";
import {
	queueTabs,
	relativeAge,
	signalToneKey,
} from "./moderation-verification";

describe("signalToneKey", () => {
	it("separates the signals that mean fraud from the ones that mean paperwork", () => {
		for (const code of [
			"identity_reused",
			"document_reused",
			"kyc_declined",
			"underage",
		]) {
			expect(signalToneKey(code as never)).toBe("negative");
		}
		for (const code of [
			"name_mismatch",
			"kyc_review",
			"rccm_reused",
			"niu_reused",
		]) {
			expect(signalToneKey(code as never)).toBe("warning");
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

describe("queueTabs", () => {
	it("shows a count only on the queue that has one", () => {
		expect(queueTabs({ pendingVerifications: 4 })).toEqual([
			{ key: "to_review", count: 4 },
			{ key: "mine", count: null },
			{ key: "needs_info", count: null },
			{ key: "decided", count: null },
		]);
	});

	it("shows no count rather than zero when the summary has not loaded", () => {
		expect(queueTabs(undefined)[0].count).toBeNull();
	});
});
