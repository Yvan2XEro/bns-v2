import { describe, expect, it } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import { availableActions } from "~/lib/order-actions";
import { ORDER_STATUSES } from "~/lib/order-status";
import type { OrderListEntry, OrderView } from "~/types/order";
import {
	BUYER_CANCEL_REASONS,
	cancelSchema,
	confirmCodeSchema,
	groupPurchases,
	handoverCardState,
	PURCHASE_TABS,
	purchaseArrival,
	purchaseCardActions,
	purchaseTab,
	receiptBody,
	reviewSchema,
	TIMELINE_LABEL_KEYS,
	timelineLabelKey,
	windowCountdown,
	withdrawalPayload,
	withdrawalSchema,
} from "./purchase-view";

const purchases = (locale: typeof en) =>
	Object.fromEntries(Object.entries(locale.Purchases));

type Subject = Parameters<typeof handoverCardState>[0];

function shipped(handover: Partial<OrderView["handover"]>): Subject {
	return {
		status: "shipped",
		confirmation: {
			method: "verified_phone",
			required: "none",
			attemptsLeft: 5,
			resendsLeft: 3,
		},
		handover: {
			method: null,
			locked: false,
			attemptsLeft: 5,
			regenerationsLeft: 3,
			...handover,
		},
		deadlines: {
			confirmBy: null,
			acceptBy: null,
			staleAt: null,
			completeAt: null,
			withdrawalUntil: null,
			contestBy: null,
		},
		deliveryFailure: null,
		completionHold: "none",
		returnCaseNumber: null,
		reviewable: false,
	};
}

describe("purchaseTab", () => {
	it("files every status under exactly one of the three tabs", () => {
		const counts = { open: 0, delivered: 0, cancelled: 0 };
		for (const status of ORDER_STATUSES) counts[purchaseTab(status)] += 1;
		expect(counts).toEqual({ open: 6, delivered: 3, cancelled: 2 });
		expect(PURCHASE_TABS).toEqual(["open", "delivered", "cancelled"]);
	});

	it("keeps an order on its way in the open tab and a failed one with the ended ones", () => {
		expect(purchaseTab("shipped")).toBe("open");
		expect(purchaseTab("completed")).toBe("delivered");
		expect(purchaseTab("delivery_failed")).toBe("cancelled");
	});
});

describe("the buyer's cancel reasons", () => {
	it("offers exactly the two values the API stores", () => {
		expect(BUYER_CANCEL_REASONS.map((r) => r.value)).toEqual([
			"buyer_changed_mind",
			"buyer_ordered_by_mistake",
		]);
	});

	it("labels each with a key present in both locales", () => {
		for (const { labelKey } of BUYER_CANCEL_REASONS) {
			expect(purchases(en)[labelKey]).toBeString();
			expect(purchases(fr)[labelKey]).toBeString();
		}
	});

	it("refuses a missing or invented reason", () => {
		expect(cancelSchema.safeParse({}).success).toBe(false);
		expect(cancelSchema.safeParse({ reason: "buyer_other" }).success).toBe(
			false,
		);
		expect(
			cancelSchema.safeParse({ reason: "buyer_changed_mind" }).data,
		).toEqual({ reason: "buyer_changed_mind" });
	});
});

describe("timelineLabelKey", () => {
	it("names every event type the API writes, plus the reserved three", () => {
		expect(Object.keys(TIMELINE_LABEL_KEYS)).toHaveLength(24);
		expect(timelineLabelKey("order.handover_code_regenerated")).toBe(
			"event_handover_code_regenerated",
		);
	});

	it("falls back to a generic label for a type it does not know", () => {
		expect(timelineLabelKey("order.something_new")).toBe("event_other");
	});

	it("has every label in both locales", () => {
		const keys = [...Object.values(TIMELINE_LABEL_KEYS), "event_other"];
		const missing = keys.filter(
			(key) => !purchases(en)[key] || !purchases(fr)[key],
		);
		expect(missing).toEqual([]);
	});
});

describe("windowCountdown", () => {
	const now = new Date("2026-10-02T10:00:00Z");

	it("counts whole days and hours to the deadline", () => {
		expect(windowCountdown("2026-10-05T13:30:00Z", now)).toEqual({
			days: 3,
			hours: 3,
		});
	});

	it("is null once the deadline has passed, or when there is none", () => {
		expect(windowCountdown("2026-10-02T09:59:59Z", now)).toBeNull();
		expect(windowCountdown(null, now)).toBeNull();
	});
});

