import type { TaskConfig } from "payload";
import { enforceResaleTerms } from "../services/resaleMaintenance";

export const enforceResaleTermsTask: TaskConfig<{
	input: object;
	output: { shopsHeld: number };
}> = {
	slug: "enforceResaleTerms",
	retries: 1,
	schedule: [{ cron: "0 3 * * *", queue: "nightly" }],
	inputSchema: [],
	outputSchema: [{ name: "shopsHeld", type: "number" }],
	handler: async ({ req }) => ({
		output: { shopsHeld: (await enforceResaleTerms(req.payload)).length },
	}),
};
