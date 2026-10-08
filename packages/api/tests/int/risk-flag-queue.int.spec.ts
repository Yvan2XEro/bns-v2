// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	getRiskFlagQueue,
	isRiskFlagCursorValid,
} from "../../src/services/riskFlagQueue";
import { fakePayload } from "./helpers/fakePayload";

function flag(id: string, score: number, severity: "high" | "medium" | "low") {
	return {
		id,
		subjectType: "shop",
		subjectKey: `shop-${id}`,
		signal: "orders.dispute_ratio",
		score,
		severity,
		status: "open",
		evidence: {},
		firstSeenAt: "2026-10-01T00:00:00.000Z",
		lastSeenAt: new Date(
			Date.UTC(2026, 9, 1, 0, Number(id.slice(1))),
		).toISOString(),
	};
}

describe("risk flag moderation queue", () => {
	it("returns only the safe queue projection, never hashes or evidence payloads", async () => {
		const payload = fakePayload({
			"risk-flags": [
				{
					...flag("f1", 80, "high"),
					subjectLabel: "Phone •••• 1234",
					evidence: { rawHash: "secret-hash", refusedDeliveries: 3 },
				},
			],
		});

		const result = await getRiskFlagQueue(payload);
		const item = result.items[0];
		expect(item).toMatchObject({
			id: "f1",
			subjectType: "shop",
			subjectLabel: "Phone •••• 1234",
			signal: "orders.dispute_ratio",
			severity: "high",
			score: 80,
		});
		expect(item).not.toHaveProperty("subjectKey");
		expect(item).not.toHaveProperty("evidence");
	});

	it("prioritizes severity, then score and recency, with a stable cursor", async () => {
		const payload = fakePayload({
			"risk-flags": [
				flag("f1", 72, "high"),
				flag("f2", 95, "high"),
				flag("f3", 99, "medium"),
				...Array.from({ length: 50 }, (_, index) =>
					flag(`f${index + 4}`, 70, "high"),
				),
			],
		});
		const first = await getRiskFlagQueue(payload);

		expect(first.items).toHaveLength(50);
		expect(first.items.slice(0, 2).map((item) => item.id)).toEqual([
			"f2",
			"f1",
		]);
		expect(first.hasMore).toBe(true);
		expect(isRiskFlagCursorValid(first.nextCursor ?? undefined)).toBe(true);

		const second = await getRiskFlagQueue(payload, {
			cursor: first.nextCursor ?? undefined,
		});
		expect(second.items.length).toBeGreaterThan(0);
		expect(
			second.items.some((item) =>
				first.items.some((firstItem) => firstItem.id === item.id),
			),
		).toBe(false);
	});

	it("filters the open queue by severity, signal and subject type", async () => {
		const payload = fakePayload({
			"risk-flags": [
				flag("f1", 80, "high"),
				{
					...flag("f2", 55, "medium"),
					subjectType: "user",
					signal: "identity.duplicate_document",
				},
				{ ...flag("f3", 90, "high"), status: "dismissed" },
			],
		});
		const result = await getRiskFlagQueue(payload, {
			severity: "medium",
			signal: "identity.duplicate_document",
			subjectType: "user",
		});

		expect(result.items.map((item) => item.id)).toEqual(["f2"]);
		expect(result.hasMore).toBe(false);
		expect(result.nextCursor).toBeNull();
	});

	it("rejects malformed cursors before they reach database queries", async () => {
		const payload = fakePayload();
		expect(isRiskFlagCursorValid("not-base64-json")).toBe(false);
		await expect(
			getRiskFlagQueue(payload, { cursor: "not-base64-json" }),
		).rejects.toThrow("Invalid risk flag cursor");
		expect(payload.reads).toHaveLength(0);
	});
});
