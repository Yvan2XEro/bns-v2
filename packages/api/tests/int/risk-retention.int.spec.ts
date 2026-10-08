// @vitest-environment node
import { describe, expect, it } from "vitest";
import configPromise from "../../src/payload.config";
import {
	purgeRiskData,
	riskFlagRetentionDate,
} from "../../src/services/riskRetention";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-05T03:30:00.000Z");

describe("risk flag retention dates", () => {
	it("registers the daily risk retention task at 03:30 UTC", async () => {
		const config = await configPromise;
		const task = config.jobs?.tasks?.find(
			(candidate) => candidate.slug === "purgeRiskData",
		);
		expect(task?.schedule).toEqual([{ cron: "30 3 * * *", queue: "nightly" }]);
	});

	it("uses the documented dismissal, review, and actioned windows", () => {
		expect(riskFlagRetentionDate("dismissed", NOW)).toBe(
			"2027-01-03T03:30:00.000Z",
		);
		expect(riskFlagRetentionDate("reviewed", NOW)).toBe(
			"2027-10-05T03:30:00.000Z",
		);
		expect(riskFlagRetentionDate("actioned", NOW)).toBe(
			"2029-10-05T03:30:00.000Z",
		);
		expect(riskFlagRetentionDate("open", NOW)).toBeNull();
	});
});

describe("risk data retention", () => {
	it("deletes dismissed and reviewed flags at their purge boundary", async () => {
		const api = fakePayload({
			"risk-flags": [
				{
					id: "dismissed-due",
					status: "dismissed",
					purgeAt: NOW.toISOString(),
				},
				{
					id: "reviewed-due",
					status: "reviewed",
					purgeAt: new Date(NOW.getTime() - 1).toISOString(),
				},
				{
					id: "not-due",
					status: "dismissed",
					purgeAt: new Date(NOW.getTime() + 1).toISOString(),
				},
			],
		});

		const result = await purgeRiskData(api, NOW);

		expect(result.deletedFlags).toBe(2);
		expect(api.store["risk-flags"]?.map((flag) => flag.id)).toEqual([
			"not-due",
		]);
	});

	it("redacts actioned evidence at three years and closes stale open flags", async () => {
		const old = new Date(NOW.getTime() - 180 * 86_400_000).toISOString();
		const api = fakePayload({
			"risk-flags": [
				{
					id: "actioned-due",
					status: "actioned",
					purgeAt: NOW.toISOString(),
					signal: "identity.duplicate_document",
					score: 82,
					evidence: { count: 2, documentNumber: "secret" },
					subjectLabel: "Private user",
				},
				{
					id: "stale-open",
					status: "open",
					lastSeenAt: old,
				},
				{
					id: "recent-open",
					status: "open",
					lastSeenAt: NOW.toISOString(),
				},
			],
		});

		const result = await purgeRiskData(api, NOW);

		expect(result.redactedFlags).toBe(1);
		expect(
			api.store["risk-flags"]?.find((flag) => flag.id === "actioned-due"),
		).toMatchObject({
			evidence: { signal: "identity.duplicate_document", score: 82 },
			subjectLabel: null,
		});
		expect(
			api.store["risk-flags"]?.find((flag) => flag.id === "stale-open"),
		).toMatchObject({ status: "dismissed", resolution: "none" });
		expect(
			api.store["risk-flags"]?.find((flag) => flag.id === "recent-open")
				?.status,
		).toBe("open");
	});

	it("removes shop daily statistics older than 25 calendar months", async () => {
		const api = fakePayload({
			"shop-daily-stats": [
				{ id: "old", date: "2024-09-04", shop: "shop-1" },
				{ id: "boundary", date: "2024-09-05", shop: "shop-1" },
				{ id: "recent", date: "2026-10-04", shop: "shop-1" },
			],
		});

		const result = await purgeRiskData(api, NOW);

		expect(result.deletedDailyStats).toBe(1);
		expect(api.store["shop-daily-stats"]?.map((row) => row.id)).toEqual([
			"boundary",
			"recent",
		]);
	});

	it("continues through every page of expired shop statistics", async () => {
		const api = fakePayload({
			"shop-daily-stats": Array.from({ length: 205 }, (_, index) => ({
				id: `old-${index}`,
				date: "2024-09-04",
				shop: "shop-1",
			})),
		});

		const result = await purgeRiskData(api, NOW);

		expect(result.deletedDailyStats).toBe(205);
		expect(api.store["shop-daily-stats"]).toHaveLength(0);
	});
});
