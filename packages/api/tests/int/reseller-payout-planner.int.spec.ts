import { describe, expect, it } from "vitest";
import { planResellerPayout } from "../../src/services/resellerPayoutPlanner";

describe("planResellerPayout", () => {
	it("takes the oldest payable commissions first under the new-reseller weekly cap", () => {
		const plan = planResellerPayout({
			commissions: [
				{ id: "newer", amount: 18_000, createdAt: "2026-10-02T00:00:00.000Z" },
				{ id: "oldest", amount: 20_000, createdAt: "2026-10-01T00:00:00.000Z" },
			],
			charges: [{ id: "charge", amount: 4_000, createdAt: "2026-10-03" }],
			weeklyCap: 25_000,
			minimum: 2_000,
			capApplies: true,
		});

		expect(plan).toEqual({
			commissionIds: ["oldest"],
			chargeIds: ["charge"],
			grossAmount: 20_000,
			offsetAmount: 4_000,
			amount: 16_000,
			fee: 160,
			skipped: null,
		});
	});

	it("does not pay below the minimum after offsets", () => {
		const plan = planResellerPayout({
			commissions: [{ id: "commission", amount: 3_000, createdAt: "2026-10-01" }],
			charges: [{ id: "charge", amount: 2_000, createdAt: "2026-10-03" }],
			weeklyCap: 25_000,
			minimum: 2_000,
			capApplies: false,
		});

		expect(plan.amount).toBe(1_000);
		expect(plan.skipped).toBe("below_minimum");
	});

	it("skips an empty payable commission set", () => {
		const plan = planResellerPayout({
			commissions: [],
			charges: [],
			weeklyCap: 25_000,
			minimum: 2_000,
			capApplies: false,
		});

		expect(plan.grossAmount).toBe(0);
		expect(plan.skipped).toBe("nothing_payable");
	});
});
