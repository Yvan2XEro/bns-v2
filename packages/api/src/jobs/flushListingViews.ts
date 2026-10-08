import type { TaskConfig } from "payload";
import { flushListingViewHash } from "../services/listingViewFlush";

export function previousDoualaBucket(now: Date): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Douala",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now);
	const fields = Object.fromEntries(
		parts.map(({ type, value }) => [type, value]),
	);
	const previousDay = new Date(
		Date.UTC(
			Number(fields.year),
			Number(fields.month) - 1,
			Number(fields.day) - 1,
		),
	);
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
			previousDoualaBucket(new Date()),
		);
		return { output: result };
	},
};