describe("the withdrawal form", () => {
	const items = [
		{ orderItemId: "i-1", quantity: 0, max: 2 },
		{ orderItemId: "i-2", quantity: 1, max: 1 },
	];

	it("sends only the lines with a quantity", () => {
		const parsed = withdrawalSchema.parse({ items, reasonText: "" });
		expect(withdrawalPayload(parsed)).toEqual({
			items: [{ orderItemId: "i-2", quantity: 1 }],
			reasonText: null,
		});
	});

	it("refuses a request that returns nothing", () => {
		const none = items.map((item) => ({ ...item, quantity: 0 }));
		expect(withdrawalSchema.safeParse({ items: none }).success).toBe(false);
	});

	it("refuses more than the line holds", () => {
		const over = [{ orderItemId: "i-2", quantity: 2, max: 1 }];
		expect(withdrawalSchema.safeParse({ items: over }).success).toBe(false);
	});
});

describe("handoverCardState", () => {
	it("offers no regeneration on a locked order with none left, and says both fallbacks", () => {
		const order = shipped({ locked: true, regenerationsLeft: 0 });
		const state = handoverCardState(order, availableActions(order, "buyer"));
		expect(state).toEqual({
			locked: true,
			regenerationsLeft: 0,
			canRegenerate: false,
			showFallbacks: true,
		});
	});

	it("offers a regeneration on a locked order that still has some", () => {
		const order = shipped({ locked: true, regenerationsLeft: 2 });
		const state = handoverCardState(order, availableActions(order, "buyer"));
		expect(state.canRegenerate).toBe(true);
		expect(state.showFallbacks).toBe(true);
	});

	it("shows no fallbacks while the code still works", () => {
		const order = shipped({});
		const state = handoverCardState(order, availableActions(order, "buyer"));
		expect(state).toEqual({
			locked: false,
			regenerationsLeft: 3,
			canRegenerate: true,
			showFallbacks: false,
		});
	});
});

describe("the small forms", () => {
	it("accepts a six-digit confirmation code and nothing else", () => {
		expect(confirmCodeSchema.safeParse({ code: "123456" }).success).toBe(true);
		expect(confirmCodeSchema.safeParse({ code: "12345" }).success).toBe(false);
		expect(confirmCodeSchema.safeParse({ code: "12345a" }).success).toBe(false);
	});

	it("rates a shop from one to five", () => {
		expect(reviewSchema.safeParse({ rating: 0, comment: "" }).success).toBe(
			false,
		);
		expect(reviewSchema.parse({ rating: 5, comment: " Top " })).toEqual({
			rating: 5,
			comment: "Top",
		});
	});
});

describe("receiptBody", () => {
	it("keeps the body of the API's document and drops its global stylesheet", () => {
		const html =
			"<!doctype html><html><head><style>body{color:red}</style></head><body>\n<h1>Reçu</h1><p>A</p>\n</body></html>";
		expect(receiptBody(html)).toBe("<h1>Reçu</h1><p>A</p>");
	});

	it("passes a fragment through unchanged", () => {
		expect(receiptBody("<p>A</p>")).toBe("<p>A</p>");
	});
});

describe("groupPurchases", () => {
	const row = (id: string, checkoutGroup?: string) =>
		({
			id,
			checkoutGroup,
		}) as unknown as import("~/types/order").OrderListEntry;

	it("collapses siblings under the first one's position and leaves singles alone", () => {
		const items = groupPurchases([
			row("a"),
			row("b", "g"),
			row("c"),
			row("d", "g"),
		]);
		expect(items.map((i) => i.kind)).toEqual(["order", "group", "order"]);
		const group = items[1];
		expect(group?.kind === "group" && group.entries.map((e) => e.id)).toEqual([
			"b",
			"d",
		]);
	});

	it("a group with one order on this tab is a plain row", () => {
		expect(groupPurchases([row("a", "g")]).map((i) => i.kind)).toEqual([
			"order",
		]);
	});
});

