import type { TaskConfig } from "payload";
import { publishHeldReviews } from "../services/reviewRelease";

export const publishHeldReviewsTask: TaskConfig<{
	input: object;
	output: { publishedCount: number };
}> = {
	slug: "publishHeldReviews",
	retries: 1,
	schedule: [{ cron: "0 * * * *", queue: "cases" }],
	inputSchema: [],
	handler: async ({ req }) => ({
		output: {
			publishedCount: (await publishHeldReviews(req.payload)).length,
		},
	}),
};
