import type { TaskConfig } from "payload";
import { advanceDisputes } from "../services/advanceDisputes";

export const advanceDisputesTask: TaskConfig<{
	input: object;
	output: Record<string, number>;
}> = {
	slug: "advanceDisputes",
	retries: 1,
	schedule: [{ cron: "*/15 * * * *", queue: "cases" }],
	inputSchema: [],
	handler: async ({ req }) => ({
		output: await advanceDisputes(req.payload),
	}),
};
