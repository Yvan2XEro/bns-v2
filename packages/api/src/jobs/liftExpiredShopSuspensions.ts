import type { TaskConfig } from "payload";
import { liftExpiredShopSuspensions } from "../services/moderation";

export const liftExpiredShopSuspensionsTask: TaskConfig<"liftExpiredShopSuspensions"> =
	{
		slug: "liftExpiredShopSuspensions",
		retries: 1,
		inputSchema: [],
		schedule: [{ cron: "15 */6 * * *", queue: "nightly" }],
		handler: async ({ req }) => {
			const { lifted } = await liftExpiredShopSuspensions(req.payload);
			return { output: { liftedCount: lifted.length } };
		},
	};
