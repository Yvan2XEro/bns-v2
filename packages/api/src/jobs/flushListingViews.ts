import type { TaskConfig } from "payload";
import { LEGACY_TIMEZONE, localParts } from "../lib/marketTime";
import { flushListingViewHash } from "../services/listingViewFlush";

export function previousViewBucket(
	now: Date,
	timezone: string = LEGACY_TIMEZONE,
): string {
	const { year, month, day } = localParts(now, timezone);
	const previousDay = new Date(Date.UTC(year, month - 1, day - 1));
	return `${previousDay.getUTCFullYear()}${String(previousDay.getUTCMonth() + 1).padStart(2, "0")}${String(previousDay.getUTCDate()).padStart(2, "0")}`;
}

export const flushListingViewsTask: TaskConfig<"flushListingViews"> = {
	slug: "flushListingViews",
	retries: 2,
	inputSchema: [],
	schedule: [{ cron: "30 23 * * *", queue: "nightly" }],
	handler: async ({ req }) => {
		const result = await flushListingViewHash(
			req.payload,
			previousViewBucket(new Date()),
		);
		return { output: result };
	},
};
