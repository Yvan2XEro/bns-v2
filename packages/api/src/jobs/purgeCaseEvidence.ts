import type { TaskConfig } from "payload";
import { purgeCaseEvidence } from "../services/disputeEvidence";

export const purgeCaseEvidenceTask: TaskConfig<{
	input: object;
	output: { purgedCount: number };
}> = {
	slug: "purgeCaseEvidence",
	retries: 1,
	// Douala is UTC+1; 03:30 local is 02:30 UTC.
	schedule: [{ cron: "30 2 * * *", queue: "cases" }],
	inputSchema: [],
	handler: async ({ req }) => ({
		output: { purgedCount: (await purgeCaseEvidence(req.payload)).length },
	}),
};
