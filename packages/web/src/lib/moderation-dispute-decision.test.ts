import { describe, expect, test } from "bun:test";
import {
	canResolve,
	type DecisionInput,
	type DecisionSheet,
	decisionGuards,
	infoRequestState,
	OVERRIDE_NOTE_MIN_LENGTH,
	parseRefund,
	previewIsCurrent,
	refundBounds,
} from "./moderation-dispute-decision";

const sheet: DecisionSheet = {
	amountAtStake: 300_000,
	moderatorRefundLimit: 250_000,
	proofEstablished: true,
	viewerIsAdmin: false,
};
const base: DecisionInput = {
	outcome: "resolved_split",
	refund: "100000",
	reasonCode: "partial_fault",
	returnRequired: false,
	returnShippingPaidBy: null,
	statementFr: "Decision",
	statementEn: "Decision",
	note: "Reviewed",
};
const run = (s: Partial<DecisionSheet>, i: Partial<DecisionInput>) =>
	decisionGuards({ ...sheet, ...s }, { ...base, ...i });

describe("refundBounds", () => {
	test("each outcome has its own window", () => {
		expect(refundBounds("resolved_buyer", 300_000)).toEqual({
			min: 1,
			max: 300_000,
		});
		expect(refundBounds("resolved_seller", 300_000)).toEqual({
			min: 0,
			max: 0,
		});
		expect(refundBounds("resolved_split", 300_000)).toEqual({
			min: 1,
			max: 299_999,
		});
	});
});

describe("decisionGuards: the refund rungs", () => {
	test("a valid split passes clean", () => {
		expect(run({}, {}).guards).toEqual([]);
	});
	test("non-numeric and negative text is invalid", () => {
		expect(parseRefund("12.5")).toBeNull();
		expect(parseRefund("-1")).toBeNull();
		expect(parseRefund("")).toBeNull();
		expect(run({}, { refund: "abc" }).guards).toContain("refund_invalid");
	});
	test("buyer wins: 0 refused, the full amount allowed, one over refused", () => {
		const buyer = { outcome: "resolved_buyer" as const };
		expect(run({}, { ...buyer, refund: "0" }).guards).toContain(
			"refund_out_of_bounds",
		);
		expect(
			run({ moderatorRefundLimit: 999_999 }, { ...buyer, refund: "300000" })
				.guards,
		).toEqual([]);
		expect(run({}, { ...buyer, refund: "300001" }).guards).toContain(
			"refund_out_of_bounds",
		);
	});
	test("seller wins: only 0 is allowed", () => {
		const seller = {
			outcome: "resolved_seller" as const,
			reasonCode: "partial_fault",
		};
		expect(
			run({ proofEstablished: true }, { ...seller, refund: "0" }).guards,
		).toEqual([]);
		expect(
			run({ proofEstablished: true }, { ...seller, refund: "1" }).guards,
		).toContain("refund_out_of_bounds");
	});
	test("split excludes both ends", () => {
		expect(run({}, { refund: "0" }).guards).toContain("refund_out_of_bounds");
		expect(run({}, { refund: "300000" }).guards).toContain(
			"refund_out_of_bounds",
		);
		expect(run({}, { refund: "299999" }).guards).not.toContain(
			"refund_out_of_bounds",
		);
	});
});

describe("decisionGuards: the moderator limit", () => {
	test("exactly the limit is a moderator's call", () => {
		const r = run({}, { refund: "250000" });
		expect(r.adminOnly).toBe(false);
		expect(r.guards).toEqual([]);
	});
	test("one over is admin-only and blocks a moderator", () => {
		const r = run({}, { refund: "250001" });
		expect(r.adminOnly).toBe(true);
		expect(r.guards).toEqual(["admin_required"]);
	});
	test("an admin sees the state but is not blocked", () => {
		const r = run({ viewerIsAdmin: true }, { refund: "250001" });
		expect(r.adminOnly).toBe(true);
		expect(r.guards).toEqual([]);
	});
});

describe("decisionGuards: the burden-of-proof override", () => {
	const seller = {
		outcome: "resolved_seller" as const,
		refund: "0",
		reasonCode: "buyer_abuse",
	};
	test("established proof needs no override", () => {
		expect(
			run({ proofEstablished: true }, { ...seller, reasonCode: "other" })
				.overrideRequired,
		).toBe(false);
	});
	test("without proof a non-override code is refused", () => {
		const r = run(
			{ proofEstablished: false },
			{ ...seller, reasonCode: "other", note: "x".repeat(80) },
		);
		expect(r.overrideRequired).toBe(true);
		expect(r.guards).toContain("override_required");
	});
	test("without proof a short note is refused, the 50th character passes", () => {
		const short = run(
			{ proofEstablished: false },
			{ ...seller, note: "x".repeat(OVERRIDE_NOTE_MIN_LENGTH - 1) },
		);
		expect(short.guards).toContain("override_required");
		const ok = run(
			{ proofEstablished: false },
			{ ...seller, note: "x".repeat(OVERRIDE_NOTE_MIN_LENGTH) },
		);
		expect(ok.guards).toEqual([]);
	});
	test("each of the three override codes qualifies", () => {
		for (const reasonCode of [
			"buyer_abuse",
			"item_conforms",
			"delivery_proven",
		])
			expect(
				run(
					{ proofEstablished: false },
					{ ...seller, reasonCode, note: "x".repeat(60) },
				).guards,
			).toEqual([]);
	});
	test("a buyer or split outcome never needs it", () => {
		expect(run({ proofEstablished: false }, {}).overrideRequired).toBe(false);
	});
});

describe("decisionGuards: the form rungs", () => {
	test("a required return needs a payer", () => {
		expect(run({}, { returnRequired: true }).guards).toEqual([
			"return_payer_required",
		]);
		expect(
			run({}, { returnRequired: true, returnShippingPaidBy: "seller" }).guards,
		).toEqual([]);
	});
	test("both public statements and the note are required", () => {
		expect(run({}, { statementEn: " " }).guards).toEqual([
			"statement_required",
		]);
		expect(run({}, { note: " " }).guards).toEqual(["note_required"]);
	});
	test("an out-of-bounds amount cannot be previewed, a blocked-by-rank one can", () => {
		expect(run({}, { refund: "0" }).canPreview).toBe(false);
		expect(run({}, { refund: "250001" }).canPreview).toBe(true);
	});
});

describe("submission needs a current preview", () => {
	test("preview must match the amount", () => {
		expect(previewIsCurrent(100, 100)).toBe(true);
		expect(previewIsCurrent(100, 101)).toBe(false);
		expect(previewIsCurrent(null, null)).toBe(false);
	});
	test("canResolve needs no guards and a matching preview", () => {
		const g = run({}, {});
		expect(canResolve(g, 100_000)).toBe(true);
		expect(canResolve(g, 90_000)).toBe(false);
		expect(canResolve(run({}, { note: "" }), 100_000)).toBe(false);
	});
});

describe("infoRequestState", () => {
	test("counts info_request messages against the cap of 2", () => {
		const m = (kind: string) => ({ kind });
		expect(infoRequestState([m("text"), m("info_request")])).toEqual({
			used: 1,
			cap: 2,
			exhausted: false,
		});
		expect(
			infoRequestState([m("info_request"), m("info_request")]).exhausted,
		).toBe(true);
	});
});
