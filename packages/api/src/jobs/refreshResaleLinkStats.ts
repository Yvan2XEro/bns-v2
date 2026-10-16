import type { TaskConfig } from "payload";
import {
	enforceResellerLevelMinimums,
	refreshResaleLinkStats,
} from "../services/resaleMaintenance";

export const refreshResaleLinkStatsTask: TaskConfig<{
	input: object;
	output: { linksUpdated: number; productsRepaired: number };
}> = {
	slug: "refreshResaleLinkStats",
	retries: 1,
	schedule: [{ cron: "0 4 * * *", queue: "nightly" }],
	inputSchema: [],
	outputSchema: [
		{ name: "linksUpdated", type: "number" },
		{ name: "productsRepaired", type: "number" },
	],
	handler: async ({ req }) => {
		await enforceResellerLevelMinimums(req.payload);
		return { output: await refreshResaleLinkStats(req.payload) };
	},
};
