import type { TaskConfig } from "payload";
import { sendWeeklyInsights } from "../services/weeklyInsights";

export const sendWeeklyInsightsTask: TaskConfig<"sendWeeklyInsights"> = {
	slug: "sendWeeklyInsights",
	retries: 1,
	inputSchema: [],
	schedule: [{ cron: "0 7 * * 1", queue: "insights" }],
	handler: async ({ req }) => ({
		output: await sendWeeklyInsights(req.payload),
	}),
};
