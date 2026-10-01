import { describe, expect, it } from "vitest";
import {
	purgeShopActivity,
	purgeShopActivityTask,
	SHOP_ACTIVITY_RETENTION_MONTHS,
} from "../../src/jobs/purgeShopActivity";
import { ACTIVITY_PAGE_SIZE } from "../../src/services/shopActivity";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-01T00:00:00.000Z");

function seed(createdAts: string[]) {
	return fakePayload({
		"shop-activity-log": createdAts.map((createdAt, index) => ({
			id: `a-${index}`,
			shop: "s-1",
			actor: "u-owner",
			actorRole: "owner",
			action: "product.updated",
			targetType: "product",
			targetId: "p-1",
			metadata: null,
			createdAt,
		})),
	});
}

describe("purgeShopActivity", () => {
	it("keeps twenty-four months and deletes what is older", async () => {
		expect(SHOP_ACTIVITY_RETENTION_MONTHS).toBe(24);
		const payload = seed([
			"2024-09-30T23:59:59.000Z", // 25 months ago: goes
			"2024-10-01T00:00:01.000Z", // just inside 24 months: stays
			"2026-09-30T00:00:00.000Z", // yesterday: stays
		]);
		const result = await purgeShopActivity(payload, NOW);
		expect(result).toEqual({ deleted: 1 });
		expect(payload.store["shop-activity-log"].map((e) => e.id)).toEqual([
			"a-1",
			"a-2",
		]);
	});

	it("deletes nothing when everything is inside the window", async () => {
		const payload = seed(["2026-01-01T00:00:00.000Z"]);
		const result = await purgeShopActivity(payload, NOW);
		expect(result).toEqual({ deleted: 0 });
	});

	it("runs monthly on the nightly queue", () => {
		expect(purgeShopActivityTask.slug).toBe("purgeShopActivity");
		expect(purgeShopActivityTask.schedule).toEqual([
			{ cron: "0 4 1 * *", queue: "nightly" },
		]);
	});

	it("survives an empty collection", async () => {
		const payload = fakePayload({});
		const result = await purgeShopActivity(payload, NOW);
		expect(result).toEqual({ deleted: 0 });
	});

	it("does not stop the run when one row's delete fails", async () => {
		// a-0, a-1 and a-2 are all stale; a-1's delete is forced to fail the way
		// a dangling reference or a transient store error would in production.
		const payload = seed([
			"2024-01-01T00:00:00.000Z",
			"2024-01-02T00:00:00.000Z",
			"2024-01-03T00:00:00.000Z",
		]);
		payload.failWhen = (method, args) =>
			method === "delete" &&
			args.collection === "shop-activity-log" &&
			args.id === "a-1";

		const result = await purgeShopActivity(payload, NOW);

		expect(result).toEqual({ deleted: 2 });
		expect(payload.logger.error).toHaveBeenCalled();
		// The failing row is still there; the other two stale rows are gone.
		expect(payload.store["shop-activity-log"].map((e) => e.id)).toEqual([
			"a-1",
		]);
	});

	it("fully processes a dataset larger than one page", async () => {
		const staleCount = ACTIVITY_PAGE_SIZE + 5;
		const createdAts = [
			...Array.from({ length: staleCount }, (_, i) =>
				new Date(2020, 0, 1 + i).toISOString(),
			),
			// Two rows inside the retention window: must survive the purge.
			"2026-09-15T00:00:00.000Z",
			"2026-09-20T00:00:00.000Z",
		];
		const payload = seed(createdAts);

		const result = await purgeShopActivity(payload, NOW);

		expect(result).toEqual({ deleted: staleCount });
		expect(payload.store["shop-activity-log"]).toHaveLength(2);
		// More than one page was fetched: a single unbounded query (`limit: 0,
		// pagination: false`) would show up here as exactly one read.
		const reads = payload.reads.filter(
			(r) => r.collection === "shop-activity-log",
		);
		expect(reads.length).toBeGreaterThan(1);
	});

	it("never records an activity entry about purging shop-activity-log", async () => {
		const payload = seed([
			"2024-01-01T00:00:00.000Z",
			"2024-01-02T00:00:00.000Z",
		]);
		await purgeShopActivity(payload, NOW);
		const selfLogged = payload.writes.filter(
			(w) => w.op === "create" && w.collection === "shop-activity-log",
		);
		expect(selfLogged).toEqual([]);
	});
});
