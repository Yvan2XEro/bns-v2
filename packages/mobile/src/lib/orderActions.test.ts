import { describe, expect, test } from "bun:test";
import type { OrderAudienceKind } from "../types/order";
import {
	availableActions,
	canTakeAction,
	type OrderAction,
	type OrderActionSubject,
} from "./orderActions";
import type { OrderStatusName } from "./orderStatus";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const FUTURE = "2026-10-05T12:00:00.000Z";
const PAST = "2026-09-20T12:00:00.000Z";

/**
 * An order in `status` with every *time* and *counter* condition satisfied,
 * so a row's assertion below is about the status/audience cell alone and
 * never about a deadline that happened to be stale in the fixture.
 */
function orderAt(
	status: OrderStatusName,
	patch: Partial<OrderActionSubject> = {},
): OrderActionSubject {
	return {
		status,
		completionHold: "none",
		confirmation: {
			method: "sms_code",
			required: "sms_code",
			attemptsLeft: 5,
			resendsLeft: 3,
		},
		handover: {
			method: "seller_declaration",
			locked: false,
			attemptsLeft: 5,
			regenerationsLeft: 3,
		},
		deadlines: {
			confirmBy: FUTURE,
			acceptBy: FUTURE,
			withdrawalUntil: FUTURE,
			contestBy: FUTURE,
		},
		deliveryFailure: null,
		returnCaseNumber: null,
		reviewable: true,
		...patch,
	};
}

/**
 * Transcribed by hand from the landed backend — `services/orders/transitions.ts`
 * (which status may become which, and which of them this phase may write at
 * all), `access/orderAccess.ts` (one audience per caller) and each route's own
 * audience guard under `app/(frontend)/api/orders/[id]/`, plus
 * `services/moderation.ts#MODERATOR_CANCELLABLE_STATUSES` (the staff cancel)
 * and `services/reviewRules.ts#ORDER_REVIEWABLE_STATUSES` (the buyer's
 * review). Deliberately a literal here rather than an import: a test that
 * reads the table it asserts proves nothing.
 */
const TABLE: Array<{
	status: OrderStatusName;
	audience: OrderAudienceKind;
	actions: OrderAction[];
}> = [
	{
		status: "placed",
		audience: "buyer",
		actions: ["confirm_code", "resend_code", "cancel", "receipt"],
	},
	{
		status: "placed",
		audience: "shop",
		actions: ["confirm_by_call", "decline", "seller_cancel", "receipt"],
	},
	{
		status: "placed",
		audience: "staff",
		actions: ["staff_cancel", "receipt"],
	},

	{
		status: "confirmed",
		audience: "buyer",
		actions: ["cancel", "receipt"],
	},
	{
		status: "confirmed",
		audience: "shop",
		actions: ["accept", "decline", "seller_cancel", "receipt"],
	},
	{
		status: "confirmed",
		audience: "staff",
		actions: ["staff_cancel", "receipt"],
	},

	// `paid → accepted|cancelled` are P5's unreserved rows: the shop accepts
	// or declines, the buyer may still cancel, and the refund follows. No
	// the staff cancel: `MODERATOR_CANCELLABLE_STATUSES` lists `paid` now.
	{ status: "paid", audience: "buyer", actions: ["cancel", "receipt"] },
	{
		status: "paid",
		audience: "shop",
		actions: ["accept", "decline", "receipt"],
	},
	{
		status: "paid",
		audience: "staff",
		actions: ["staff_cancel", "receipt"],
	},

	{
		status: "accepted",
		audience: "buyer",
		actions: ["cancel", "receipt"],
	},
	{
		status: "accepted",
		audience: "shop",
		actions: ["ship", "seller_cancel", "receipt"],
	},
	{
		status: "accepted",
		audience: "staff",
		actions: ["staff_cancel", "receipt"],
	},

	{
		status: "shipped",
		audience: "buyer",
		actions: ["confirm_receipt", "regenerate_handover_code", "receipt"],
	},
	{
		status: "shipped",
		audience: "shop",
		actions: [
			"handover",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		],
	},
	{
		status: "shipped",
		audience: "staff",
		actions: ["staff_cancel", "receipt"],
	},

	{
		status: "delivered",
		audience: "buyer",
		actions: [
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
			"receipt",
		],
	},
	{ status: "delivered", audience: "shop", actions: ["receipt"] },
	{ status: "delivered", audience: "staff", actions: ["receipt"] },

	{
		status: "completed",
		audience: "buyer",
		actions: ["review_shop", "receipt"],
	},
	{ status: "completed", audience: "shop", actions: ["receipt"] },
	{ status: "completed", audience: "staff", actions: ["receipt"] },

	{ status: "cancelled", audience: "buyer", actions: ["receipt"] },
	{ status: "cancelled", audience: "shop", actions: ["receipt"] },
	{ status: "cancelled", audience: "staff", actions: ["receipt"] },

	{ status: "delivery_failed", audience: "buyer", actions: ["receipt"] },
	{ status: "delivery_failed", audience: "shop", actions: ["receipt"] },
	{ status: "delivery_failed", audience: "staff", actions: ["receipt"] },

	{ status: "returned", audience: "buyer", actions: ["receipt"] },
	{ status: "returned", audience: "shop", actions: ["receipt"] },
	{ status: "returned", audience: "staff", actions: ["receipt"] },

	{ status: "disputed", audience: "buyer", actions: ["receipt"] },
	{ status: "disputed", audience: "shop", actions: ["receipt"] },
	{ status: "disputed", audience: "staff", actions: ["receipt"] },
];

