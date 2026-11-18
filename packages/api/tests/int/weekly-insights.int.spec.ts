// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { trigger, insights, recipients } = vi.hoisted(() => ({
	trigger: vi.fn(async (_call: unknown) => undefined),
	insights: vi.fn(),
	recipients: vi.fn(),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: trigger,
}));
vi.mock("../../src/services/shopInsights", () => ({
	getShopInsights: insights,
}));
vi.mock("../../src/services/orders/notifications", () => ({
	recipientsForShop: recipients,
}));

import { sendWeeklyInsightsTask } from "../../src/jobs/sendWeeklyInsights";
import { sendWeeklyInsights } from "../../src/services/weeklyInsights";
import { type Doc, fakePayload } from "./helpers/fakePayload";

// Monday 07:00 UTC, 08:00 in Douala; the closed Douala week started the
// Monday before at 00:00 local.
const MONDAY = new Date("2026-09-28T07:00:00.000Z");
const WEEK_STAMP = "2026-09-20T23:00:00.000Z";
const NEXT_MONDAY = new Date("2026-10-05T07:00:00.000Z");

const totals = (overrides: Record<string, number> = {}) => ({
	views: 10,
	conversationsStarted: 0,
	ordersPlaced: 0,
	ordersDelivered: 0,
	gmvDelivered: 0,
	unitsDelivered: 0,
	...overrides,
});
const view = (
	current: ReturnType<typeof totals>,
	overrides: Record<string, unknown> = {},
) => ({
	from: "2026-09-22",
	to: "2026-09-28",
	totals: { current },
	responseTime: { medianBucket: "h1" },
	actions: [{ type: "restock", href: "/seller/insights#restock" }],
	...overrides,
});

function world(
	enabled = true,
	shops: Doc[] = [{ id: "s-1", status: "active" }],
) {
	return fakePayload(
		{ shops },
		{ globals: { "app-settings": { insights: { enabled } } } },
	);
}

beforeEach(() => {
	trigger.mockClear();
	insights.mockReset();
	recipients.mockReset().mockResolvedValue(["owner-1", "manager-1"]);
});

describe("sendWeeklyInsights", () => {
	it("triggers the whole summary payload to each owner and manager, once per week", async () => {
		insights.mockResolvedValue(
			view(
				totals({ ordersPlaced: 4, ordersDelivered: 3, gmvDelivered: 56_000 }),
			),
		);
		const payload = world();

		const first = await sendWeeklyInsights(payload, MONDAY);
		const second = await sendWeeklyInsights(payload, MONDAY);

		expect(first).toEqual({ shops: ["s-1"], recipients: 2 });
		expect(second).toEqual({ shops: [], recipients: 0 });
		const body = {
			shopId: "s-1",
			from: "2026-09-22",
			to: "2026-09-28",
			gmvDelivered: 56_000,
			ordersPlaced: 4,
			ordersDelivered: 3,
			responseTime: "h1",
			topAction: "restock",
			topActionHref: "/seller/insights#restock",
		};
		expect(trigger.mock.calls).toEqual([
			[
				{
					event: "shop-weekly-insights",
					subscriberId: "owner-1",
					payload: body,
				},
			],
			[
				{
					event: "shop-weekly-insights",
					subscriberId: "manager-1",
					payload: body,
				},
			],
		]);
		expect(recipients).toHaveBeenCalledWith(payload, "s-1", "costs.view");
		expect(payload.store.shops?.[0]?.weeklyInsightsSentFor).toBe(WEEK_STAMP);
	});

	it("sends again the following week", async () => {
		insights.mockResolvedValue(view(totals({ ordersPlaced: 1 })));
		const payload = world();

		await sendWeeklyInsights(payload, MONDAY);
		const next = await sendWeeklyInsights(payload, NEXT_MONDAY);

		expect(next.shops).toEqual(["s-1"]);
		expect(trigger).toHaveBeenCalledTimes(4);
		expect(payload.store.shops?.[0]?.weeklyInsightsSentFor).toBe(
			"2026-09-27T23:00:00.000Z",
		);
	});

	it("falls back to the plain values when there is no reply data or action", async () => {
		insights.mockResolvedValue(
			view(totals({ ordersPlaced: 1 }), {
				responseTime: { medianBucket: null },
				actions: [],
			}),
		);

		await sendWeeklyInsights(world(), MONDAY);

		expect(trigger.mock.calls[0]?.[0]).toMatchObject({
			payload: {
				responseTime: "none",
				topAction: "none",
				topActionHref: "/seller/insights",
			},
		});
	});

	it("skips quiet shops at 49 views and no order, and takes 50 views or one order", async () => {
		const shops = [
			{ id: "s-quiet", status: "active" },
			{ id: "s-views", status: "active" },
			{ id: "s-order", status: "active" },
		];
		insights.mockImplementation(async (_p, _u, shopId: string) =>
			view(
				shopId === "s-quiet"
					? totals({ views: 49 })
					: shopId === "s-views"
						? totals({ views: 50 })
						: totals({ views: 0, ordersPlaced: 1 }),
			),
		);
		const payload = world(true, shops);

		const result = await sendWeeklyInsights(payload, MONDAY);

		expect(result.shops).toEqual(["s-order", "s-views"]);
		expect(
			payload.store.shops?.find((shop) => shop.id === "s-quiet")
				?.weeklyInsightsSentFor,
		).toBeUndefined();
	});

	it("sends nothing while insights are off, to inactive shops, or to a shop with no eligible member", async () => {
		insights.mockResolvedValue(view(totals({ ordersPlaced: 2 })));
		await sendWeeklyInsights(world(false), MONDAY);
		await sendWeeklyInsights(
			world(true, [{ id: "s-closed", status: "closed" }]),
			MONDAY,
		);
		recipients.mockResolvedValue([]);
		await sendWeeklyInsights(world(), MONDAY);

		expect(trigger).not.toHaveBeenCalled();
	});

	it("registers Monday 07:00 UTC on its own queue", () => {
		expect(sendWeeklyInsightsTask.schedule).toEqual([
			{ cron: "0 7 * * 1", queue: "insights" },
		]);
	});
});
