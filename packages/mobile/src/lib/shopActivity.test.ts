import { describe, expect, test } from "bun:test";
import type { ShopActivityView } from "../types/api";
import {
	ACTIVITY_ACTIONS,
	activityChanges,
	activityLabelKey,
	activityTargetHref,
} from "./shopActivity";

const entry = (over: Partial<ShopActivityView> = {}): ShopActivityView => ({
	id: "a-1",
	createdAt: "2026-09-30T10:00:00.000Z",
	actor: { id: "u-owner", name: "Aicha" },
	actorRole: "owner",
	action: "member.role_changed",
	targetType: "member",
	targetId: "m-1",
	metadata: null,
	...over,
});

describe("ACTIVITY_ACTIONS", () => {
	test("lists the same twenty-four the API declares", () => {
		expect(ACTIVITY_ACTIONS).toHaveLength(24);
		expect(ACTIVITY_ACTIONS).toContain("member.invited");
		expect(ACTIVITY_ACTIONS).toContain("conversation.status_changed");
		expect(ACTIVITY_ACTIONS).toContain("verification.submitted");
		expect(new Set(ACTIVITY_ACTIONS).size).toBe(24);
	});
});

describe("activityLabelKey", () => {
	test("keys under shopActivity.actions so every action has translated copy", () => {
		expect(activityLabelKey("member.invited")).toBe(
			"shopActivity.actions.member.invited",
		);
		expect(activityLabelKey("stock.moved")).toBe(
			"shopActivity.actions.stock.moved",
		);
	});
});

describe("activityTargetHref", () => {
	test("links a product and a variant to the product screen", () => {
		expect(
			activityTargetHref(entry({ targetType: "product", targetId: "p-1" })),
		).toBe("/seller/product/p-1");
		expect(
			activityTargetHref(entry({ targetType: "variant", targetId: "p-1" })),
		).toBe("/seller/product/p-1");
	});

	test("links a listing to the public listing screen", () => {
		expect(
			activityTargetHref(entry({ targetType: "listing", targetId: "l-1" })),
		).toBe("/listing/l-1");
	});

	test("links a conversation into the shop inbox thread", () => {
		expect(
			activityTargetHref(
				entry({ targetType: "conversation", targetId: "c-1" }),
			),
		).toBe("/seller/inbox/c-1");
	});

	test("links a verification request to the seller verification hub", () => {
		expect(
			activityTargetHref(
				entry({ targetType: "verification-request", targetId: "vr-1" }),
			),
		).toBe("/seller/verification");
	});

	test("has nowhere to send a member, an invitation or the shop", () => {
		expect(activityTargetHref(entry({ targetType: "member" }))).toBeNull();
		expect(activityTargetHref(entry({ targetType: "invitation" }))).toBeNull();
		expect(activityTargetHref(entry({ targetType: "shop" }))).toBeNull();
	});
});

describe("activityChanges", () => {
	test("flattens a before/after metadata pair into rows", () => {
		expect(
			activityChanges(
				entry({
					metadata: { before: { role: "staff" }, after: { role: "manager" } },
				}),
				"owner",
			),
		).toEqual([{ field: "role", before: "staff", after: "manager" }]);
	});

	test("reports several changed fields", () => {
		expect(
			activityChanges(
				entry({
					action: "shop.updated",
					metadata: {
						before: { name: "Akwa", city: "Douala" },
						after: { name: "Akwa Store", city: "Douala" },
					},
				}),
				"owner",
			),
		).toEqual([
			{ field: "name", before: "Akwa", after: "Akwa Store" },
			{ field: "city", before: "Douala", after: "Douala" },
		]);
	});

	test('renders null and absent values as an em dash rather than "null"', () => {
		expect(
			activityChanges(
				entry({
					metadata: {
						before: { assignee: null },
						after: { assignee: "u-staff" },
					},
				}),
				"owner",
			),
		).toEqual([{ field: "assignee", before: "—", after: "u-staff" }]);
	});

	test("returns nothing for metadata that is not a before/after pair", () => {
		expect(
			activityChanges(
				entry({ metadata: { cause: "member_removed" } }),
				"owner",
			),
		).toEqual([]);
		expect(activityChanges(entry({ metadata: null }), "owner")).toEqual([]);
	});

	test("survives a metadata shape nobody planned for", () => {
		expect(
			activityChanges(
				entry({ metadata: { before: "staff", after: 3 } }),
				"owner",
			),
		).toEqual([]);
	});

	describe("cost privacy — variant.cost_changed is gated on costs.view", () => {
		const costEntry = entry({
			action: "variant.cost_changed",
			targetType: "variant",
			metadata: { before: { cost: 1000 }, after: { cost: 1200 } },
		});

		test("hides a cost change from a staff-level viewer", () => {
			expect(activityChanges(costEntry, "staff")).toEqual([]);
		});

		test("fails closed when no usable role is known, rather than showing the cost", () => {
			expect(activityChanges(costEntry, null)).toEqual([]);
			expect(activityChanges(costEntry, undefined)).toEqual([]);
		});

		test("shows the cost change to the owner and the manager, who hold costs.view", () => {
			expect(activityChanges(costEntry, "owner")).toEqual([
				{ field: "cost", before: "1000", after: "1200" },
			]);
			expect(activityChanges(costEntry, "manager")).toEqual([
				{ field: "cost", before: "1000", after: "1200" },
			]);
		});

		test("a non-cost action's diff is never hidden by role, even for staff", () => {
			expect(
				activityChanges(
					entry({
						action: "variant.price_changed",
						metadata: { before: { price: 100 }, after: { price: 120 } },
					}),
					"staff",
				),
			).toEqual([{ field: "price", before: "100", after: "120" }]);
		});
	});
});
