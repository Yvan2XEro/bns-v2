import { getPayload } from "payload";
import config from "../payload.config";
import { aggregateShopDailyStatsForDay } from "../services/shopDailyAggregation";
import {
	listShopStatsBackfillDates,
	parseShopStatsBackfillStart,
} from "../services/shopDailyStatsBackfill";

try {
	const from = parseShopStatsBackfillStart(process.argv.slice(2));
	const dates = listShopStatsBackfillDates(from);
	const payload = await getPayload({ config });
	for (const date of dates) {
		const result = await aggregateShopDailyStatsForDay(payload, date);
		payload.logger.info({
			msg: "[shop-daily-stats] backfill day complete",
			date,
			...result,
		});
	}
	payload.logger.info({
		msg: "[shop-daily-stats] backfill complete",
		from,
		through: dates.at(-1),
		days: dates.length,
	});
	process.exit(0);
} catch (error) {
	console.error(
		"[shop-daily-stats] backfill failed:",
		error instanceof Error ? error.message : "Unknown error",
	);
	process.exit(1);
}
