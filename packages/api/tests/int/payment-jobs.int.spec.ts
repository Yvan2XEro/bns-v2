// @vitest-environment node
import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";
import type { RefundSubmissionQueue } from "../../src/services/refunds";

// Records what the config hands the refund seam, and still registers it.
const { registered } = vi.hoisted(() => ({
	registered: [] as RefundSubmissionQueue[],
}));

vi.mock("../../src/services/refunds", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../src/services/refunds")>();
	return {
		...actual,
		registerRefundSubmissionQueue: (queue: RefundSubmissionQueue) => {
			registered.push(queue);
			return actual.registerRefundSubmissionQueue(queue);
		},
	};
});

import configPromise from "../../src/payload.config";

const P5_SCHEDULES = {
	submitRefund: [],
	// Payload's scheduler reads crons in the server's zone, UTC in the api
	// image; Africa/Douala is UTC+1 all year.
	syncConnectedAccount: [{ cron: "0 */6 * * *", queue: "payments" }],
	releaseEligibleFunds: [{ cron: "0 9 * * *", queue: "payments" }], // 10:00 Douala
	expirePayoutHolds: [{ cron: "*/15 * * * *", queue: "payments" }],
	recoverSellerReceivables: [{ cron: "0 2 * * *", queue: "payments" }], // 03:00 Douala
	reconcileLedger: [{ cron: "30 1 * * *", queue: "payments" }], // 02:30 Douala
	sweepBuyerFeeInvoices: [{ cron: "0 * * * *", queue: "payments" }],
};

describe("payment job registration", () => {
	it("every P5 job is registered in payload.config.ts with its queue", async () => {
		const config = await configPromise;
		const tasks = config.jobs?.tasks ?? [];
		const schedules = Object.fromEntries(
			tasks
				.filter((task) => String(task.slug) in P5_SCHEDULES)
				.map((task) => [
					String(task.slug),
					(task.schedule ?? []).map(({ cron, queue }) => ({ cron, queue })),
				]),
		);

		expect(schedules).toEqual(P5_SCHEDULES);

		// Every scheduled slug appears once: a duplicate registration would
		// schedule the job twice.
		const slugs = tasks.map((task) => String(task.slug));
		expect(slugs.length).toBe(new Set(slugs).size);

		const autoRun = Array.isArray(config.jobs?.autoRun)
			? config.jobs.autoRun
			: [];
		expect(autoRun.filter((row) => row.queue === "payments")).toEqual([
			{ cron: "* * * * *", queue: "payments", limit: 50 },
		]);
	});

	it("queues submitRefund on the payments queue through the refund seam", async () => {
		await configPromise;
		expect(registered).toHaveLength(1);

		const queue = vi.fn(async () => ({ id: "job-1" }));
		const payload = { jobs: { queue } } as unknown as Payload;
		const waitUntil = new Date("2026-10-03T11:00:00.000Z");

		await registered[0](payload, { refundId: "r-1", waitUntil });
		await registered[0](payload, { refundId: "r-2" });

		expect(queue.mock.calls).toEqual([
			[
				{
					task: "submitRefund",
					queue: "payments",
					input: { refundId: "r-1" },
					waitUntil,
				},
			],
			[
				{
					task: "submitRefund",
					queue: "payments",
					input: { refundId: "r-2" },
					waitUntil: undefined,
				},
			],
		]);
	});
});
