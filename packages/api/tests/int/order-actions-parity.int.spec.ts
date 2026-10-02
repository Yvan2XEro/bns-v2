// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	ORDER_ACTION_PERMISSIONS as mobileActionPermissions,
	ORDER_ACTIONS as mobileActions,
	ORDER_ACTION_TABLE as mobileActionTable,
	type OrderAction,
} from "../../../mobile/src/lib/orderActions";
import {
	ORDER_ACTION_PERMISSIONS as webActionPermissions,
	ORDER_ACTION_ROUTES as webActionRoutes,
	ORDER_ACTIONS_BY_STATUS as webActionTable,
} from "../../../web/src/lib/order-actions";
import { can, ROLE_PERMISSIONS, SHOP_ROLES } from "../../src/access/shopRoles";
import { ORDER_STATUS_NAMES } from "../../src/lib/orderFormat";
import { MODERATOR_CANCELLABLE_STATUSES } from "../../src/services/moderation";
import {
	BUYER_CANCELLABLE_STATUSES,
	SELLER_CANCELLABLE_STATUSES,
} from "../../src/services/orders/acceptance";
import {
	RESERVED_STATUSES,
	STATUS_TRANSITIONS,
	TERMINAL_STATUSES,
} from "../../src/services/orders/transitions";
import { ORDER_REVIEWABLE_STATUSES } from "../../src/services/reviewRules";

/**
 * "Which buttons does this state offer" is a 33-cell table the plan calls
 * *transcribed*, and it exists nowhere in the plan — so it is hand-derived in
 * each client from the backend's own sources: `STATUS_TRANSITIONS` (which
 * status may become which), `RESERVED_STATUSES` (which of those this phase may
 * write at all), each route's own audience and permission guard,
 * `MODERATOR_CANCELLABLE_STATUSES` (the staff lever) and
 * `ORDER_REVIEWABLE_STATUSES` (the buyer's review).
 *
 * This file runs the direction `shop-permissions-parity.int.spec.ts`
 * established: it is API code, so it imports *both* client tables into its own
 * type-check and diffs them against the real source of truth at runtime. A
 * table that only asserted itself — which is all either client's own test can
 * do — would stay green while the server's graph moved under it.
 *
 * Deriving the table twice produced exactly the two drifts this file now
 * closes: seven actions carried a different name in each client, so nothing
 * could compare them; and each table was missing one action the other had —
 * web had no review at all, mobile had no staff cancel. Hence the last
 * `describe` below, which compares the two structures cell for cell with **no
 * name map**. The clients therefore share one vocabulary, taken from the API
 * route segments the actions post to (`accept`, `ship`, `handover`, …).
 */

/**
 * The status each action asks the server to write, transcribed here — on the
 * API side, beside the real tables — from the services the routes call:
 * `acceptance.ts` (`confirmByBuyerCode`, `confirmBySellerCall`, `acceptOrder`,
 * `declineOrder`, `sellerCancelOrder`, `buyerCancelOrder`, `shipOrder`),
 * `delivery.ts` (`markDelivered`, `markDeliveryFailed`) and `moderation.ts`
 * (`cancelOrderAsModerator`). The actions left out write no status:
 * `resend_code`, `report_failed_attempt`, `contest_delivery`,
 * `request_withdrawal`, `regenerate_handover_code`, `review_shop` and
 * `receipt`.
 */
const ACTION_TARGET_STATUS: Partial<
	Record<OrderAction, (typeof ORDER_STATUS_NAMES)[number]>
> = {
	confirm_code: "confirmed",
	confirm_by_call: "confirmed",
	accept: "accepted",
	ship: "shipped",
	decline: "cancelled",
	seller_cancel: "cancelled",
	cancel: "cancelled",
	staff_cancel: "cancelled",
	confirm_receipt: "delivered",
	handover: "delivered",
	declare_delivered: "delivered",
	mark_delivery_failed: "delivery_failed",
};

/** The routes that answer `order.notFound` to anyone but the buyer:
 * `confirm`, `confirmation-code/resend`, `cancel`, `confirm-receipt`,
 * `contest-delivery`, `handover-code/regenerate`, `withdrawal`; plus
 * `POST /api/reviews`, whose `enforceReviewRules` refuses any reviewer who is
 * not the order's buyer. */
const BUYER_ONLY_ACTIONS: readonly OrderAction[] = [
	"confirm_code",
	"resend_code",
	"cancel",
	"confirm_receipt",
	"contest_delivery",
	"regenerate_handover_code",
	"request_withdrawal",
	"review_shop",
];

type ActionTable = typeof mobileActionTable;

function cells(table: ActionTable) {
	return ORDER_STATUS_NAMES.flatMap((status) =>
		(["buyer", "shop", "staff"] as const).map((audience) => ({
			status,
			audience,
			actions: table[status][audience],
		})),
	);
}

