import { previousDoualaDate } from "./shopDailyAggregation";

function isCalendarDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return (
		!Number.isNaN(parsed.getTime()) &&
		parsed.toISOString().slice(0, 10) === value
	);
}

export function parseShopStatsBackfillStart(args: string[]): string {
	if (args.length !== 1 || !args[0]?.startsWith("--from=")) {
		throw new Error(
			"Usage: bun run backfill:shop-daily-stats --from=YYYY-MM-DD",
		);
	}
	const from = args[0].slice("--from=".length);
	if (!isCalendarDate(from))
		throw new Error("--from must be a valid YYYY-MM-DD date.");
	return from;
}

export function listShopStatsBackfillDates(
	from: string,
	now = new Date(),
): string[] {
	if (!isCalendarDate(from))
		throw new Error("Backfill start must be a valid YYYY-MM-DD date.");
	const through = previousDoualaDate(now);
	if (from > through)
		throw new Error(
			"Backfill start must be on or before the last completed Douala day.",
		);
	const result: string[] = [];
	const cursor = new Date(`${from}T12:00:00.000Z`);
	while (cursor.toISOString().slice(0, 10) <= through) {
		result.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return result;
}
