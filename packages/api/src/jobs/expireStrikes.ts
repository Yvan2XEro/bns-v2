import type { TaskConfig } from "payload";
import { expireStrikes } from "../services/strikes";

export const expireStrikesTask: TaskConfig<{
	input: object;
	output: { expiredCount: number };
}> = {
	slug: "expireStrikes",
	retries: 1,
	schedule: [{ cron: "0 0 * * *", queue: "cases" }],
	inputSchema: [],
	handler: async ({ req }) => {
		const result = await expireStrikes(req.payload);
		return { output: { expiredCount: result.expired.length } };
	},
};
