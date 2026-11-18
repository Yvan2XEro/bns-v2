import type { TaskConfig } from "payload";
import { recomputeShopRankings } from "../services/shopRanking";

export const recomputeShopRankingsTask: TaskConfig<"recomputeShopRankings"> = {
	slug: "recomputeShopRankings",
	retries: 1,
	inputSchema: [],
	// After the 23:30 daily stats; drained by the 06:00 nightly run.
	schedule: [{ cron: "0 5 * * *", queue: "nightly" }],
	handler: async ({ req }) => {
		const output = await recomputeShopRankings(req.payload);
		req.payload.logger.info({ msg: "[shop-ranking] recomputed", ...output });
		return { output };
	},
};
