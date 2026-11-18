// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	computeTier,
	countRefusals,
	refusalWeight,
	worseTier,
} from "../../src/lib/buyerRisk";

const now = new Date("2026-10-02T12:00:00.000Z");
const daysAgo = (n: number) =>
	new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("refusalWeight", () => {
	it("counts a resolved abuse dispute twice and a timeout not at all", () => {
		expect(refusalWeight("refused")).toBe(1);
		expect(refusalWeight("unreachable")).toBe(1);
		expect(refusalWeight("absent")).toBe(1);
		expect(refusalWeight("refused_abuse")).toBe(2);
		expect(refusalWeight("timeout")).toBe(0);
		expect(refusalWeight("address_not_found")).toBe(0);
		expect(refusalWeight("other")).toBe(0);
	});
});

describe("countRefusals", () => {
	it("counts the last 180 days inclusive and drops older ones", () => {
		const rows = [
			{ reason: "refused", at: daysAgo(1) },
			{ reason: "refused", at: daysAgo(180) },
			{ reason: "refused", at: daysAgo(181) },
		];
		expect(countRefusals(rows, now)).toBe(2);
	});

	it("ignores a non-refusal failure however recent", () => {
		expect(countRefusals([{ reason: "timeout", at: daysAgo(0) }], now)).toBe(0);
	});
});

describe("computeTier", () => {
	it.each([
		[{ refusals: 3, delivered: 3 }, "blocked"], // 3/6 = 0.50, at the boundary
		[{ refusals: 3, delivered: 4 }, "watch"], // 3/7 = 0.43 — below 0.5, above 0.34
		[{ refusals: 2, delivered: 3 }, "watch"], // 2/5 = 0.40
		[{ refusals: 2, delivered: 4 }, "regular"], // 2/6 = 0.33 — just below 0.34
		[{ refusals: 0, delivered: 3 }, "trusted"],
		[{ refusals: 0, delivered: 2 }, "regular"],
		[{ refusals: 1, delivered: 5 }, "regular"],
		[{ refusals: 0, delivered: 0 }, "new"],
		[{ refusals: 1, delivered: 0 }, "new"], // r=1 fails both r>=2 and r>=3
	])("maps %o to %s", (input, expected) => {
		expect(computeTier(input)).toBe(expected);
	});

	it("lets a staff override win in both directions", () => {
		expect(
			computeTier({ refusals: 0, delivered: 9, override: "blocked" }),
		).toBe("blocked");
		// A buyer whose numbers still read `watch` (9/9 = 100% refusals) stays
		// `watch` under "unblocked": the override lifts `blocked` only, it is
		// not absolution for the refusal history itself. This differs from the
		// task brief's draft test, which expected "new" — fixed here per the
		// brief's own instruction to resolve the conflict and record the
		// choice (see task-4-report.md).
		expect(
			computeTier({ refusals: 9, delivered: 0, override: "unblocked" }),
		).toBe("watch");
		expect(computeTier({ refusals: 9, delivered: 0, override: "none" })).toBe(
			"blocked",
		);
	});
});

describe("worseTier", () => {
	it("takes the worse of the account phone and the delivery phone", () => {
		expect(worseTier("trusted", "watch")).toBe("watch");
		expect(worseTier("new", "trusted")).toBe("new");
		expect(worseTier("blocked", "trusted")).toBe("blocked");
		expect(worseTier("regular", "regular")).toBe("regular");
	});
});
