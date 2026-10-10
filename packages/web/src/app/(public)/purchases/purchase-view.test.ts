import { describe, expect, it } from "bun:test";
import en from "~/../messages/en.json";
import fr from "~/../messages/fr.json";
import { availableActions } from "~/lib/order-actions";
import { ORDER_STATUSES } from "~/lib/order-status";
import type { OrderView } from "~/types/order";
import {
	BUYER_CANCEL_REASONS,
	cancelSchema,
	confirmCodeSchema,
	handoverCardState,
	PURCHASE_TABS,
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
