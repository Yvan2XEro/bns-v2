import type { TaskConfig } from "payload";
import { purgeRiskData } from "../services/riskRetention";

export const purgeRiskDataTask: TaskConfig<{
	input: object;
	output: {
		deletedFlags: number;
		redactedFlags: number;
		closedFlags: number;
		deletedDailyStats: number;
	};
}> = {
	slug: "purgeRiskData",
	retries: 1,
	inputSchema: [],
	schedule: [{ cron: "30 3 * * *", queue: "nightly" }],
	handler: async ({ req }) => ({
		output: await purgeRiskData(req.payload),
	}),
};
