import type { TaskConfig } from "payload";
import { flushListingViewHash } from "../services/listingViewFlush";
import {
	aggregateShopDailyStatsForDay,
	doualaDayWindow,
} from "../services/shopDailyAggregation";

function doualaDate(now: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Douala",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

export function lastThreeDoualaDates(now: Date): string[] {
	const previous = new Date(`${doualaDate(now)}T12:00:00.000Z`);
	previous.setUTCDate(previous.getUTCDate() - 1);
	return [0, 1, 2].map((daysAgo) => {
		const day = new Date(previous);
		day.setUTCDate(day.getUTCDate() - daysAgo);
		return day.toISOString().slice(0, 10);
	});
}

export const aggregateShopDailyStatsTask: TaskConfig<"aggregateShopDailyStats"> =
	{
		slug: "aggregateShopDailyStats",
		retries: 1,
		inputSchema: [],
		schedule: [{ cron: "30 23 * * *", queue: "nightly" }],
		handler: async ({ req }) => {
			const startedAt = Date.now();
			const now = new Date();
			const dates = lastThreeDoualaDates(now);
			const currentDate = dates[0];
			if (!currentDate)
				throw new Error("No Douala date available for shop stats.");
			const { start } = doualaDayWindow(currentDate);
			const viewFlush = await flushListingViewHash(
				req.payload,
				currentDate.replaceAll("-", ""),
			);
			const daily = [];
			for (const date of dates) {
				daily.push(
					await aggregateShopDailyStatsForDay(req.payload, date, { now }),
				);
			}
			const output = {
				date: currentDate,
				windowStartedAt: start.toISOString(),
				viewFlush,
				daily,
				durationMs: Date.now() - startedAt,
			};
			req.payload.logger.info({
				msg: "[shop-daily-stats] aggregation complete",
				...output,
			});
			return { output };
		},
	};
