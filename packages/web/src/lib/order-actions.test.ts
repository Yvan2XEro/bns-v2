import { describe, expect, it, test } from "bun:test";
import type { OrderAction, OrderActionSubject } from "./order-actions";
import {
	availableActions,
	ORDER_ACTION_PERMISSIONS,
	ORDER_ACTION_ROUTES,
} from "./order-actions";
import { ORDER_STATUSES, type OrderStatusName } from "./order-status";

/**
 * The action table, transcribed by hand from the landed API — not imported
 * from `order-actions.ts`, which is the thing under test. Each row was read
 * off these sources, and the comment on a row names the one that decided it:
 *
 *  - `packages/api/src/services/orders/transitions.ts` — `STATUS_TRANSITIONS`
 *    (which status may become which) and `assertStatusAuthority` (which
 *    refuses every transition touching `paid`, `returned` or `disputed`
 *    without a P5/P6 caller's context).
 *  - `packages/api/src/services/orders/acceptance.ts` —
 *    `BUYER_CANCELLABLE_STATUSES`, `SELLER_CANCELLABLE_STATUSES`, and
 *    `declineOrder`'s own `placed`/`confirmed` guard.
 *  - `packages/api/src/services/orders/delivery.ts` + the seven delivery
 *    routes — each one's `order.status !== "shipped"` guard and its own
 *    audience check (`requireOrderBuyer` vs `requireOrderShopPermission`).
 *  - `packages/api/src/services/orders/withdrawal.ts` — buyer-only,
 *    `delivered` only.
 *  - `packages/api/src/services/orders/queries.ts` — `getOrderReceiptHtml`
 *    gates on `requireOrderAudience` alone, so every audience may print.
 *  - `packages/api/src/services/moderation.ts` —
 *    `MODERATOR_CANCELLABLE_STATUSES`, the staff cancel behind
 *    `POST /api/moderation/orders/{id}`: `placed`, `confirmed`, `accepted`,
 *    `shipped` and nothing else.
 *  - `packages/api/src/services/reviewRules.ts` —
 *    `ORDER_REVIEWABLE_STATUSES`, which `assertOrderReviewAllowed` holds the
 *    buyer's review of the shop to: `delivered` and `completed` only.
 */
const TABLE: Record<
	OrderStatusName,
	{
		buyer: readonly OrderAction[];
		shop: readonly OrderAction[];
		staff: readonly OrderAction[];
	}
