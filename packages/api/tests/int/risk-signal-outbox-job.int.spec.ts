// @vitest-environment node
import { describe, expect, it } from "vitest";

describe("consumeRiskSignalOutbox task", () => {
	it("schedules the consumer every five minutes with the expected task identity", async () => {
		const { consumeRiskSignalOutboxTask } = await import(
			"../../src/jobs/consumeRiskSignalOutbox"
		);
		expect(consumeRiskSignalOutboxTask).toMatchObject({
			slug: "consumeRiskSignalOutbox",
			retries: 2,
			schedule: [{ cron: "*/5 * * * *", queue: "cases" }],
		});
		expect(consumeRiskSignalOutboxTask.handler).toBeTypeOf("function");
	});
});
