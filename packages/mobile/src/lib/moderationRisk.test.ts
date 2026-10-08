import { describe, expect, it } from "bun:test";
import { riskDismissalDecision, riskSanctionDecision } from "./moderationRisk";

describe("riskDismissalDecision", () => {
	it("requires a reason and records a false-positive resolution", () => {
		expect(riskDismissalDecision("  ")).toBeNull();
		expect(riskDismissalDecision("No supporting evidence.")).toEqual({
			outcome: "dismissed",
			resolution: "false_positive",
			note: "No supporting evidence.",
		});
	});
});

describe("riskSanctionDecision", () => {
	it("binds the selected sanction to the reviewed subject and required note", () => {
		expect(
			riskSanctionDecision("suspend_user", "user-1", 7, "Confirmed fraud."),
		).toEqual({
			outcome: "actioned",
			resolution: "user_suspended",
			note: "Confirmed fraud.",
			action: {
				type: "suspend_user",
				targetId: "user-1",
				reason: "fraud",
				durationDays: 7,
			},
		});
		expect(riskSanctionDecision("suspend_shop", "", 7, "reason")).toBeNull();
		expect(riskSanctionDecision("hold_payouts", "shop-1", 7, "  ")).toBeNull();
		expect(
			riskSanctionDecision("suspend_shop", "shop-1", 30, "Policy breach."),
		).toMatchObject({
			outcome: "actioned",
			resolution: "shop_suspended",
			action: { type: "suspend_shop", targetId: "shop-1", reason: "fraud" },
		});
		expect(
			riskSanctionDecision("hold_payouts", "shop-1", 7, "Review payouts."),
		).toMatchObject({
			outcome: "actioned",
			resolution: "payouts_held",
			action: {
				type: "hold_payouts",
				targetId: "shop-1",
				reason: "moderation",
			},
		});
	});
});
