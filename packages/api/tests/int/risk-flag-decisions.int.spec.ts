// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { decideRiskFlag } from "../../src/services/moderation";
import { fakePayload } from "./helpers/fakePayload";

const MODERATOR = { id: "moderator-1", role: "moderator" };

afterEach(() => vi.useRealTimers());

function payload() {
	return fakePayload({
		"risk-flags": [
			{
				id: "risk-1",
				subjectType: "shop",
				subjectKey: "shop-1",
				signal: "velocity.payout_account_changes",
				score: 60,
				severity: "medium",
				status: "open",
				autoEffects: ["payout_hold"],
			},
		],
		"payout-holds": [
			{
				id: "hold-1",
				scope: "shop",
				shop: "shop-1",
				reason: "fraud_signal",
				status: "active",
				createdByType: "system",
				note: "risk-flag:risk-1",
				blocksCharges: true,
			},
			{
				id: "hold-unrelated",
				scope: "shop",
				shop: "shop-1",
				reason: "moderation",
				status: "active",
				createdByType: "moderator",
				note: "independent hold",
				blocksCharges: false,
			},
		],
	});
}

describe("risk flag decisions", () => {
	it("executes and links a user suspension before marking the flag actioned", async () => {
		const api = fakePayload({
			users: [
				{
					id: "user-1",
					role: "user",
					name: "Test User",
					email: "user@example.com",
					suspendedAt: null,
				},
			],
			"risk-flags": [
				{
					id: "risk-1",
					subjectType: "user",
					subjectKey: "user-1",
					signal: "identity.duplicate_document",
					score: 80,
					severity: "high",
					status: "open",
					lastSeenAt: new Date().toISOString(),
				},
			],
		});

		const result = await decideRiskFlag(api, MODERATOR, "risk-1", {
			outcome: "actioned",
			resolution: "user_suspended",
			note: "Duplicate identity document confirmed.",
			action: {
				type: "suspend_user",
				targetId: "user-1",
				reason: "fraud",
				durationDays: 30,
			},
		});

		expect(result.status).toBe("actioned");
		expect(api.store.users?.[0]).toMatchObject({
			id: "user-1",
			suspendedReason: "fraud",
			suspendedBy: MODERATOR.id,
		});
		expect(api.store["risk-flags"]?.[0]).toMatchObject({
			status: "actioned",
			resolution: "user_suspended",
		});
		const suspensionLog = api.store["moderation-log"]?.find(
			(entry) => entry.action === "user.suspend",
		);
		const riskActionLog = api.store["moderation-log"]?.at(-1);
		expect(suspensionLog?.id).toBeTruthy();
		expect(riskActionLog).toMatchObject({
			action: "risk_flag.action",
			targetId: "risk-1",
			metadata: { linkedActions: [suspensionLog?.id] },
		});
	});

	it("refuses a user sanction when the target is not the flagged user", async () => {
		const api = fakePayload({
			users: [
				{
					id: "user-other",
					role: "user",
					name: "Other User",
					email: "other@example.com",
				},
			],
			"risk-flags": [
				{
					id: "risk-1",
					subjectType: "user",
					subjectKey: "user-1",
					signal: "identity.duplicate_document",
					score: 80,
					severity: "high",
					status: "open",
					lastSeenAt: new Date().toISOString(),
				},
			],
		});

		await expect(
			decideRiskFlag(api, MODERATOR, "risk-1", {
				outcome: "actioned",
				resolution: "user_suspended",
				note: "Identity confirmed.",
				action: {
					type: "suspend_user",
					targetId: "user-other",
					reason: "fraud",
					durationDays: 30,
				},
			}),
		).rejects.toMatchObject({ code: "moderation.reasonInvalid", status: 400 });
		expect(api.store.users?.[0]?.suspendedAt).toBeUndefined();
		expect(api.store["risk-flags"]?.[0]?.status).toBe("open");
	});

	it("executes a shop suspension only for the shop named by the risk flag", async () => {
		const api = fakePayload({
			users: [
				{
					id: "owner-1",
					role: "user",
					name: "Shop Owner",
					email: "owner@example.com",
				},
			],
			shops: [{ id: "shop-1", owner: "owner-1", status: "active" }],
			"risk-flags": [
				{
					id: "risk-shop-1",
					subjectType: "shop",
					subjectKey: "shop-1",
					signal: "resale.self_dealing",
					score: 85,
					severity: "high",
					status: "open",
					lastSeenAt: new Date().toISOString(),
				},
			],
		});

		const result = await decideRiskFlag(api, MODERATOR, "risk-shop-1", {
			outcome: "actioned",
			resolution: "shop_suspended",
			note: "Resale collusion confirmed.",
			action: {
				type: "suspend_shop",
				targetId: "shop-1",
				reason: "fraud",
				durationDays: 30,
			},
		});

		expect(result.status).toBe("actioned");
		expect(api.store.shops?.[0]).toMatchObject({
			id: "shop-1",
			status: "suspended",
			suspendedReason: "fraud",
		});
		expect(api.store["risk-flags"]?.[0]?.resolution).toBe("shop_suspended");
	});

	it("places and links a payout hold only on the flagged shop", async () => {
		const api = fakePayload({
			users: [{ id: "owner-1", role: "user", name: "Owner" }],
			shops: [{ id: "shop-1", owner: "owner-1", status: "active" }],
			"risk-flags": [
				{
					id: "risk-shop-1",
					subjectType: "shop",
					subjectKey: "shop-1",
					signal: "velocity.payout_account_changes",
					score: 75,
					severity: "high",
					status: "open",
					lastSeenAt: new Date().toISOString(),
				},
			],
		});

		const result = await decideRiskFlag(api, MODERATOR, "risk-shop-1", {
			outcome: "actioned",
			resolution: "payouts_held",
			note: "Payout account changes require review.",
			action: {
				type: "hold_payouts",
				targetId: "shop-1",
				reason: "moderation",
				durationDays: 7,
			},
		});

		expect(result.status).toBe("actioned");
		expect(api.store["payout-holds"]?.[0]).toMatchObject({
			shop: "shop-1",
			reason: "moderation",
			status: "active",
			createdBy: MODERATOR.id,
		});
		expect(api.store["moderation-log"]?.map((entry) => entry.action)).toEqual([
			"payout.hold",
			"risk_flag.action",
		]);
		expect(api.store["moderation-log"]?.at(-1)).toMatchObject({
			metadata: {
				linkedActions: [api.store["moderation-log"]?.[0]?.id],
			},
		});
	});

	it("releases only the targeted payout hold when actioning a false positive", async () => {
		const api = fakePayload({
			users: [{ id: "owner-1", role: "user", name: "Owner" }],
			shops: [{ id: "shop-1", owner: "owner-1", status: "active" }],
			"payout-holds": [
				{
					id: "hold-risk",
					shop: "shop-1",
					scope: "shop",
					reason: "moderation",
					status: "active",
					createdByType: "moderator",
					blocksCharges: true,
				},
				{
					id: "hold-unrelated",
					shop: "shop-1",
					scope: "shop",
					reason: "dispute_open",
					status: "active",
					createdByType: "moderator",
					blocksCharges: true,
				},
			],
			"risk-flags": [
				{
					id: "risk-shop-1",
					subjectType: "shop",
					subjectKey: "shop-1",
					signal: "velocity.payout_account_changes",
					score: 75,
					severity: "high",
					status: "open",
					lastSeenAt: new Date().toISOString(),
				},
			],
		});

		const result = await decideRiskFlag(api, MODERATOR, "risk-shop-1", {
			outcome: "actioned",
			resolution: "false_positive",
			note: "The payout account change is verified.",
			action: {
				type: "release_holds",
				targetId: "hold-risk",
				reason: "false_positive",
				durationDays: null,
			},
		});

		expect(result.status).toBe("actioned");
		expect(api.store["payout-holds"]?.[0]?.status).toBe("released");
		expect(api.store["payout-holds"]?.[1]?.status).toBe("active");
		expect(api.store["moderation-log"]?.map((entry) => entry.action)).toEqual([
			"payout.release",
			"risk_flag.action",
		]);
		expect(api.store["moderation-log"]?.at(-1)?.metadata).toMatchObject({
			linkedActions: [api.store["moderation-log"]?.[0]?.id],
		});
	});

	it("suspends only a resale link connected to the flagged shop", async () => {
		const api = fakePayload({
			users: [
				{ id: "supplier-owner", role: "user" },
				{ id: "reseller-owner", role: "user" },
			],
			shops: [
				{ id: "supplier", owner: "supplier-owner", status: "active", level: 3 },
				{ id: "reseller", owner: "reseller-owner", status: "active", level: 2 },
			],
			"shop-members": [
				{
					id: "supplier-owner-membership",
					shop: "supplier",
					user: "supplier-owner",
					role: "owner",
					status: "active",
				},
				{
					id: "reseller-owner-membership",
					shop: "reseller",
					user: "reseller-owner",
					role: "owner",
					status: "active",
				},
			],
			"resale-links": [
				{
					id: "link-1",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status: "approved",
				},
			],
			listings: [
				{
					id: "resale-listing",
					shop: "reseller",
					status: "published",
					resale: {
						supplierShop: "supplier",
						link: "link-1",
						desiredStatus: "published",
						holds: [],
					},
				},
			],
			"risk-flags": [
				{
					id: "risk-supplier",
					subjectType: "shop",
					subjectKey: "supplier",
					signal: "resale.self_dealing",
					score: 85,
					severity: "high",
					status: "open",
					lastSeenAt: new Date().toISOString(),
				},
			],
		});

		const result = await decideRiskFlag(api, MODERATOR, "risk-supplier", {
			outcome: "actioned",
			resolution: "resale_link_suspended",
			note: "Self-dealing confirmed.",
			action: {
				type: "suspend_resale_link",
				targetId: "link-1",
				reason: "fraud_review",
				durationDays: null,
			},
		});

		expect(result.status).toBe("actioned");
		expect(api.store["resale-links"]?.[0]?.status).toBe("suspended");
		expect(api.store.listings?.[0]).toMatchObject({
			status: "draft",
			resale: { holds: ["link_inactive"] },
		});
		expect(api.store["moderation-log"]?.map((entry) => entry.action)).toEqual([
			"resale_link.suspend",
			"risk_flag.action",
		]);
	});

	it("cancels only an order belonging to the flagged shop", async () => {
		const api = fakePayload({
			orders: [
				{
					id: "order-1",
					orderNumber: "ORD-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "placed",
					paymentMethod: "cod",
					paymentStatus: "cod_pending",
					amounts: { total: 20_000, currency: "XAF" },
					timestamps: { placedAt: "2026-10-01T00:00:00.000Z" },
				},
			],
			"order-items": [],
			"order-events": [],
			"moderation-log": [],
			"risk-flags": [
				{
					id: "risk-shop-1",
					subjectType: "shop",
					subjectKey: "shop-1",
					signal: "resale.self_dealing",
					score: 85,
					severity: "high",
					status: "open",
					lastSeenAt: new Date().toISOString(),
				},
			],
		});

		const result = await decideRiskFlag(api, MODERATOR, "risk-shop-1", {
			outcome: "actioned",
			resolution: "order_cancelled",
			note: "Fraudulent order confirmed.",
			action: {
				type: "cancel_order",
				targetId: "order-1",
				reason: "staff_fraud",
				durationDays: null,
			},
		});

		expect(result.status).toBe("actioned");
		expect(api.store.orders?.[0]?.status).toBe("cancelled");
		expect(api.store["moderation-log"]?.map((entry) => entry.action)).toEqual([
			"order.cancel",
			"risk_flag.action",
		]);
	});

	it("dismisses a false positive, releases only its hold, and writes audit metadata", async () => {
		const api = payload();
		const result = await decideRiskFlag(api, MODERATOR, "risk-1", {
			outcome: "dismissed",
			resolution: "false_positive",
			note: "The payout accounts belong to separate legal entities.",
		});

		expect(result).toMatchObject({ id: "risk-1", status: "dismissed" });
		expect(api.store["risk-flags"]?.[0]).toMatchObject({
			status: "dismissed",
			resolution: "false_positive",
			resolutionNote: "The payout accounts belong to separate legal entities.",
			reviewedBy: MODERATOR.id,
		});
		expect(api.store["payout-holds"]?.[0]).toMatchObject({
			status: "released",
			releasedBy: MODERATOR.id,
		});
		expect(api.store["payout-holds"]?.[1]).toMatchObject({
			id: "hold-unrelated",
			status: "active",
			note: "independent hold",
		});
		expect(api.store["moderation-log"]?.[0]).toMatchObject({
			action: "risk_flag.dismiss",
			targetType: "risk-flag",
			targetId: "risk-1",
			metadata: {
				signal: "velocity.payout_account_changes",
				score: 60,
				previousStatus: "open",
				resolution: "false_positive",
			},
		});
	});

	it("rolls back the decision and hold release if the audit write fails", async () => {
		const api = fakePayload(
			{
				"risk-flags": [
					{
						id: "risk-1",
						subjectType: "shop",
						subjectKey: "shop-1",
						signal: "velocity.payout_account_changes",
						score: 60,
						severity: "medium",
						status: "open",
						autoEffects: ["payout_hold"],
					},
				],
				"payout-holds": [
					{
						id: "hold-1",
						scope: "shop",
						shop: "shop-1",
						reason: "fraud_signal",
						status: "active",
						createdByType: "system",
						note: "risk-flag:risk-1",
						blocksCharges: true,
					},
				],
				"moderation-log": [{ id: "existing-log", targetId: "risk-1" }],
			},
			{ uniques: { "moderation-log": [["targetId"]] } },
		);

		await expect(
			decideRiskFlag(api, MODERATOR, "risk-1", {
				outcome: "dismissed",
				resolution: "false_positive",
				note: "Verified with the shop owner.",
			}),
		).rejects.toThrow(/E11000 duplicate key/);
		expect(api.store["risk-flags"]?.[0]?.status).toBe("open");
		expect(api.store["payout-holds"]?.[0]?.status).toBe("active");
	});

	it("requires an internal note when dismissing a risk flag", async () => {
		await expect(
			decideRiskFlag(payload(), MODERATOR, "risk-1", {
				outcome: "dismissed",
				resolution: "false_positive",
			}),
		).rejects.toMatchObject({ code: "moderation.reasonRequired", status: 400 });
	});

	it("rejects an unknown payout hold reason before changing the flag", async () => {
		const api = payload();

		await expect(
			decideRiskFlag(api, MODERATOR, "risk-1", {
				outcome: "actioned",
				resolution: "payouts_held",
				note: "Investigating suspicious activity.",
				action: {
					type: "hold_payouts",
					targetId: "shop-1",
					reason: "unknown_reason",
					durationDays: 7,
				},
			}),
		).rejects.toMatchObject({ code: "moderation.reasonInvalid", status: 400 });
		expect(api.store["risk-flags"]?.[0]?.status).toBe("open");
	});

	it("does not allow a reviewed flag with a future review date to be dismissed", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));
		const api = fakePayload({
			"risk-flags": [
				{
					id: "risk-1",
					subjectType: "shop",
					subjectKey: "shop-1",
					signal: "velocity.payout_account_changes",
					score: 60,
					severity: "medium",
					status: "reviewed",
					reviewedAt: "2026-10-06T12:00:00.000Z",
				},
			],
		});

		await expect(
			decideRiskFlag(api, MODERATOR, "risk-1", {
				outcome: "dismissed",
				resolution: "false_positive",
				note: "Verified.",
			}),
		).rejects.toMatchObject({
			code: "moderation.invalidTransition",
			status: 409,
		});
		expect(api.store["risk-flags"]?.[0]?.status).toBe("reviewed");
	});
});