describe("purchaseCardActions", () => {
	const NOW = new Date("2026-09-20T10:00:00.000Z");
	// Carries a `status` of its own: the row's status must win over it.
	const subject = shipped({});
	function entry(overrides: Partial<OrderListEntry> = {}): OrderListEntry {
		return {
			id: "o-1",
			orderNumber: "BNS-1",
			status: "shipped",
			placedAt: "2026-09-18T10:00:00.000Z",
			total: 287_000,
			itemCount: 1,
			firstItemTitle: "iPhone 13 Pro",
			firstItemImageUrl: null,
			shopName: "Akwa Tech Store",
			actionSubject: subject,
			arrival: {
				method: "seller_delivery",
				etaText: "sous 24 h",
				promisedBy: null,
			},
			...overrides,
		};
	}

	it("tracks an order on its way, and a courier parcel with the courier wording", () => {
		expect(purchaseCardActions(entry(), NOW)).toEqual([
			{ kind: "track", href: "/purchases/o-1#tracking" },
		]);
		expect(
			purchaseCardActions(
				entry({
					arrival: { method: "courier", etaText: "", promisedBy: null },
				}),
				NOW,
			).map((a) => a.kind),
		).toEqual(["track_courier"]);
	});

	it("offers the code confirmation instead of tracking while the code is owed", () => {
		const kinds = purchaseCardActions(
			entry({
				status: "placed",
				actionSubject: {
					...subject,
					confirmation: { ...subject.confirmation, required: "sms_code" },
				},
			}),
			NOW,
		).map((a) => a.kind);
		expect(kinds).toEqual(["confirm"]);
	});

	it("offers review and return on a delivered order exactly when the order page would", () => {
		const delivered = entry({
			status: "delivered",
			actionSubject: {
				...subject,
				reviewable: true,
				deadlines: {
					...subject.deadlines,
					withdrawalUntil: "2026-09-25T10:00:00.000Z",
				},
			},
		});
		const page = availableActions(
			{ ...shipped({}), ...delivered.actionSubject, status: "delivered" },
			"buyer",
			null,
			NOW,
		);
		expect(page).toContain("review_shop");
		expect(page).toContain("request_withdrawal");
		expect(purchaseCardActions(delivered, NOW)).toEqual([
			{ kind: "review", href: "/purchases/o-1#review" },
			{ kind: "return", href: "/purchases/o-1#withdrawal" },
		]);
	});

	it("hides return past the window and review once the shop is reviewed", () => {
		const closed = entry({
			status: "delivered",
			actionSubject: {
				...subject,
				reviewable: false,
				deadlines: {
					...subject.deadlines,
					withdrawalUntil: "2026-09-19T10:00:00.000Z",
				},
			},
		});
		expect(purchaseCardActions(closed, NOW)).toEqual([]);
	});

	it("falls back to tracking alone when the API sends no action fields", () => {
		expect(
			purchaseCardActions(
				entry({ status: "delivered", actionSubject: undefined }),
				NOW,
			),
		).toEqual([]);
		expect(
			purchaseCardActions(entry({ actionSubject: undefined }), NOW).map(
				(a) => a.kind,
			),
		).toEqual(["track"]);
	});

	it("never tracks a dispute or a closed order", () => {
		for (const status of ["disputed", "cancelled", "completed"] as const) {
			expect(
				purchaseCardActions(entry({ status }), NOW).filter(
					(a) => a.kind === "track",
				),
			).toEqual([]);
		}
	});
});

describe("purchaseArrival", () => {
	const base: OrderListEntry = {
		id: "o-1",
		orderNumber: "BNS-1",
		status: "shipped",
		placedAt: "2026-09-18T10:00:00.000Z",
		total: 1,
		itemCount: 1,
		firstItemTitle: "x",
		firstItemImageUrl: null,
		shopName: "s",
	};

	it("prefers the promised date, then the shop's estimate", () => {
		expect(
			purchaseArrival(
				{
					...base,
					arrival: {
						method: "seller_delivery",
						etaText: "sous 24 h",
						promisedBy: "2026-09-20T17:00:00.000Z",
					},
				},
				[],
			),
		).toEqual({ kind: "promised", at: "2026-09-20T17:00:00.000Z" });
		expect(
			purchaseArrival(
				{
					...base,
					arrival: { method: "pickup", etaText: "sous 24 h", promisedBy: null },
				},
				[],
			),
		).toEqual({ kind: "eta", text: "sous 24 h" });
	});

	it("shows the return deadline only alongside the return shortcut", () => {
		const delivered = {
			...base,
			status: "delivered" as const,
			actionSubject: {
				...shipped({}),
				deadlines: {
					...shipped({}).deadlines,
					withdrawalUntil: "2026-09-25T10:00:00.000Z",
				},
			},
		};
		expect(purchaseArrival(delivered, [])).toBeNull();
		expect(
			purchaseArrival(delivered, [{ kind: "return", href: "/x" }]),
		).toEqual({ kind: "returnUntil", at: "2026-09-25T10:00:00.000Z" });
	});
});
