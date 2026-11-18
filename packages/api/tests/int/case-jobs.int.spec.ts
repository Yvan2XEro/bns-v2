// @vitest-environment node
import { describe, expect, it } from "vitest";
import configPromise from "../../src/payload.config";

describe("P6 background jobs", () => {
	it("registers case deadlines, review release and evidence retention on the cases queue", async () => {
		const config = await configPromise;
		const jobs = config.jobs?.tasks ?? [];
		const scheduled = new Map(
			jobs.map((job) => [
				String(job.slug),
				(job.schedule ?? []).map(({ cron, queue }) => ({ cron, queue })),
			]),
		);

		expect(scheduled.get("advanceReturnCases")).toEqual([
			{ cron: "0 * * * *", queue: "cases" },
		]);
		expect(scheduled.get("advanceDisputes")).toEqual([
			{ cron: "*/15 * * * *", queue: "cases" },
		]);
		expect(scheduled.get("publishHeldReviews")).toEqual([
			{ cron: "0 * * * *", queue: "cases" },
		]);
		expect(scheduled.get("purgeCaseEvidence")).toEqual([
			{ cron: "30 2 * * *", queue: "cases" },
		]);
		expect(scheduled.get("expireStrikes")).toEqual([
			{ cron: "0 0 * * *", queue: "cases" },
		]);
		expect(
			jobs.filter((job) =>
				[
					"advanceReturnCases",
					"advanceDisputes",
					"publishHeldReviews",
					"purgeCaseEvidence",
					"expireStrikes",
				].includes(String(job.slug)),
			),
		).toHaveLength(5);
		expect(config.jobs?.autoRun).toContainEqual({
			cron: "*/5 * * * *",
			queue: "cases",
			limit: 100,
		});
	});
});
