import type { TaskConfig } from "payload";
import { expirePayoutHolds } from "../services/payoutHolds";

/** Registered and scheduled by the jobs wiring (P5 Task 20), not here. */
export const expirePayoutHoldsTask: TaskConfig<{
	input: object;
	output: { expiredCount: number };
}> = {
	slug: "expirePayoutHolds",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const { expired } = await expirePayoutHolds(req.payload);
		return { output: { expiredCount: expired.length } };
	},
};
