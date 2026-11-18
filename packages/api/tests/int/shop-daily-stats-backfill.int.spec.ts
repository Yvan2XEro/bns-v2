// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	listShopStatsBackfillDates,
	parseShopStatsBackfillStart,
} from "../../src/services/shopDailyStatsBackfill";

describe("shop daily stats backfill arguments", () => {
	it("requires exactly one valid --from date", () => {
		expect(parseShopStatsBackfillStart(["--from=2026-10-01"])).toBe(
			"2026-10-01",
		);
		expect(() => parseShopStatsBackfillStart([])).toThrow();
		expect(() => parseShopStatsBackfillStart(["--from=2026-02-30"])).toThrow();
		expect(() =>
			parseShopStatsBackfillStart(["--from=2026-10-01", "--from=2026-10-02"]),
		).toThrow();
	});

	it("enumerates Douala dates inclusively through yesterday and refuses future starts", () => {
		const now = new Date("2026-10-05T00:30:00.000+01:00");
		expect(listShopStatsBackfillDates("2026-10-02", now)).toEqual([
			"2026-10-02",
			"2026-10-03",
			"2026-10-04",
		]);
		expect(() => listShopStatsBackfillDates("2026-10-05", now)).toThrow();
	});
});
