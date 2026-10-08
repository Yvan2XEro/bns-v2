// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	up as migrateRiskFlagIndex,
	OPEN_RISK_FLAG_INDEX,
} from "../../src/migrations/20261004_000100_p9_risk_flags";
import { recordRiskSignal } from "../../src/services/risk";
import { fakePayload } from "./helpers/fakePayload";

afterEach(() => vi.unstubAllEnvs());

function world(enabled: boolean) {
	return fakePayload(
		{ "risk-flags": [] },
		{
			globals: {
				"app-settings": {
					risk: { enabled, autoEffectsEnabled: false, newLimitsEnabled: false },
				},
			},
		},
	);
}

describe("risk signal recording", () => {
	it("escalates and cross-links a shop signal when its owner already has high risk", async () => {
		const payload = fakePayload(
			{
				shops: [
					{
						id: "shop-1",
						owner: "owner-1",
						status: "active",
						level: 2,
					},
				],
				"risk-flags": [
					{
						id: "owner-flag",
						subjectType: "user",
						subjectKey: "owner-1",
						signal: "identity.duplicate_document",
						score: 80,
						severity: "high",
						status: "open",
						related: [],
					},
				],
			},
			{ globals: { "app-settings": { risk: { enabled: true } } } },
		);
		const shopFlag = await recordRiskSignal(payload, {
			subjectType: "shop",
			subjectId: "shop-1",
			signal: "resale.handover_at_supplier",
			evidence: { distanceMeters: 120 },
		});

		expect(shopFlag?.severity).toBe("high");
		expect(shopFlag?.related).toContain("owner-flag");
		expect(payload.store["risk-flags"]?.[0]?.related).toContain(shopFlag?.id);
	});

	it("escalates an existing low-score shop flag when its owner becomes high risk", async () => {
		const payload = fakePayload(
			{
				shops: [{ id: "shop-1", owner: "owner-1", status: "active", level: 2 }],
				"risk-flags": [],
			},
			{ globals: { "app-settings": { risk: { enabled: true } } } },
		);
		const shopFlag = await recordRiskSignal(payload, {
			subjectType: "shop",
			subjectId: "shop-1",
			signal: "resale.handover_at_supplier",
			evidence: { distanceMeters: 120 },
		});
		const ownerFlag = await recordRiskSignal(payload, {
			subjectType: "user",
			subjectId: "owner-1",
			signal: "identity.duplicate_document",
			evidence: { requestId: "request-1" },
		});
		const escalatedShopFlag = payload.store["risk-flags"]?.find(
			(flag) => flag.id === shopFlag?.id,
		);

		expect(shopFlag?.score).toBe(55);
		expect(escalatedShopFlag?.severity).toBe("high");
		expect(escalatedShopFlag?.related).toContain(ownerFlag?.id);
		expect(ownerFlag?.related).toContain(shopFlag?.id);
	});

	it("creates the partial unique index for one open flag per subject and signal", async () => {
		const created: Array<{ keys: unknown; options: unknown }> = [];
		const payload = {
			logger: { info: vi.fn(), error: vi.fn() },
			db: {
				collections: {
					"risk-flags": {
						collection: {
							createIndex: vi.fn(async (keys: unknown, options: unknown) => {
								created.push({ keys, options });
								return OPEN_RISK_FLAG_INDEX;
							}),
							dropIndex: vi.fn(),
						},
					},
				},
			},
		};
		await migrateRiskFlagIndex({ payload } as unknown as Parameters<
			typeof migrateRiskFlagIndex
		>[0]);

		expect(created).toEqual([
			{
				keys: { subjectType: 1, subjectKey: 1, signal: 1 },
				options: {
					unique: true,
					name: OPEN_RISK_FLAG_INDEX,
					partialFilterExpression: { status: "open" },
				},
			},
		]);
	});

	it("keeps risk data off until the feature flag is enabled", async () => {
		const payload = world(false);
		const result = await recordRiskSignal(payload, {
			subjectType: "shop",
			subjectId: "shop-1",
			signal: "orders.dispute_ratio",
			evidence: { deliveredOrders: 20, lostDisputes: 2 },
		});

		expect(result).toBeNull();
		expect(payload.store["risk-flags"]).toHaveLength(0);
	});

	it("applies a traceable 72-hour payout hold only when automatic effects are enabled", async () => {
		const payload = fakePayload(
			{
				shops: [{ id: "shop-1", owner: "owner-1", status: "active", level: 2 }],
				"risk-flags": [],
				"payout-holds": [],
			},
			{
				globals: {
					"app-settings": {
						risk: { enabled: true, autoEffectsEnabled: true },
					},
				},
			},
		);
		const result = await recordRiskSignal(
			payload,
			{
				subjectType: "shop",
				subjectId: "shop-1",
				signal: "velocity.payout_account_changes",
				evidence: { changesInWindow: 3 },
			},
			new Date("2026-10-04T12:00:00.000Z"),
		);

		expect(result?.autoEffects).toContain("payout_hold");
		expect(payload.store["payout-holds"]).toHaveLength(1);
		expect(payload.store["payout-holds"]?.[0]).toMatchObject({
			scope: "shop",
			shop: "shop-1",
			reason: "fraud_signal",
			blocksCharges: true,
			status: "active",
			until: "2026-10-07T12:00:00.000Z",
			createdByType: "system",
			note: `risk-flag:${result?.id}`,
		});
	});

	it("records risk without applying payout holds when automatic effects are disabled", async () => {
		const payload = fakePayload(
			{
				shops: [{ id: "shop-1", owner: "owner-1", status: "active", level: 2 }],
				"risk-flags": [],
				"payout-holds": [],
			},
			{
				globals: {
					"app-settings": {
						risk: { enabled: true, autoEffectsEnabled: false },
					},
				},
			},
		);
		const result = await recordRiskSignal(payload, {
			subjectType: "shop",
			subjectId: "shop-1",
			signal: "velocity.payout_account_changes",
			evidence: { changesInWindow: 3 },
		});

		expect(result?.signal).toBe("velocity.payout_account_changes");
		expect(payload.store["risk-flags"]).toHaveLength(1);
		expect(payload.store["payout-holds"]).toHaveLength(0);
	});

	it("hashes phone subjects and updates an open flag idempotently", async () => {
		vi.stubEnv(
			"RISK_HASH_SECRET",
			"a-secure-test-secret-that-is-at-least-32-chars",
		);
		const payload = world(true);
		const input = {
			subjectType: "phone" as const,
			subjectId: "+237699123456",
			signal: "cod.refusal_streak" as const,
			evidence: { refusedDeliveries: 3, windowDays: 30 },
		};
		const first = await recordRiskSignal(
			payload,
			input,
			new Date("2026-10-01T00:00:00.000Z"),
		);
		const replay = await recordRiskSignal(
			payload,
			input,
			new Date("2026-10-02T00:00:00.000Z"),
		);

		expect(payload.store["risk-flags"]).toHaveLength(1);
		expect(first?.subjectKey).not.toBe(input.subjectId);
		expect(first?.subjectLabel).not.toContain("699123456");
		expect(replay).toMatchObject({
			id: first?.id,
			score: 55,
			severity: "medium",
			occurrences: 2,
		});
	});

	it("refuses unhashed phone persistence when the hashing secret is missing", async () => {
		const payload = world(true);
		await expect(
			recordRiskSignal(payload, {
				subjectType: "phone",
				subjectId: "+237699123456",
				signal: "cod.refusal_streak",
				evidence: { refusedDeliveries: 3 },
			}),
		).rejects.toThrow("RISK_HASH_SECRET");
		expect(payload.store["risk-flags"]).toHaveLength(0);
	});

	it("removes direct identifiers and document material from stored evidence", async () => {
		const payload = world(true);
		const result = await recordRiskSignal(payload, {
			subjectType: "shop",
			subjectId: "shop-1",
			signal: "orders.dispute_ratio",
			evidence: {
				deliveredOrders: 20,
				lostDisputes: 2,
				buyerPhone: "+237699123456",
				personName: "A full name",
				documentImage: "private-image-reference",
				relatedOrderIds: ["order-1"],
			},
		});

		expect(result?.evidence).toEqual({
			deliveredOrders: 20,
			lostDisputes: 2,
			relatedOrderIds: ["order-1"],
		});
	});

	it("recovers from a concurrent open-flag insert using the unique index", async () => {
		const payload = world(true);
		const create = payload.create.bind(payload);
		let insertedByConcurrentCall = false;
		payload.create = async (args) => {
			if (args.collection === "risk-flags" && !insertedByConcurrentCall) {
				insertedByConcurrentCall = true;
				await create(args);
				throw Object.assign(new Error("duplicate key"), { code: 11000 });
			}
			return create(args);
		};

		const result = await recordRiskSignal(payload, {
			subjectType: "shop",
			subjectId: "shop-1",
			signal: "orders.dispute_ratio",
			evidence: { deliveredOrders: 20, lostDisputes: 2 },
		});

		expect(payload.store["risk-flags"]).toHaveLength(1);
		expect(result).toMatchObject({ occurrences: 2, score: 60 });
	});
});