describe("availableActions: the 33 status × audience rows", () => {
	test("the transcribed table covers every status for all three audiences", () => {
		expect(TABLE).toHaveLength(33);
	});

	for (const row of TABLE) {
		test(`${row.status} / ${row.audience}`, () => {
			expect(
				availableActions(orderAt(row.status), row.audience, "owner", {
					now: NOW,
				}),
			).toEqual(row.actions);
		});
	}
});

describe("availableActions: the shop role filter", () => {
	test("a manager keeps the shop cancel, which needs orders.cancel", () => {
		expect(
			availableActions(orderAt("accepted"), "shop", "manager", { now: NOW }),
		).toEqual(["ship", "seller_cancel", "receipt"]);
	});

	test("a staff member may ship but never cancel the shop's order", () => {
		expect(
			availableActions(orderAt("accepted"), "shop", "staff", { now: NOW }),
		).toEqual(["ship", "receipt"]);
	});

	test("a staff member on a placed order keeps decline and loses cancel", () => {
		expect(
			availableActions(orderAt("placed"), "shop", "staff", { now: NOW }),
		).toEqual(["confirm_by_call", "decline", "receipt"]);
	});

	test("a shop audience with no resolved role gets the receipt only", () => {
		expect(
			availableActions(orderAt("accepted"), "shop", null, { now: NOW }),
		).toEqual(["receipt"]);
	});

	test("the role never narrows a buyer's own actions", () => {
		expect(
			availableActions(orderAt("accepted"), "buyer", null, { now: NOW }),
		).toEqual(["cancel", "receipt"]);
	});
});

