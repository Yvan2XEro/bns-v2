import { describe, expect, test } from "bun:test";
import type { ShopActivityView } from "~/types";
import {
	ACTIVITY_ACTIONS,
	activityActionGroup,
	activityChanges,
	activityLabelKey,
	activityOtherMetadata,
	activityTargetHref,
	visibleActivityDetails,
} from "./shop-activity";

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

describe("activityActionGroup", () => {
	test("is the action's own prefix, so the filter select can group by it", () => {
		expect(activityActionGroup("member.invited")).toBe("member");
		expect(activityActionGroup("variant.cost_changed")).toBe("variant");
		expect(activityActionGroup("verification.submitted")).toBe("verification");
	});
});

describe("activityTargetHref", () => {
	test("links a product, a variant and a listing to where they can be opened", () => {
		expect(
			activityTargetHref(entry({ targetType: "product", targetId: "p-1" })),
		).toBe("/seller/catalogue/p-1");
		expect(
			activityTargetHref(entry({ targetType: "variant", targetId: "p-1" })),
		).toBe("/seller/catalogue/p-1");
		expect(
			activityTargetHref(entry({ targetType: "listing", targetId: "l-1" })),
		).toBe("/listing/l-1");
	});

	test("links a conversation into the shared inbox", () => {
		expect(
			activityTargetHref(
				entry({ targetType: "conversation", targetId: "c-1" }),
			),
		).toBe("/seller/messages?conversation=c-1");
	});

	test("links a verification request to the seller hub", () => {
		expect(
			activityTargetHref(
				entry({ targetType: "verification-request", targetId: "vr-1" }),
			),
		).toBe("/seller/verification");
	});

	test("has nowhere to send a member, an invitation or the shop itself", () => {
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
			),
		).toEqual([{ field: "assignee", before: "—", after: "u-staff" }]);
	});

	test("returns nothing for metadata that is not a before/after pair", () => {
		expect(
			activityChanges(entry({ metadata: { cause: "member_removed" } })),
		).toEqual([]);
		expect(activityChanges(entry({ metadata: null }))).toEqual([]);
	});

	test("survives a metadata shape nobody planned for", () => {
		expect(
			activityChanges(entry({ metadata: { before: "staff", after: 3 } })),
		).toEqual([]);
	});
});

describe("activityOtherMetadata", () => {
	test("lists metadata that is not a before/after pair, as plain rows", () => {
		expect(
			activityOtherMetadata(
				entry({
					action: "member.invitation_resent",
					metadata: { sendCount: 2 },
				}),
			),
		).toEqual([{ key: "sendCount", value: "2" }]);
	});

	test("drops before and after once they were consumed as changes", () => {
		expect(
			activityOtherMetadata(
				entry({
					metadata: { before: { role: "staff" }, after: { role: "manager" } },
				}),
			),
		).toEqual([]);
	});

	test("keeps before and after raw when they were not a before/after pair", () => {
		expect(
			activityOtherMetadata(entry({ metadata: { before: "staff", after: 3 } })),
		).toEqual([
			{ key: "before", value: "staff" },
			{ key: "after", value: "3" },
		]);
	});

	test("stringifies a nested value rather than dropping it", () => {
		expect(
			activityOtherMetadata(
				entry({ metadata: { reason: "level_drop", detail: { level: 1 } } }),
			),
		).toEqual([
			{ key: "reason", value: "level_drop" },
			{ key: "detail", value: '{"level":1}' },
		]);
	});
});

describe("visibleActivityDetails", () => {
	/**
	 * Isolates the one privacy rule in this task: `costs.view` is denied to
	 * staff, so a cost figure sitting in `metadata` must never reach a drawer
	 * a staff-level viewer can open — in either shape the server allows,
	 * nested `{ before, after }` and flat `costBefore`/`costAfter`.
	 */
	test("a staff-level viewer (canSeeCost=false) sees no cost anywhere", () => {
		const nested = entry({
			action: "variant.cost_changed",
			targetType: "variant",
			metadata: {
				before: { cost: 400, currency: "XAF" },
				after: { cost: 450, currency: "XAF" },
			},
		});
		const flat = entry({
			action: "variant.cost_changed",
			targetType: "variant",
			metadata: { costBefore: 400, costAfter: 450, unitCost: 450 },
		});

		for (const view of [
			visibleActivityDetails(nested, false),
			visibleActivityDetails(flat, false),
		]) {
			expect(view.costHidden).toBe(true);
			for (const row of view.changes) {
				expect(row.field.toLowerCase()).not.toContain("cost");
			}
			for (const row of view.other) {
				expect(row.key.toLowerCase()).not.toContain("cost");
			}
		}

		// The non-cost field survives the redaction.
		expect(visibleActivityDetails(nested, false).changes).toEqual([
			{ field: "currency", before: "XAF", after: "XAF" },
		]);
	});

	test("an owner or manager (canSeeCost=true) sees the cost figures unredacted", () => {
		const view = visibleActivityDetails(
			entry({
				action: "variant.cost_changed",
				targetType: "variant",
				metadata: { costBefore: 400, costAfter: 450 },
			}),
			true,
		);
		expect(view.costHidden).toBe(false);
		expect(view.other).toEqual([
			{ key: "costBefore", value: "400" },
			{ key: "costAfter", value: "450" },
		]);
	});

	test("does not flag costHidden when nothing was actually redacted", () => {
		const view = visibleActivityDetails(
			entry({
				metadata: { before: { role: "staff" }, after: { role: "manager" } },
			}),
			false,
		);
		expect(view.costHidden).toBe(false);
		expect(view.changes).toEqual([
			{ field: "role", before: "staff", after: "manager" },
		]);
	});
});
