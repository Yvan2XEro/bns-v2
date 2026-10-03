import type { TaskConfig } from "payload";
import { releaseEligibleFunds } from "../services/payouts";

/** Registered and scheduled (daily, 10:00 Africa/Douala) by the jobs wiring (P5 Task 20), not here. */
export const releaseEligibleFundsTask: TaskConfig<{
	input: object;
	output: { payoutCount: number; skippedCount: number };
}> = {
	slug: "releaseEligibleFunds",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const { payouts, skipped } = await releaseEligibleFunds(req.payload);
		return {
			output: { payoutCount: payouts.length, skippedCount: skipped.length },
		};
	},
};
