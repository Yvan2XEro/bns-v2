import type { TaskConfig } from "payload";
import { advanceReturnRefunds } from "../services/returnRefunds";
import { advanceReturnCases } from "../services/returns";

export const advanceReturnCasesTask: TaskConfig<{
	input: object;
	output: {
		rejectedCount: number;
		expiredCount: number;
		pickupWaivedCount: number;
		receivedCount: number;
		inspectedCount: number;
		deductionContestedCount: number;
		refundsExecutedCount: number;
		refundsClosedCount: number;
	};
}> = {
	slug: "advanceReturnCases",
	retries: 1,
	schedule: [{ cron: "0 * * * *", queue: "cases" }],
	inputSchema: [],
	handler: async ({ req }) => {
		const result = await advanceReturnCases(req.payload);
		const refunds = await advanceReturnRefunds(req.payload);
		return {
			output: {
				rejectedCount: result.rejected.length,
				expiredCount: result.expired.length,
				pickupWaivedCount: result.pickupWaived.length,
				receivedCount: result.received.length,
				inspectedCount: result.inspected.length,
				deductionContestedCount: result.deductionContested.length,
				refundsExecutedCount: refunds.executed.length,
				refundsClosedCount: refunds.closed.length,
			},
		};
	},
};