> = {
	// placed → confirmed | paid | cancelled. No `accepted` row at all, so the
	// shop cannot accept here; it confirms by call (which confirms *and*
	// accepts in one transaction) or declines.
	placed: {
		buyer: ["confirm_code", "resend_code", "cancel", "receipt"],
		shop: ["confirm_by_call", "decline", "seller_cancel", "receipt"],
		staff: ["staff_cancel", "receipt"],
	},
	confirmed: {
		buyer: ["cancel", "receipt"],
		shop: ["accept", "decline", "seller_cancel", "receipt"],
		staff: ["staff_cancel", "receipt"],
	},
	// `paid` is P5's reserved status: `assertStatusAuthority` refuses every
	// transition into or out of it from a P4 caller, and neither
	// `BUYER_CANCELLABLE_STATUSES` nor `SELLER_CANCELLABLE_STATUSES` lists it.
	// So nothing is offered, even though `TAB_STATUSES.to_accept` shows it.
	paid: { buyer: ["receipt"], shop: ["receipt"], staff: ["receipt"] },
	accepted: {
		buyer: ["cancel", "receipt"],
		shop: ["ship", "seller_cancel", "receipt"],
		staff: ["staff_cancel", "receipt"],
	},
	// The buyer cannot cancel here (`BUYER_CANCELLABLE_STATUSES` stops at
	// `accepted`); refusing at the door is the delivery routes' business.
	shipped: {
		buyer: ["confirm_receipt", "regenerate_handover_code", "receipt"],
		shop: [
			"handover",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		],
		staff: ["staff_cancel", "receipt"],
	},
	delivered: {
		buyer: ["contest_delivery", "request_withdrawal", "review_shop", "receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	// The four terminal statuses (`TERMINAL_STATUSES`) plus `disputed`, whose
	// every outgoing transition is P6's. Nothing but the receipt.
	completed: {
		buyer: ["review_shop", "receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	cancelled: { buyer: ["receipt"], shop: ["receipt"], staff: ["receipt"] },
	delivery_failed: {
		buyer: ["receipt"],
		shop: ["receipt"],
		staff: ["receipt"],
	},
	returned: { buyer: ["receipt"], shop: ["receipt"], staff: ["receipt"] },
	disputed: { buyer: ["receipt"], shop: ["receipt"], staff: ["receipt"] },
};

const NOW = new Date("2026-10-02T12:00:00.000Z");
const LATER = "2026-10-03T12:00:00.000Z";
const EARLIER = "2026-10-01T12:00:00.000Z";

/**
 * An order whose every time-boxed and budget-boxed condition is satisfied, so
 * a row that comes back short of the table has been shortened by the status ×
 * audience rule rather than by a deadline. Each condition gets its own case
 * further down, where exactly one of these fields is changed.
 */
function subject(
	status: OrderStatusName,
	patch: Partial<OrderActionSubject> = {},
): OrderActionSubject {
	return {
		status,
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
			confirmBy: LATER,
			acceptBy: LATER,
			staleAt: LATER,
			completeAt: LATER,
			withdrawalUntil: LATER,
			contestBy: LATER,
		},
		deliveryFailure: null,
		completionHold: "none",
		reviewable: true,
		returnCaseNumber: null,
		...patch,
	};
}

function sorted(actions: readonly OrderAction[]): OrderAction[] {
	return [...actions].sort();
}

describe("availableActions: the status × audience table", () => {
	for (const status of ORDER_STATUSES) {
		const row = TABLE[status];

		test(`${status} / buyer offers exactly ${row.buyer.join(", ")}`, () => {
			expect(
				sorted(availableActions(subject(status), "buyer", null, NOW)),
			).toEqual(sorted(row.buyer));
		});

		test(`${status} / shop (owner) offers exactly ${row.shop.join(", ")}`, () => {
			expect(
				sorted(availableActions(subject(status), "shop", "owner", NOW)),
			).toEqual(sorted(row.shop));
		});

		test(`${status} / staff offers exactly ${row.staff.join(", ")}`, () => {
			expect(
				sorted(availableActions(subject(status), "staff", null, NOW)),
			).toEqual(sorted(row.staff));
		});
	}
});

describe("the table's own shape", () => {
	it("gives the buyer no shop action in any status", () => {
		const shopOnly: OrderAction[] = [
			"accept",
			"decline",
			"confirm_by_call",
			"seller_cancel",
			"ship",
			"handover",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
		];
		const offered = ORDER_STATUSES.flatMap((status) =>
			availableActions(subject(status), "buyer", null, NOW),
		);
		expect(offered.filter((action) => shopOnly.includes(action))).toEqual([]);
		// Proves the loop above actually ran rather than collecting nothing.
		expect(offered).toContain("confirm_code");
	});

	it("gives the shop no buyer action in any status", () => {
		const buyerOnly: OrderAction[] = [
			"confirm_code",
			"resend_code",
			"cancel",
			"confirm_receipt",
			"regenerate_handover_code",
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
		];
		const offered = ORDER_STATUSES.flatMap((status) =>
			availableActions(subject(status), "shop", "owner", NOW),
		);
		expect(offered.filter((action) => buyerOnly.includes(action))).toEqual([]);
		expect(offered).toContain("ship");
	});

	it("offers staff nothing but staff_cancel and the receipt", () => {
		const offered = new Set(
			ORDER_STATUSES.flatMap((status) =>
				availableActions(subject(status), "staff", null, NOW),
			),
		);
		expect([...offered].sort()).toEqual(["receipt", "staff_cancel"]);
	});

	it("offers the receipt in every one of the 33 cells", () => {
		const cells = ORDER_STATUSES.flatMap((status) => [
			availableActions(subject(status), "buyer", null, NOW),
			availableActions(subject(status), "shop", "owner", NOW),
			availableActions(subject(status), "staff", null, NOW),
		]);
		expect(cells).toHaveLength(33);
		expect(cells.filter((cell) => cell.includes("receipt"))).toHaveLength(33);
	});

	it("keeps the table's declared order, primary action first and the receipt last", () => {
		expect(availableActions(subject("shipped"), "shop", "owner", NOW)).toEqual([
			"handover",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		]);
		expect(availableActions(subject("delivered"), "buyer", null, NOW)).toEqual([
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
			"receipt",
		]);
	});
});

describe("the shop permission matrix decides, not a role comparison", () => {
	it("gives a staff member no seller_cancel on an accepted order", () => {
		expect(availableActions(subject("accepted"), "shop", "staff", NOW)).toEqual(
			["ship", "receipt"],
		);
	});

	it("gives an owner and a manager the same accepted row", () => {
		const owner = availableActions(subject("accepted"), "shop", "owner", NOW);
		const manager = availableActions(
			subject("accepted"),
			"shop",
			"manager",
			NOW,
		);
		expect(manager).toEqual(owner);
		expect(manager).toContain("seller_cancel");
	});

	it("gives a staff member every orders.process action on a shipped order", () => {
		expect(availableActions(subject("shipped"), "shop", "staff", NOW)).toEqual([
			"handover",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		]);
	});

	it("offers a shop audience with no role only the receipt", () => {
		expect(availableActions(subject("confirmed"), "shop", null, NOW)).toEqual([
			"receipt",
		]);
	});
});

describe("each per-order condition drops exactly its own action", () => {
	it("drops confirm_code and resend_code when no SMS code was ever required", () => {
		const actions = availableActions(
			subject("placed", {
				confirmation: {
					method: "verified_phone",
					required: "none",
					attemptsLeft: 5,
					resendsLeft: 3,
				},
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["cancel", "receipt"]);
	});

	it("drops confirm_code alone when the five attempts are spent", () => {
		const actions = availableActions(
			subject("placed", {
				confirmation: {
					method: "sms_code",
					required: "sms_code",
					attemptsLeft: 0,
					resendsLeft: 3,
				},
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["resend_code", "cancel", "receipt"]);
	});

	it("drops resend_code alone when the three resends are spent", () => {
		const actions = availableActions(
			subject("placed", {
				confirmation: {
					method: "sms_code",
					required: "sms_code",
					attemptsLeft: 5,
					resendsLeft: 0,
				},
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["confirm_code", "cancel", "receipt"]);
	});

	it("drops both code actions once confirmBy has passed", () => {
		const actions = availableActions(
			subject("placed", {
				deadlines: { ...subject("placed").deadlines, confirmBy: EARLIER },
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["cancel", "receipt"]);
	});

	it("drops confirm_by_call once confirmBy has passed, and keeps decline", () => {
		const actions = availableActions(
			subject("placed", {
				deadlines: { ...subject("placed").deadlines, confirmBy: EARLIER },
			}),
			"shop",
			"owner",
			NOW,
		);
		expect(actions).toEqual(["decline", "seller_cancel", "receipt"]);
	});

	it("drops accept once acceptBy has passed, and keeps decline", () => {
		const actions = availableActions(
			subject("confirmed", {
				deadlines: { ...subject("confirmed").deadlines, acceptBy: EARLIER },
			}),
			"shop",
			"owner",
			NOW,
		);
		expect(actions).toEqual(["decline", "seller_cancel", "receipt"]);
	});

	it("keeps accept when there is no acceptBy at all", () => {
		const actions = availableActions(
			subject("confirmed", {
				deadlines: { ...subject("confirmed").deadlines, acceptBy: null },
			}),
			"shop",
			"owner",
			NOW,
		);
		expect(actions).toContain("accept");
	});

	it("drops handover when the code is locked, keeping the two fallbacks", () => {
		const actions = availableActions(
			subject("shipped", {
				handover: {
					method: null,
					locked: true,
					attemptsLeft: 0,
					regenerationsLeft: 3,
				},
			}),
			"shop",
			"owner",
			NOW,
		);
		expect(actions).toEqual([
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
			"receipt",
		]);
	});

	it("drops handover when the attempts are spent but the lock flag has not been read back yet", () => {
		const actions = availableActions(
			subject("shipped", {
				handover: {
					method: null,
					locked: false,
					attemptsLeft: 0,
					regenerationsLeft: 3,
				},
			}),
			"shop",
			"owner",
			NOW,
		);
		expect(actions).not.toContain("handover");
		expect(actions).toContain("declare_delivered");
	});

	it("drops regenerate_handover_code when the three regenerations are spent", () => {
		const actions = availableActions(
			subject("shipped", {
				handover: {
					method: null,
					locked: true,
					attemptsLeft: 0,
					regenerationsLeft: 0,
				},
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["confirm_receipt", "receipt"]);
	});

	it("drops report_failed_attempt once one attempt is already recorded", () => {
		const actions = availableActions(
			subject("shipped", {
				deliveryFailure: { reason: "absent", attempts: 1, note: null },
			}),
			"shop",
			"owner",
			NOW,
		);
		expect(actions).toEqual([
			"handover",
			"declare_delivered",
			"mark_delivery_failed",
			"receipt",
		]);
	});

	it("drops contest_delivery when the handover was not a seller declaration", () => {
		const actions = availableActions(
			subject("delivered", {
				handover: {
					method: "otp",
					locked: false,
					attemptsLeft: 5,
					regenerationsLeft: 3,
				},
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["request_withdrawal", "review_shop", "receipt"]);
	});

	it("drops contest_delivery once contestBy has passed", () => {
		const actions = availableActions(
			subject("delivered", {
				deadlines: { ...subject("delivered").deadlines, contestBy: EARLIER },
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["request_withdrawal", "review_shop", "receipt"]);
	});

	it("drops contest_delivery when there is no contest window at all", () => {
		const actions = availableActions(
			subject("delivered", {
				deadlines: { ...subject("delivered").deadlines, contestBy: null },
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["request_withdrawal", "review_shop", "receipt"]);
	});

	it("drops request_withdrawal once the 15-day window has closed", () => {
		const actions = availableActions(
			subject("delivered", {
				deadlines: {
					...subject("delivered").deadlines,
					withdrawalUntil: EARLIER,
				},
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["contest_delivery", "review_shop", "receipt"]);
	});

	it("drops request_withdrawal when there is no withdrawal deadline at all", () => {
		const actions = availableActions(
			subject("delivered", {
				deadlines: {
					...subject("delivered").deadlines,
					withdrawalUntil: null,
				},
			}),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["contest_delivery", "review_shop", "receipt"]);
	});

	it("drops request_withdrawal when a return case is already open", () => {
		const actions = availableActions(
			subject("delivered", { returnCaseNumber: "RET-2610-000001" }),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["contest_delivery", "review_shop", "receipt"]);
	});

	it("drops request_withdrawal when completion is held by a return case", () => {
		const actions = availableActions(
			subject("delivered", { completionHold: "return_case" }),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual(["contest_delivery", "review_shop", "receipt"]);
	});

	it("still offers contest_delivery while completion is held by a dispute", () => {
		const actions = availableActions(
			subject("delivered", { completionHold: "dispute" }),
			"buyer",
			null,
			NOW,
		);
		expect(actions).toEqual([
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
			"receipt",
		]);
	});
});

describe("every action names the route that answers it", () => {
	it("covers each action the table can offer, and nothing more", () => {
		const offered = new Set<OrderAction>();
		for (const status of ORDER_STATUSES) {
			for (const action of availableActions(
				subject(status),
				"buyer",
				null,
				NOW,
			))
				offered.add(action);
			for (const action of availableActions(
				subject(status),
				"shop",
				"owner",
				NOW,
			))
				offered.add(action);
			for (const action of availableActions(
				subject(status),
				"staff",
				null,
				NOW,
			))
				offered.add(action);
		}
		expect(offered.size).toBe(19);
		expect(Object.keys(ORDER_ACTION_ROUTES).sort()).toEqual(
			[...offered].sort(),
		);
	});

	it("points each action at the path and method the API actually exposes", () => {
		expect(ORDER_ACTION_ROUTES.handover).toEqual({
			method: "POST",
			path: "/api/orders/{id}/handover",
		});
		expect(ORDER_ACTION_ROUTES.receipt).toEqual({
			method: "GET",
			path: "/api/orders/{id}/receipt",
		});
		expect(ORDER_ACTION_ROUTES.request_withdrawal).toEqual({
			method: "POST",
			path: "/api/orders/{id}/withdrawal",
		});
		expect(ORDER_ACTION_ROUTES.staff_cancel).toEqual({
			method: "POST",
			path: "/api/moderation/orders/{id}",
		});
		expect(ORDER_ACTION_ROUTES.review_shop).toEqual({
			method: "POST",
			path: "/api/reviews",
		});
		expect(ORDER_ACTION_ROUTES.resend_code).toEqual({
			method: "POST",
			path: "/api/orders/{id}/confirmation-code/resend",
		});
	});

	it("gates seller_cancel on orders.cancel and every other shop action on orders.process", () => {
		expect(ORDER_ACTION_PERMISSIONS.seller_cancel).toBe("orders.cancel");
		for (const action of [
			"accept",
			"decline",
			"confirm_by_call",
			"ship",
			"handover",
			"declare_delivered",
			"report_failed_attempt",
			"mark_delivery_failed",
		] as const) {
			expect(ORDER_ACTION_PERMISSIONS[action]).toBe("orders.process");
		}
	});

	it("gates no buyer or staff action on a shop permission", () => {
		for (const action of [
			"confirm_code",
			"resend_code",
			"cancel",
			"confirm_receipt",
			"regenerate_handover_code",
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
			"receipt",
			"staff_cancel",
		] as const) {
			expect(ORDER_ACTION_PERMISSIONS[action]).toBeUndefined();
		}
	});
});

// The serialiser computes `reviewable` from reviewRules (one review per
// order, buyer only, delivered or completed); the table says where the
// button may exist, this flag says whether it still does.
describe("review_shop gating", () => {
	it("offers the review on a delivered order the buyer has not reviewed", () => {
		expect(availableActions(subject("delivered"), "buyer")).toContain(
			"review_shop",
		);
	});

	it("withholds the review once the serialiser says it is spent", () => {
		expect(
			availableActions(subject("delivered", { reviewable: false }), "buyer"),
		).not.toContain("review_shop");
		// The row itself still carries it — the gate is the condition, not the
		// table, which must keep agreeing with mobile's cell for cell.
		expect(
			availableActions(subject("completed", { reviewable: false }), "buyer"),
		).toEqual(["receipt"]);
	});
});
