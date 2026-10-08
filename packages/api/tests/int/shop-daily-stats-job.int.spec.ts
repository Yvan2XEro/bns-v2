// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	aggregateShopDailyStatsTask,
	lastThreeDoualaDates,
} from "../../src/jobs/aggregateShopDailyStats";

describe("aggregateShopDailyStats task", () => {
	it("selects the three completed Douala days at the nightly run boundary", () => {
		expect(lastThreeDoualaDates(new Date("2026-10-04T23:30:00.000Z"))).toEqual([
			"2026-10-04",
			"2026-10-03",
			"2026-10-02",
		]);
	});

	it("runs once nightly on the nightly queue with one retry", () => {
		expect(aggregateShopDailyStatsTask).toMatchObject({
			slug: "aggregateShopDailyStats",
			retries: 1,
			schedule: [{ cron: "30 23 * * *", queue: "nightly" }],
		});
	});
});
