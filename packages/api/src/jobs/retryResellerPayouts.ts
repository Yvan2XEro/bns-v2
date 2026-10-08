import type { TaskConfig } from "payload";
import { retryPendingResellerPayouts } from "../services/resellerPayouts";

export const retryResellerPayoutsTask: TaskConfig<"retryResellerPayouts"> = {
	slug: "retryResellerPayouts",
	retries: 1,
	schedule: [{ cron: "*/15 * * * *", queue: "commission" }],
	inputSchema: [],
	outputSchema: [
		{ name: "submittedCount", type: "number" },
		{ name: "skippedCount", type: "number" },
	],
	handler: async ({ req }) => {
		const result = await retryPendingResellerPayouts(req.payload);
		return {
			output: {
				submittedCount: result.submitted.length,
				skippedCount: result.skipped.length,
			},
		};
	},
};
