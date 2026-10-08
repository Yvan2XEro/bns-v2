import type { TaskConfig } from "payload";
import { payResellerCommissions } from "../services/resellerPayouts";

export const payResellerCommissionsTask: TaskConfig<"payResellerCommissions"> = {
	slug: "payResellerCommissions",
	retries: 1,
	schedule: [{ cron: "0 5 * * 1", queue: "commission" }],
	inputSchema: [],
	outputSchema: [
		{ name: "createdCount", type: "number" },
		{ name: "submittedCount", type: "number" },
		{ name: "skippedCount", type: "number" },
	],
	handler: async ({ req }) => {
		const result = await payResellerCommissions(req.payload);
		return {
			output: {
				createdCount: result.created.length,
				submittedCount: result.submitted.length,
				skippedCount: result.skipped.length,
			},
		};
	},
};