/**
 * The two client mirrors, each with the vocabulary it declares. Mobile exports
 * `ORDER_ACTIONS` for that; web's equivalent is the key set of
 * `ORDER_ACTION_ROUTES`, which is stronger — an action it offers without a
 * route would fail the "offers only actions it declares" case below.
 *
 * Assigning web's table to `ActionTable` is itself a check: the two packages'
 * `OrderStatusName`, `OrderAudienceKind` and `OrderAction` unions have to
 * match for this file to compile at all.
 */
const CLIENTS: ReadonlyArray<{
	pkg: string;
	table: ActionTable;
	declared: readonly string[];
	permissions: Readonly<Partial<Record<OrderAction, string>>>;
}> = [
	{
		pkg: "mobile",
		table: mobileActionTable,
		declared: mobileActions,
		permissions: mobileActionPermissions,
	},
	{
		pkg: "web",
		table: webActionTable,
		declared: Object.keys(webActionRoutes),
		permissions: webActionPermissions,
	},
];

for (const { pkg, table, declared, permissions } of CLIENTS) {
	describe(`the ${pkg} action table against the backend's own state machine`, () => {
		it("covers every status the API declares, for all three audiences", () => {
			expect(Object.keys(table).sort()).toEqual([...ORDER_STATUS_NAMES].sort());
			expect(cells(table)).toHaveLength(33);
			for (const cell of cells(table)) {
				expect(cell.actions.length).toBeGreaterThan(0);
			}
		});

		it("offers only actions it declares", () => {
			for (const cell of cells(table)) {
				for (const action of cell.actions) {
					expect(declared).toContain(action);
				}
			}
			// The vocabulary is finite and shared; a declared action nobody offers
			// would mean a dead name, which is the other half of the same drift.
			expect([...declared].sort()).toEqual(
				[...new Set(cells(table).flatMap((cell) => cell.actions))].sort(),
			);
		});

		it("offers nothing but the receipt on a status this phase may not write", () => {
			for (const status of RESERVED_STATUSES) {
				for (const audience of ["buyer", "shop", "staff"] as const) {
					expect(table[status][audience]).toEqual(["receipt"]);
				}
			}
			expect(RESERVED_STATUSES.length).toBe(3);
		});

		/**
		 * A terminal status has no outgoing row in `STATUS_TRANSITIONS`, so no
		 * action that would write one may be offered on it. It is not "no action at
		 * all": `completed` is terminal and a buyer may still review the shop and
		 * read the receipt, neither of which touches the order's status.
		 */
		it("offers no status-changing action on a terminal status", () => {
			for (const status of TERMINAL_STATUSES) {
				expect(STATUS_TRANSITIONS[status]).toEqual([]);
				for (const audience of ["buyer", "shop", "staff"] as const) {
					for (const action of table[status][audience]) {
						expect(ACTION_TARGET_STATUS[action]).toBeUndefined();
					}
				}
				// The shop and staff never keep a button on an order that is over.
				expect(table[status].shop).toEqual(["receipt"]);
				expect(table[status].staff).toEqual(["receipt"]);
			}
			expect(TERMINAL_STATUSES.length).toBe(4);
		});

		it("never offers a transition the status graph refuses", () => {
			const checked: string[] = [];
			for (const cell of cells(table)) {
				for (const action of cell.actions) {
					const target = ACTION_TARGET_STATUS[action];
					if (!target) continue;
					checked.push(`${cell.status}/${cell.audience}/${action}`);
					expect(STATUS_TRANSITIONS[cell.status]).toContain(target);
				}
			}
			// A silently empty loop is the hazard this count closes: twelve live
			// cells carry twenty status-changing actions between them, four of
			// which are the staff cancel.
			expect(checked).toHaveLength(20);
		});

		it("offers the buyer's own cancel exactly where buyerCancelOrder allows it", () => {
			const offered = ORDER_STATUS_NAMES.filter((status) =>
				table[status].buyer.includes("cancel"),
			);
			expect(offered.sort()).toEqual([...BUYER_CANCELLABLE_STATUSES].sort());
		});

		it("offers the shop's cancel exactly where sellerCancelOrder allows it", () => {
			const offered = ORDER_STATUS_NAMES.filter((status) =>
				table[status].shop.includes("seller_cancel"),
			);
			expect(offered.sort()).toEqual([...SELLER_CANCELLABLE_STATUSES].sort());
		});

		/**
		 * `POST /api/moderation/orders/{id}` with `{ action: "cancel" }` answers
		 * `moderationInvalidTransition` outside this list, so a staff cell that
		 * offered the lever anywhere else is a 409 behind a live-looking button —
		 * and a cell that omits it is a moderator with no cancel at all, which is
		 * the defect this assertion was added for.
		 */
		it("offers the staff cancel exactly where the moderation route allows it", () => {
			const offered = ORDER_STATUS_NAMES.filter((status) =>
				table[status].staff.includes("staff_cancel"),
			);
			expect(offered.sort()).toEqual(
				[...MODERATOR_CANCELLABLE_STATUSES].sort(),
			);
			expect(MODERATOR_CANCELLABLE_STATUSES).toHaveLength(4);
		});

		/**
		 * `assertOrderReviewAllowed` answers `review.noInteraction` for any other
		 * status, and it is the buyer's own action: the shop and staff cells must
		 * not carry it (covered by `BUYER_ONLY_ACTIONS` below as well).
		 */
		it("offers the buyer's review exactly where reviewRules allows it", () => {
			const offered = ORDER_STATUS_NAMES.filter((status) =>
				table[status].buyer.includes("review_shop"),
			);
			expect(offered.sort()).toEqual([...ORDER_REVIEWABLE_STATUSES].sort());
			expect(ORDER_REVIEWABLE_STATUSES.size).toBe(2);
		});
	});

	describe(`the ${pkg} action table against the audience and permission rules`, () => {
		it("keeps the buyer's own routes out of the shop and staff cells", () => {
			for (const cell of cells(table)) {
				if (cell.audience === "buyer") continue;
				for (const action of BUYER_ONLY_ACTIONS) {
					expect(cell.actions).not.toContain(action);
				}
			}
			// Proves the loop above ran over cells that hold those actions at all.
			expect(table.placed.buyer).toContain("cancel");
			expect(table.shipped.buyer).toContain("regenerate_handover_code");
			expect(table.completed.buyer).toContain("review_shop");
		});

		it("gives staff the moderation cancel and the receipt, and nothing else", () => {
			const offered = new Set(
				ORDER_STATUS_NAMES.flatMap((status) => table[status].staff),
			);
			expect([...offered].sort()).toEqual(["receipt", "staff_cancel"]);
		});

		it("names a permission for every shop action, and only for those", () => {
			const permissioned = Object.keys(permissions);
			const inShopCells = new Set<string>();
			for (const status of ORDER_STATUS_NAMES) {
				for (const action of table[status].shop) {
					if (action !== "receipt") inShopCells.add(action);
				}
			}
			expect([...inShopCells].sort()).toEqual(permissioned.sort());
			expect(permissioned).toHaveLength(9);
		});

		/**
		 * A moderator is authorised by `isModerator`, never by a shop role, and a
		 * review by `assertOrderReviewAllowed`. A shop permission on either would
		 * filter it out of the audience that owns it.
		 */
		it("gates no staff or buyer action on a shop permission", () => {
			expect(permissions.staff_cancel).toBeUndefined();
			expect(permissions.review_shop).toBeUndefined();
			expect(permissions.receipt).toBeUndefined();
			expect(permissions.ship).toBe("orders.process");
		});

		it("names only permissions the role matrix actually declares", () => {
			const declaredPermissions = new Set(ROLE_PERMISSIONS.owner);
			for (const permission of Object.values(permissions)) {
				expect(declaredPermissions).toContain(permission);
			}
			expect(Object.values(permissions)).toHaveLength(9);
		});

		it("gates the shop's cancel on the one permission staff does not hold", () => {
			expect(permissions.seller_cancel).toBe("orders.cancel");
			expect(can("staff", "orders.cancel")).toBe(false);
			expect(can("staff", "orders.process")).toBe(true);
			for (const role of SHOP_ROLES) {
				expect(can(role, "orders.process")).toBe(true);
			}
		});
	});
}

