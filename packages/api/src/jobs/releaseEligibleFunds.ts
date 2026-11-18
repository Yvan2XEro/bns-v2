import type { TaskConfig } from "payload";
import { runMarketSweep } from "../services/marketSweep";
import { releaseEligibleFunds } from "../services/payouts";

/** Registered and scheduled (hourly; each market releases at its own releaseHourLocal) by the jobs wiring (P5 Task 20), not here. */
export const releaseEligibleFundsTask: TaskConfig<{
	input: object;
	output: { payoutCount: number; skippedCount: number };
}> = {
	slug: "releaseEligibleFunds",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const outcome = await runMarketSweep(req.payload, "release", () =>
			releaseEligibleFunds(req.payload),
		);
		if (!outcome.ran) return { output: { payoutCount: 0, skippedCount: 0 } };
		const { payouts, skipped } = outcome.result;
		return {
			output: { payoutCount: payouts.length, skippedCount: skipped.length },
		};
	},
};
