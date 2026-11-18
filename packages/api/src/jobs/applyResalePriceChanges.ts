import type { TaskConfig } from "payload";
import { applyResalePriceChanges } from "../services/resaleSupplier";

export const applyResalePriceChangesTask: TaskConfig<{
	input: object;
	output: { appliedCount: number };
}> = {
	slug: "applyResalePriceChanges",
	retries: 1,
	schedule: [{ cron: "0 * * * *", queue: "hourly" }],
	inputSchema: [],
	outputSchema: [{ name: "appliedCount", type: "number" }],
	handler: async ({ req }) => ({
		output: {
			appliedCount: (await applyResalePriceChanges(req.payload)).length,
		},
	}),
};
