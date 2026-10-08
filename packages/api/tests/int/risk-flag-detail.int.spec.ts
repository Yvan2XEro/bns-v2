// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getRiskFlagDetail } from "../../src/services/riskFlagDetail";
import { fakePayload } from "./helpers/fakePayload";

const MODERATOR = { id: "mod-1", role: "moderator" };

describe("risk flag moderation detail", () => {
	it("returns shop rates, open disputes, related flags and subject audit history", async () => {
		const payload = fakePayload({
			"risk-flags": [
				{
					id: "flag-1",
					subjectType: "shop",
					subjectKey: "shop-1",
					subjectLabel: "Shop Alpha",
					signal: "orders.dispute_ratio",
					score: 55,
					severity: "medium",
					status: "open",
					evidence: { lostDisputes: 2, deliveredOrders: 20 },
					occurrences: 1,
					firstSeenAt: "2026-10-01T00:00:00.000Z",
					lastSeenAt: "2026-10-04T00:00:00.000Z",
					related: ["flag-related"],
				},
				{
					id: "flag-related",
					subjectType: "user",
					subjectKey: "owner-1",
					signal: "identity.duplicate_document",
					score: 80,
					severity: "high",
					status: "open",
					evidence: { requestId: "request-1" },
					occurrences: 1,
					firstSeenAt: "2026-10-01T00:00:00.000Z",
					lastSeenAt: "2026-10-04T00:00:00.000Z",
				},
			],
			users: [
				{ id: "owner-1", name: "Owner", createdAt: "2025-10-05T00:00:00.000Z" },
			],
			shops: [
				{
					id: "shop-1",
					name: "Shop Alpha",
					handle: "shop-alpha",
					owner: "owner-1",
					status: "active",
					level: 2,
				},
			],
			"shop-daily-stats": [
				{
					id: "stat-1",
					shop: "shop-1",
					date: "2026-10-01",
					ordersPlaced: 20,
					ordersCancelledBySeller: 3,
					views: 200,
					metricsHash: "hash-1",
				},
			],
			disputes: [
				{ id: "dispute-open", shop: "shop-1", status: "under_review" },
				{ id: "dispute-closed", shop: "shop-1", status: "resolved_seller" },
			],
			"moderation-log": [
				{
					id: "audit-1",
					targetType: "shop",
					targetId: "shop-1",
					action: "shop.suspend",
					createdAt: "2026-10-02T00:00:00.000Z",
				},
			],
		});

		const result = await getRiskFlagDetail(
			payload,
			MODERATOR,
			"flag-1",
			new Date("2026-10-05T12:00:00.000Z"),
		);

		expect(result.subject).toMatchObject({
			type: "shop",
			id: "shop-1",
			name: "Shop Alpha",
			level: 2,
			status: "active",
			rates: { sellerCancellation: 0.15 },
			openDisputes: 1,
		});
		expect(result.evidenceRows).toEqual([
			{ label: "Lost disputes", value: 2 },
			{ label: "Delivered orders", value: 20 },
		]);
		expect(result.relatedFlags.map((flag) => flag.id)).toEqual([
			"flag-related",
		]);
		expect(result.moderationHistory.map((entry) => entry.id)).toEqual([
			"audit-1",
		]);
	});

	it("never returns a raw phone/device subject hash", async () => {
		const payload = fakePayload({
			"risk-flags": [
				{
					id: "phone-flag",
					subjectType: "phone",
					subjectKey: "0123456789abcdef0123456789abcdef",
					subjectLabel: "Phone •••• 1234",
					signal: "cod.refusal_streak",
					score: 50,
					severity: "medium",
					status: "open",
					evidence: { refusedDeliveries: 3 },
					occurrences: 1,
					firstSeenAt: "2026-10-01T00:00:00.000Z",
					lastSeenAt: "2026-10-04T00:00:00.000Z",
				},
			],
		});

		const result = await getRiskFlagDetail(
			payload,
			MODERATOR,
			"phone-flag",
			new Date("2026-10-05T12:00:00.000Z"),
		);
		const serialized = JSON.stringify(result);

		expect(result.subject).toMatchObject({
			type: "phone",
			label: "Phone •••• 1234",
		});
		expect(serialized).not.toContain("0123456789abcdef0123456789abcdef");
	});
});
