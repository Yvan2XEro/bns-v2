// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeRiskSignalOutbox } from "../../src/services/riskSignalOutbox";
import { fakePayload } from "./helpers/fakePayload";

afterEach(() => vi.unstubAllEnvs());

function api(outbox: Record<string, unknown>[]) {
	return fakePayload(
		{
			"risk-signal-outbox": outbox,
			"risk-flags": [],
		},
		{
			uniques: { "risk-flags": [["subjectType", "subjectKey", "signal"]] },
			globals: {
				"app-settings": {
					risk: { enabled: true, autoEffectsEnabled: false },
				},
			},
		},
	);
}

const pendingSignal = {
	id: "outbox-1",
	subjectType: "shop",
	subjectId: "shop-1",
	signal: "dispute_lost_seller",
	severity: "high",
	sourceType: "dispute",
	sourceId: "dispute-1",
	occurredAt: "2026-10-04T10:00:00.000Z",
	consumedAt: null,
};

describe("risk signal outbox consumer", () => {
	it("records and consumes each signal once, including on job retries", async () => {
		const payload = api([
			pendingSignal,
			{
				...pendingSignal,
				id: "outbox-old",
				consumedAt: "2026-10-03T00:00:00.000Z",
			},
		]);

		const first = await consumeRiskSignalOutbox(payload);
		const replay = await consumeRiskSignalOutbox(payload);

		expect(first).toEqual({ consumed: 1 });
		expect(replay).toEqual({ consumed: 0 });
		expect(payload.store["risk-signal-outbox"]?.[0]?.consumedAt).toEqual(
			expect.any(String),
		);
		expect(payload.store["risk-flags"]).toHaveLength(1);
		expect(payload.store["risk-flags"]?.[0]).toMatchObject({
			subjectType: "shop",
			subjectKey: "shop-1",
			signal: "dispute_lost_seller",
			score: 75,
			occurrences: 1,
			evidence: {
				outboxId: "outbox-1",
				sourceType: "dispute",
				sourceId: "dispute-1",
			},
		});
	});

	it("does not count the same event twice when consumers race", async () => {
		const payload = api([pendingSignal]);
		const results = await Promise.all([
			consumeRiskSignalOutbox(payload),
			consumeRiskSignalOutbox(payload),
		]);

		expect(results.reduce((total, result) => total + result.consumed, 0)).toBe(
			1,
		);
		expect(payload.store["risk-flags"]).toHaveLength(1);
		expect(payload.store["risk-flags"]?.[0]?.occurrences).toBe(1);
	});

	it("leaves a failed signal unconsumed so the task can retry it", async () => {
		vi.stubEnv("RISK_HASH_SECRET", "");
		const payload = api([
			{
				...pendingSignal,
				subjectType: "phone",
				subjectId: "+237699123456",
			},
		]);

		await expect(consumeRiskSignalOutbox(payload)).rejects.toThrow(
			"RISK_HASH_SECRET",
		);
		expect(payload.store["risk-signal-outbox"]?.[0]?.consumedAt).toBeNull();
		expect(payload.store["risk-flags"]).toHaveLength(0);
	});
});
