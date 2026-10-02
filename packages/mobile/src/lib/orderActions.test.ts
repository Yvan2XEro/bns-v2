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
		paymentMethod: "cod",
		completionHold: "none",
		deadlines: {
			confirmBy: FUTURE,
			acceptBy: FUTURE,
			withdrawalUntil: FUTURE,
		},
		deliveryFailure: null,
		...patch,
	};
}

/**
 * Transcribed by hand from the landed backend — `services/orders/transitions.ts`
 * (which status may become which, and which of them this phase may write at
 * all), `access/orderAccess.ts` (one audience per caller) and each route's own
 * audience guard under `app/(frontend)/api/orders/[id]/`. Deliberately a
 * literal here rather than an import: a test that reads the table it asserts
 * proves nothing.
 */
const TABLE: Array<{
	status: OrderStatusName;
	audience: OrderAudienceKind;
	actions: OrderAction[];
}> = [
	{
		status: "placed",
		audience: "buyer",
		actions: ["confirm_code", "resend_code", "cancel_order", "view_receipt"],
	},
	{
		status: "placed",
		audience: "shop",
		actions: [
			"confirm_by_call",
			"decline_order",
			"seller_cancel_order",
			"view_receipt",
		],
	},
	{ status: "placed", audience: "staff", actions: ["view_receipt"] },

	{
		status: "confirmed",
		audience: "buyer",
		actions: ["cancel_order", "view_receipt"],
	},
	{
		status: "confirmed",
		audience: "shop",
		actions: [
			"accept_order",
			"decline_order",
			"seller_cancel_order",
			"view_receipt",
		],
	},
	{ status: "confirmed", audience: "staff", actions: ["view_receipt"] },

	// `paid` is reserved for P5: `assertStatusAuthority` refuses every
	// transition into or out of it without a reserved-phase context, so a P4
	// screen that offered "accept" here would hand the seller a 409.
	{ status: "paid", audience: "buyer", actions: ["view_receipt"] },
	{ status: "paid", audience: "shop", actions: ["view_receipt"] },
	{ status: "paid", audience: "staff", actions: ["view_receipt"] },

	{
		status: "accepted",
		audience: "buyer",
		actions: ["cancel_order", "view_receipt"],
	},
	{
		status: "accepted",
		audience: "shop",
		actions: ["ship_order", "seller_cancel_order", "view_receipt"],
	},
	{ status: "accepted", audience: "staff", actions: ["view_receipt"] },

	{
		status: "shipped",
		audience: "buyer",
		actions: ["confirm_receipt", "regenerate_handover_code", "view_receipt"],
	},
	{
		status: "shipped",
		audience: "shop",
		actions: [
			"verify_handover_code",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"view_receipt",
		],
	},
	{ status: "shipped", audience: "staff", actions: ["view_receipt"] },

	{
		status: "delivered",
		audience: "buyer",
		actions: [
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
			"view_receipt",
		],
	},
	{ status: "delivered", audience: "shop", actions: ["view_receipt"] },
	{ status: "delivered", audience: "staff", actions: ["view_receipt"] },

	{
		status: "completed",
		audience: "buyer",
		actions: ["review_shop", "view_receipt"],
	},
	{ status: "completed", audience: "shop", actions: ["view_receipt"] },
	{ status: "completed", audience: "staff", actions: ["view_receipt"] },

	{ status: "cancelled", audience: "buyer", actions: ["view_receipt"] },
	{ status: "cancelled", audience: "shop", actions: ["view_receipt"] },
	{ status: "cancelled", audience: "staff", actions: ["view_receipt"] },

	{ status: "delivery_failed", audience: "buyer", actions: ["view_receipt"] },
	{ status: "delivery_failed", audience: "shop", actions: ["view_receipt"] },
	{ status: "delivery_failed", audience: "staff", actions: ["view_receipt"] },

	{ status: "returned", audience: "buyer", actions: ["view_receipt"] },
	{ status: "returned", audience: "shop", actions: ["view_receipt"] },
	{ status: "returned", audience: "staff", actions: ["view_receipt"] },

	{ status: "disputed", audience: "buyer", actions: ["view_receipt"] },
	{ status: "disputed", audience: "shop", actions: ["view_receipt"] },
	{ status: "disputed", audience: "staff", actions: ["view_receipt"] },
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
		).toEqual(["ship_order", "seller_cancel_order", "view_receipt"]);
	});

	test("a staff member may ship but never cancel the shop's order", () => {
		expect(
			availableActions(orderAt("accepted"), "shop", "staff", { now: NOW }),
		).toEqual(["ship_order", "view_receipt"]);
	});

	test("a staff member on a placed order keeps decline and loses cancel", () => {
		expect(
			availableActions(orderAt("placed"), "shop", "staff", { now: NOW }),
		).toEqual(["confirm_by_call", "decline_order", "view_receipt"]);
	});

	test("a shop audience with no resolved role gets the receipt only", () => {
		expect(
			availableActions(orderAt("accepted"), "shop", null, { now: NOW }),
		).toEqual(["view_receipt"]);
	});

	test("the role never narrows a buyer's own actions", () => {
		expect(
			availableActions(orderAt("accepted"), "buyer", null, { now: NOW }),
		).toEqual(["cancel_order", "view_receipt"]);
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
		).toEqual(["decline_order", "seller_cancel_order", "view_receipt"]);
	});

	test("a placed order past confirmBy offers neither code nor seller call", () => {
		const subject = orderAt("placed", {
			deadlines: { confirmBy: PAST, acceptBy: FUTURE },
		});
		expect(availableActions(subject, "buyer", null, { now: NOW })).toEqual([
			"cancel_order",
			"view_receipt",
		]);
		expect(availableActions(subject, "shop", "owner", { now: NOW })).toEqual([
			"decline_order",
			"seller_cancel_order",
			"view_receipt",
		]);
	});

	test("a placed order with no confirmBy offers neither code nor seller call", () => {
		const subject = orderAt("placed", { deadlines: {} });
		expect(availableActions(subject, "buyer", null, { now: NOW })).toEqual([
			"cancel_order",
			"view_receipt",
		]);
		expect(availableActions(subject, "shop", "owner", { now: NOW })).toEqual([
			"decline_order",
			"seller_cancel_order",
			"view_receipt",
		]);
	});

	test("a delivered order past withdrawalUntil no longer offers a return", () => {
		expect(
			availableActions(
				orderAt("delivered", { deadlines: { withdrawalUntil: PAST } }),
				"buyer",
				null,
				{ now: NOW },
			),
		).toEqual(["contest_delivery", "review_shop", "view_receipt"]);
	});

	test("a delivered order with no withdrawalUntil still offers a return", () => {
		expect(
			availableActions(orderAt("delivered", { deadlines: {} }), "buyer", null, {
				now: NOW,
			}),
		).toEqual([
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
			"view_receipt",
		]);
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
			"verify_handover_code",
			"declare_delivered",
			"mark_delivery_failed",
			"view_receipt",
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
		).toEqual(["contest_delivery", "review_shop", "view_receipt"]);
	});

	test("a delivered order held by a dispute offers neither contest nor return", () => {
		expect(
			availableActions(
				orderAt("delivered", { completionHold: "dispute" }),
				"buyer",
				null,
				{ now: NOW },
			),
		).toEqual(["review_shop", "view_receipt"]);
	});
});

describe("canTakeAction", () => {
	test("answers true for an action the status and audience allow", () => {
		expect(
			canTakeAction(orderAt("accepted"), "ship_order", "shop", "owner", {
				now: NOW,
			}),
		).toBe(true);
	});

	test("answers false for the seller cancel a staff member may not take", () => {
		expect(
			canTakeAction(
				orderAt("accepted"),
				"seller_cancel_order",
				"shop",
				"staff",
				{ now: NOW },
			),
		).toBe(false);
	});

	test("answers false for an action belonging to the other audience", () => {
		expect(
			canTakeAction(orderAt("accepted"), "ship_order", "buyer", null, {
				now: NOW,
			}),
		).toBe(false);
	});
});
