// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aggregateResponseBuckets } from "../../src/services/shopResponseBursts";

describe("aggregateResponseBuckets", () => {
	it("counts first shop replies into the response-time bucket on the buyer-burst day", () => {
		const result = aggregateResponseBuckets(
			[
				{
					conversationId: "c1",
					senderSide: "buyer",
					createdAt: "2026-10-02T10:00:00.000Z",
				},
				{
					conversationId: "c1",
					senderSide: "shop",
					createdAt: "2026-10-02T10:14:00.000Z",
				},
			],
			"2026-10-02",
			new Date("2026-10-04T12:00:00.000Z"),
		);

		expect(result).toEqual({
			m5: 0,
			m15: 1,
			h1: 0,
			h4: 0,
			h24: 0,
			over24h: 0,
			unanswered: 0,
		});
	});

	it("keeps a late first reply in the burst's start-day over-24-hour bucket", () => {
		const result = aggregateResponseBuckets(
			[
				{
					conversationId: "c1",
					senderSide: "buyer",
					createdAt: "2026-10-02T10:00:00.000Z",
				},
				{
					conversationId: "c1",
					senderSide: "shop",
					createdAt: "2026-10-03T10:01:00.000Z",
				},
			],
			"2026-10-02",
			new Date("2026-10-04T12:00:00.000Z"),
		);

		expect(result.unanswered).toBe(0);
		expect(result.over24h).toBe(1);
	});

	it("counts unreplied bursts only after the full 24-hour window", () => {
		const beforeDeadline = aggregateResponseBuckets(
			[
				{
					conversationId: "c1",
					senderSide: "buyer",
					createdAt: "2026-10-03T10:00:00.000Z",
				},
			],
			"2026-10-03",
			new Date("2026-10-04T09:59:59.999Z"),
		);
		const afterDeadline = aggregateResponseBuckets(
			[
				{
					conversationId: "c1",
					senderSide: "buyer",
					createdAt: "2026-10-03T10:00:00.000Z",
				},
			],
			"2026-10-03",
			new Date("2026-10-04T10:00:00.000Z"),
		);

		expect(beforeDeadline.unanswered).toBe(0);
		expect(afterDeadline.unanswered).toBe(1);
	});
});