/**
 * The cross-client diff. Everything above holds each table to the backend
 * independently, which is necessary but not sufficient: two tables can each
 * satisfy every rule above and still disagree on render order, or on a cell no
 * backend rule pins. These two assertions are what make the next divergence —
 * of either kind, a rename or a missing cell — fail here rather than survive
 * into two clients and eleven screens.
 */
describe("the two client mirrors are the same table", () => {
	it("agrees on every one of the 33 cells, name for name and in order", () => {
		expect(cells(webActionTable)).toHaveLength(33);
		// Anchors the comparison to real content, so a table that somehow
		// collapsed to empty rows could not pass by matching the other one.
		expect(webActionTable.shipped.staff).toEqual(["staff_cancel", "receipt"]);
		expect(webActionTable.delivered.buyer).toEqual([
			"contest_delivery",
			"request_withdrawal",
			"review_shop",
			"receipt",
		]);
		expect(webActionTable).toEqual(mobileActionTable);
	});

	it("agrees on the whole action vocabulary", () => {
		expect(Object.keys(webActionRoutes).sort()).toEqual(
			[...mobileActions].sort(),
		);
		expect(mobileActions).toHaveLength(19);
	});

	it("agrees on the shop permission each action is gated on", () => {
		expect(Object.keys(webActionPermissions)).toHaveLength(9);
		expect(webActionPermissions).toEqual(mobileActionPermissions);
	});
});
