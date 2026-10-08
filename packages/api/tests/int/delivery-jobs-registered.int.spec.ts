// @vitest-environment node
import { describe, expect, it } from "vitest";
import configPromise from "../../src/payload.config";

const DELIVERY_SCHEDULES = {
	processCourierWebhookEvent: [],
	pollCourierShipments: [{ cron: "*/15 * * * *", queue: "delivery" }],
	finalizeFailedShipments: [{ cron: "0 * * * *", queue: "hourly" }],
	expirePickupHolds: [{ cron: "0 * * * *", queue: "hourly" }],
	flagLateShipments: [{ cron: "0 * * * *", queue: "hourly" }],
	remindReturns: [{ cron: "30 6 * * *", queue: "nightly" }],
	expireRiderLinks: [{ cron: "45 2 * * *", queue: "nightly" }],
	purgeDeliveryProofs: [{ cron: "15 2 * * *", queue: "nightly" }],
};

describe("delivery job registration", () => {
	it("registers the eight delivery tasks once, each on its queue", async () => {
		const config = await configPromise;
		const tasks = config.jobs?.tasks ?? [];
		const schedules = Object.fromEntries(
			tasks
				.filter((task) => String(task.slug) in DELIVERY_SCHEDULES)
				.map((task) => [
					String(task.slug),
					(task.schedule ?? []).map(({ cron, queue }) => ({ cron, queue })),
				]),
		);
		expect(schedules).toEqual(DELIVERY_SCHEDULES);
		const slugs = tasks.map((task) => String(task.slug));
		expect(slugs.length).toBe(new Set(slugs).size);
	});

	it("drains the delivery queue every fifteen minutes", async () => {
		const config = await configPromise;
		expect(config.jobs?.autoRun).toContainEqual({
			cron: "*/15 * * * *",
			queue: "delivery",
			limit: 50,
		});
	});
});