describe("availableActions: the deadlines the server will enforce", () => {
	test("a confirmed order past acceptBy no longer offers accept", () => {
		expect(
			availableActions(
				orderAt("confirmed", {
					deadlines: { acceptBy: PAST, confirmBy: FUTURE },
				}),
				"shop",
				"owner",
				{ now: NOW },
			),
		).toEqual(["decline", "seller_cancel", "receipt"]);
	});

	test("a placed order past confirmBy offers neither code nor seller call", () => {
		const subject = orderAt("placed", {
			deadlines: { confirmBy: PAST, acceptBy: FUTURE },
		});
		expect(availableActions(subject, "buyer", null, { now: NOW })).toEqual([
			"cancel",
			"receipt",
		]);
		expect(availableActions(subject, "shop", "owner", { now: NOW })).toEqual([
			"decline",
			"seller_cancel",
			"receipt",
		]);
	});

	// An absent deadline reads as unbounded, exactly as the server reads it:
	// `checkConfirmation` and `confirmBySellerCall` only refuse a deadline
	// that exists and has passed. (Spent counters, not absent deadlines, are
	// what closes these paths in practice.)
	test("a placed order with no confirmBy keeps the code and the seller call", () => {
		const subject = orderAt("placed", { deadlines: {} });
		expect(availableActions(subject, "buyer", null, { now: NOW })).toEqual([
			"confirm_code",
			"resend_code",
			"cancel",
			"receipt",
		]);
		expect(availableActions(subject, "shop", "owner", { now: NOW })).toEqual([
			"confirm_by_call",
			"decline",
			"seller_cancel",
			"receipt",
		]);
	});

	test("a delivered order past withdrawalUntil no longer offers a return", () => {
		expect(
			availableActions(
				orderAt("delivered", {
					deadlines: { withdrawalUntil: PAST, contestBy: FUTURE },
				}),
				"buyer",
				null,
				{ now: NOW },
			),
		).toEqual(["contest_delivery", "review_shop", "receipt"]);
	});

	test("a carrier POD delivery remains contestable during the window", () => {
		expect(
			availableActions(
				orderAt("delivered", {
					handover: {
						method: "carrier_pod",
						locked: false,
						attemptsLeft: 5,
						regenerationsLeft: 3,
					},
				}),
				"buyer",
				null,
				{ now: NOW },
			),
		).toContain("contest_delivery");
	});

	// A window that must exist to be open: `openWithdrawal` and
	// `contestDelivery` both refuse an order with no deadline recorded, so an
	// absent one reads as closed rather than unbounded — the opposite of the
	// optional deadlines above, and the same split web makes.
	test("a delivered order with no windows recorded offers neither return nor contest", () => {
		expect(
			availableActions(orderAt("delivered", { deadlines: {} }), "buyer", null, {
				now: NOW,
			}),
		).toEqual(["review_shop", "receipt"]);
	});
});

describe("availableActions: the counters the server will enforce", () => {
	test("a first failed attempt is offered, a second is not", () => {
		expect(
			availableActions(orderAt("shipped"), "shop", "owner", { now: NOW }),
		).toContain("report_failed_attempt");
		expect(
			availableActions(
				orderAt("shipped", {
					deliveryFailure: { attempts: 1, reason: "absent", note: null },
				}),
				"shop",
				"owner",
				{ now: NOW },
			),
		).toEqual([
			"handover",
			"declare_delivered",
			"mark_delivery_failed",
			"receipt",
		]);
	});

	test("a delivered order already held by a return case offers no second return", () => {
		expect(
			availableActions(
				orderAt("delivered", { completionHold: "return_case" }),
				"buyer",
				null,
				{ now: NOW },
			),
		).toEqual(["contest_delivery", "review_shop", "receipt"]);
	});

	// The dispute hold blocks completion, not the buyer: `contestDelivery`'s
	// only gates are the declaration and the window, and `openWithdrawal`'s
	// only guard is the return case. The client inventing a stricter rule
	// here is exactly the divergence this file exists to prevent.
	test("a dispute hold takes nothing away that the server would accept", () => {
		expect(
			availableActions(
				orderAt("delivered", { completionHold: "dispute" }),
				"buyer",
				null,
				{ now: NOW },
			),
		).toEqual([
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
			"receipt",
		]);
	});
});

