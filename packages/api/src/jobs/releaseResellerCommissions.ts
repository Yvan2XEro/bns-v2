import type { TaskConfig } from "payload";
import { releaseResellerCommissions } from "../services/resellerPayouts";

export const releaseResellerCommissionsTask: TaskConfig<"releaseResellerCommissions"> =
	{
		slug: "releaseResellerCommissions",
		retries: 1,
		schedule: [{ cron: "30 4 * * *", queue: "commission" }],
		inputSchema: [],
		outputSchema: [{ name: "releasedCount", type: "number" }],
		handler: async ({ req }) => ({
			output: {
				releasedCount: (await releaseResellerCommissions(req.payload)).length,
			},
		}),
	};
