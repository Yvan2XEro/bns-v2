// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { RISK_OUTBOX_SIGNALS } from "../../src/collections/RiskSignalOutbox";
import { SHOP_STRIKE_KINDS } from "../../src/collections/ShopStrikes";
import { withTransaction } from "../../src/lib/transactions";
import {
	recordRiskSignal,
	riskSignalSeverity,
} from "../../src/services/riskSignals";
import {
	addStrike,
	expireStrikes,
	shopStanding,
	strikeWeight,
} from "../../src/services/strikes";
import { type Doc, fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/services/caseNotifications", () => ({
	notifyShopStrikeAdded: vi.fn(async () => undefined),
}));

const NOW = new Date("2026-10-04T10:00:00.000Z");
const G4 = { gate: "G4", evidence: "gate-evidence", note: "Approved terms" };

function seed(extra: Record<string, Doc[]> = {}, enabled = true) {
	return fakePayload(
		{ "shop-strikes": [], "risk-signal-outbox": [], ...extra },
		{
			globals: {
				"app-settings": {
					disputes: {
						strikeEffectsEnabled: enabled,
						gates: enabled ? [G4] : [],
					},
				},
			},
		},
	);
}

describe("P6 shop strikes", () => {
	it("assigns the exact policy weight to every strike kind", () => {
		expect(SHOP_STRIKE_KINDS.map((kind) => [kind, strikeWeight(kind)])).toEqual(
			[
				["dispute_lost", 1],
				["refund_overdue", 2],
				["counterfeit_confirmed", 3],
				["no_response", 1],
				["unavailable_after_confirmation", 1],
				["review_extortion", 2],
			],
		);
	});

	it("records a source once and expires a strike at the exact 180-day boundary", async () => {
		const payload = seed();
		const first = await withTransaction(payload, (req) =>
			addStrike(
				req,
				{
					shop: "s-1",
					kind: "refund_overdue",
					sourceType: "return-case",
					sourceId: "r-1",
				},
				NOW,
			),
		);
		const replay = await withTransaction(payload, (req) =>
			addStrike(
				req,
				{
					shop: "s-1",
					kind: "refund_overdue",
					sourceType: "return-case",
					sourceId: "r-1",
				},
				new Date(NOW.getTime() + 1000),
			),
		);
		expect(replay.id).toBe(first.id);
		expect(payload.store["shop-strikes"]).toHaveLength(1);
		expect(first.expiresAt).toBe(
			new Date(NOW.getTime() + 180 * 86_400_000).toISOString(),
		);
		expect(
			await expireStrikes(
				payload,
				new Date(Date.parse(first.expiresAt ?? "") - 1),
			),
		).toEqual({ expired: [] });
		expect(
			await expireStrikes(payload, new Date(first.expiresAt ?? "")),
		).toEqual({ expired: [first.id] });
		expect(
			await expireStrikes(payload, new Date(first.expiresAt ?? "")),
		).toEqual({ expired: [] });
		const renewed = await withTransaction(payload, (req) =>
			addStrike(
				req,
				{
					shop: "s-1",
					kind: "refund_overdue",
					sourceType: "return-case",
					sourceId: "r-1",
				},
				new Date(first.expiresAt ?? ""),
			),
		);
		expect(renewed.id).not.toBe(first.id);
		expect(payload.store["shop-strikes"]).toHaveLength(2);
	});

	it("sums active weights and keeps effects inert without a cleared G4 gate", async () => {
		const payload = seed(
			{
				"shop-strikes": [
					{
						id: "a",
						shop: "s-1",
						kind: "refund_overdue",
						weight: 2,
						status: "active",
						expiresAt: "2026-12-01",
						sourceType: "dispute",
						sourceId: "d-1",
						createdAt: "2026-10-01",
					},
					{
						id: "b",
						shop: "s-1",
						kind: "dispute_lost",
						weight: 1,
						status: "active",
						expiresAt: "2026-12-01",
						sourceType: "dispute",
						sourceId: "d-2",
						createdAt: "2026-10-02",
					},
					{
						id: "c",
						shop: "s-1",
						kind: "counterfeit_confirmed",
						weight: 3,
						status: "revoked",
						expiresAt: "2026-12-01",
						sourceType: "dispute",
						sourceId: "d-3",
						createdAt: "2026-10-03",
					},
				],
			},
			false,
		);
		expect(await shopStanding(payload, "s-1", NOW)).toEqual({
			activeWeight: 3,
			effectsEnabled: false,
			restrictions: {
				codCapHalved: false,
				protectedCapHalved: false,
				protectedUnavailable: false,
			},
			strikes: expect.arrayContaining([
				expect.objectContaining({ id: "a", status: "active", weight: 2 }),
				expect.objectContaining({ id: "b", status: "active", weight: 1 }),
				expect.objectContaining({ id: "c", status: "revoked", weight: 3 }),
			]),
		});
	});

	it("applies each standing threshold only when G4 and the feature flag are active", async () => {
		const strikes: Doc[] = [
			{
				id: "a",
				shop: "s-1",
				kind: "counterfeit_confirmed",
				weight: 3,
				status: "active",
				expiresAt: "2026-12-01",
				sourceType: "dispute",
				sourceId: "d-1",
				createdAt: "2026-10-01",
			},
			{
				id: "b",
				shop: "s-1",
				kind: "refund_overdue",
				weight: 2,
				status: "active",
				expiresAt: "2026-12-01",
				sourceType: "return-case",
				sourceId: "r-1",
				createdAt: "2026-10-02",
			},
		];
		const gated = await shopStanding(
			seed({ "shop-strikes": strikes }),
			"s-1",
			NOW,
		);
		const disabled = await shopStanding(
			seed({ "shop-strikes": strikes }, false),
			"s-1",
			NOW,
		);
		expect(gated).toMatchObject({
			activeWeight: 5,
			effectsEnabled: true,
			restrictions: {
				codCapHalved: true,
				protectedCapHalved: true,
				protectedUnavailable: true,
			},
		});
		expect(disabled.restrictions).toEqual({
			codCapHalved: false,
			protectedCapHalved: false,
			protectedUnavailable: false,
		});
	});
});

