// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	flushListingViewsTask,
	previousDoualaBucket,
} from "../../src/jobs/flushListingViews";

describe("listing view flush task", () => {
	it("flushes the just-ended Douala day at 23:30 UTC", () => {
		expect(previousDoualaBucket(new Date("2026-10-04T23:30:00.000Z"))).toBe(
			"20261004",
		);
		expect(flushListingViewsTask.schedule).toEqual([
			{ cron: "30 23 * * *", queue: "nightly" },
		]);
	});
});