// Each ported condition gets the test that reddens exactly it — the first
// port of these conditions shipped without them, and a mutation that
// hard-wired the handover lock to true survived the whole suite.
describe("availableActions: each condition fails for its own reason", () => {
	test("a locked handover drops the code entry and nothing else", () => {
		const subject = orderAt("shipped", {
			handover: {
				method: null,
				locked: true,
				attemptsLeft: 3,
				regenerationsLeft: 3,
			},
		});
		expect(availableActions(subject, "shop", "owner", { now: NOW })).toEqual([
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		]);
	});

	test("spent handover attempts drop the code entry even unlocked", () => {
		const subject = orderAt("shipped", {
			handover: {
				method: null,
				locked: false,
				attemptsLeft: 0,
				regenerationsLeft: 3,
			},
		});
		expect(
			availableActions(subject, "shop", "owner", { now: NOW }),
		).not.toContain("handover");
	});

	test("spent regenerations drop the buyer's new-code button", () => {
		const subject = orderAt("shipped", {
			handover: {
				method: null,
				locked: false,
				attemptsLeft: 5,
				regenerationsLeft: 0,
			},
		});
		expect(availableActions(subject, "buyer", null, { now: NOW })).toEqual([
			"confirm_receipt",
			"receipt",
		]);
	});

	test("a handover that was not a declaration offers no contest", () => {
		const subject = orderAt("delivered", {
			handover: {
				method: "buyer_confirmation",
				locked: false,
				attemptsLeft: 5,
				regenerationsLeft: 3,
			},
		});
		expect(availableActions(subject, "buyer", null, { now: NOW })).toEqual([
			"request_withdrawal",
			"review_shop",
			"receipt",
		]);
	});

	test("spent confirmation attempts drop the code and keep the resend", () => {
		const subject = orderAt("placed", {
			confirmation: {
				method: "sms_code",
				required: "sms_code",
				attemptsLeft: 0,
				resendsLeft: 2,
			},
		});
		const actions = availableActions(subject, "buyer", null, { now: NOW });
		expect(actions).not.toContain("confirm_code");
		expect(actions).toContain("resend_code");
	});

	test("spent resends drop the resend and keep the code", () => {
		const subject = orderAt("placed", {
			confirmation: {
				method: "sms_code",
				required: "sms_code",
				attemptsLeft: 2,
				resendsLeft: 0,
			},
		});
		const actions = availableActions(subject, "buyer", null, { now: NOW });
		expect(actions).toContain("confirm_code");
		expect(actions).not.toContain("resend_code");
	});

	test("a return case on the order drops the return even inside the window", () => {
		const subject = orderAt("delivered", { returnCaseNumber: "RC-2026-0001" });
		expect(
			availableActions(subject, "buyer", null, { now: NOW }),
		).not.toContain("request_withdrawal");
	});
});

describe("canTakeAction", () => {
	test("answers true for an action the status and audience allow", () => {
		expect(
			canTakeAction(orderAt("accepted"), "ship", "shop", "owner", {
				now: NOW,
			}),
		).toBe(true);
	});

	test("answers false for the seller cancel a staff member may not take", () => {
		expect(
			canTakeAction(orderAt("accepted"), "seller_cancel", "shop", "staff", {
				now: NOW,
			}),
		).toBe(false);
	});

	test("answers false for an action belonging to the other audience", () => {
		expect(
			canTakeAction(orderAt("accepted"), "ship", "buyer", null, {
				now: NOW,
			}),
		).toBe(false);
	});
});

// The serialiser computes `reviewable` from reviewRules (one review per
// order, buyer only, delivered or completed); the table says where the
// button may exist, this flag says whether it still does.
describe("review_shop gating", () => {
	test("offers the review on a delivered order the buyer has not reviewed", () => {
		expect(availableActions(orderAt("delivered"), "buyer")).toContain(
			"review_shop",
		);
	});

	test("withholds the review once the serialiser says it is spent", () => {
		expect(
			availableActions(orderAt("delivered", { reviewable: false }), "buyer"),
		).not.toContain("review_shop");
		expect(
			availableActions(orderAt("completed", { reviewable: false }), "buyer"),
		).toEqual(["receipt"]);
	});
});