describe("P6 risk-signal outbox", () => {
	it("has a declared severity for each supported signal", () => {
		expect(
			RISK_OUTBOX_SIGNALS.map((signal) => [signal, riskSignalSeverity(signal)]),
		).toEqual([
			["dispute_lost_seller", "medium"],
			["counterfeit_confirmed", "high"],
			["refund_overdue", "high"],
			["seller_no_response", "low"],
			["unavailable_after_confirmation", "low"],
			["dispute_abuse_buyer", "medium"],
			["cod_refusal_abuse", "medium"],
			["serial_withdrawal", "low"],
			["evidence_reused", "medium"],
			["review_extortion", "medium"],
			["resale_collusion_suspected", "high"],
			["commission_credit_unpaid", "medium"],
		]);
	});

	it("writes with the transaction and rolls back with its caller", async () => {
		const payload = seed();
		await expect(
			withTransaction(payload, async (req) => {
				await recordRiskSignal(req, {
					subjectType: "shop",
					subjectId: "s-1",
					signal: "refund_overdue",
					sourceType: "return-case",
					sourceId: "r-1",
					occurredAt: NOW,
				});
				throw new Error("abort");
			}),
		).rejects.toThrow("abort");
		expect(payload.store["risk-signal-outbox"]).toHaveLength(0);
		await withTransaction(payload, (req) =>
			recordRiskSignal(req, {
				subjectType: "shop",
				subjectId: "s-1",
				signal: "refund_overdue",
				sourceType: "return-case",
				sourceId: "r-1",
				occurredAt: NOW,
			}),
		);
		expect(payload.store["risk-signal-outbox"]).toMatchObject([
			{
				subjectType: "shop",
				subjectId: "s-1",
				severity: "high",
				sourceId: "r-1",
			},
		]);
	});
});
