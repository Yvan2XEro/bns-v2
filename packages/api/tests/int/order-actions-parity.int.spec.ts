// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	ORDER_ACTION_PERMISSIONS as mobileActionPermissions,
	ORDER_ACTIONS as mobileActions,
	ORDER_ACTION_TABLE as mobileActionTable,
	type OrderAction,
} from "../../../mobile/src/lib/orderActions";
import { can, ROLE_PERMISSIONS, SHOP_ROLES } from "../../src/access/shopRoles";
import { ORDER_STATUS_NAMES } from "../../src/lib/orderFormat";
import {
	BUYER_CANCELLABLE_STATUSES,
	SELLER_CANCELLABLE_STATUSES,
} from "../../src/services/orders/acceptance";
import {
	RESERVED_STATUSES,
	STATUS_TRANSITIONS,
	TERMINAL_STATUSES,
} from "../../src/services/orders/transitions";

/**
 * "Which buttons does this state offer" is a 33-cell table the plan calls
 * *transcribed*, and it exists nowhere in the plan — so it is hand-derived in
 * each client from the backend's own three sources: `STATUS_TRANSITIONS`
 * (which status may become which), `RESERVED_STATUSES` (which of those this
 * phase may write at all) and each route's own audience and permission guard.
 *
 * This file runs the direction `shop-permissions-parity.int.spec.ts`
 * established: it is API code, so it imports the *client* table into its own
 * type-check and diffs it against the real source of truth at runtime. A
 * table that only asserted itself — which is all either client's own test can
 * do — would stay green while the server's graph moved under it.
 *
 * `packages/web/src/lib/order-actions.ts` is derived in parallel (Task 29) and
 * is not in this commit's tree. When it lands, add it here the way
 * `shop-permissions-parity` carries both mirrors: import its `ORDER_ACTION_TABLE`
 * and run the same `describe` body over it, plus one assertion that the two
 * clients' tables are `toEqual`. Until then the web half of the drift is
 * caught by hand, which is recorded in this phase's progress log.
 */

/**
 * The status each action asks the server to write, transcribed here — on the
 * API side, beside the real tables — from the services the routes call:
 * `acceptance.ts` (`confirmByBuyerCode`, `confirmBySellerCall`, `acceptOrder`,
 * `declineOrder`, `sellerCancelOrder`, `buyerCancelOrder`, `shipOrder`) and
 * `delivery.ts` (`markDelivered`, `markDeliveryFailed`). The actions left out
 * write no status: `resend_code`, `report_failed_attempt`, `contest_delivery`,
 * `request_withdrawal`, `regenerate_handover_code`, `review_shop` and
 * `view_receipt`.
 */
const ACTION_TARGET_STATUS: Partial<
	Record<OrderAction, (typeof ORDER_STATUS_NAMES)[number]>
> = {
	confirm_code: "confirmed",
	confirm_by_call: "confirmed",
	accept_order: "accepted",
	ship_order: "shipped",
	decline_order: "cancelled",
	seller_cancel_order: "cancelled",
	cancel_order: "cancelled",
	confirm_receipt: "delivered",
	verify_handover_code: "delivered",
	declare_delivered: "delivered",
	mark_delivery_failed: "delivery_failed",
};

/** The routes that answer `order.notFound` to anyone but the buyer:
 * `confirm`, `confirmation-code/resend`, `cancel`, `confirm-receipt`,
 * `contest-delivery`, `handover-code/regenerate`, `withdrawal`. */
const BUYER_ONLY_ACTIONS: readonly OrderAction[] = [
	"confirm_code",
	"resend_code",
	"cancel_order",
	"confirm_receipt",
	"contest_delivery",
	"regenerate_handover_code",
	"request_withdrawal",
	"review_shop",
];

function cells(table: typeof mobileActionTable) {
	return ORDER_STATUS_NAMES.flatMap((status) =>
		(["buyer", "shop", "staff"] as const).map((audience) => ({
			status,
			audience,
			actions: table[status][audience],
		})),
	);
}

describe("the mobile action table against the backend's own state machine", () => {
	it("covers every status the API declares, for all three audiences", () => {
		expect(Object.keys(mobileActionTable).sort()).toEqual(
			[...ORDER_STATUS_NAMES].sort(),
		);
		expect(cells(mobileActionTable)).toHaveLength(33);
		for (const cell of cells(mobileActionTable)) {
			expect(cell.actions.length).toBeGreaterThan(0);
		}
	});

	it("offers only actions it declares", () => {
		for (const cell of cells(mobileActionTable)) {
			for (const action of cell.actions) {
				expect(mobileActions).toContain(action);
			}
		}
	});

	it("offers nothing but the receipt on a status this phase may not write", () => {
		for (const status of RESERVED_STATUSES) {
			for (const audience of ["buyer", "shop", "staff"] as const) {
				expect(mobileActionTable[status][audience]).toEqual(["view_receipt"]);
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
				for (const action of mobileActionTable[status][audience]) {
					expect(ACTION_TARGET_STATUS[action]).toBeUndefined();
				}
			}
			// The shop and staff never keep a button on an order that is over.
			expect(mobileActionTable[status].shop).toEqual(["view_receipt"]);
			expect(mobileActionTable[status].staff).toEqual(["view_receipt"]);
		}
		expect(TERMINAL_STATUSES.length).toBe(4);
	});

	it("never offers a transition the status graph refuses", () => {
		const checked: string[] = [];
		for (const cell of cells(mobileActionTable)) {
			for (const action of cell.actions) {
				const target = ACTION_TARGET_STATUS[action];
				if (!target) continue;
				checked.push(`${cell.status}/${cell.audience}/${action}`);
				expect(STATUS_TRANSITIONS[cell.status]).toContain(target);
			}
		}
		// A silently empty loop is the hazard this count closes: the eight live
		// cells carry sixteen status-changing actions between them.
		expect(checked).toHaveLength(16);
	});

	it("offers the buyer's own cancel exactly where buyerCancelOrder allows it", () => {
		const offered = ORDER_STATUS_NAMES.filter((status) =>
			mobileActionTable[status].buyer.includes("cancel_order"),
		);
		expect(offered.sort()).toEqual([...BUYER_CANCELLABLE_STATUSES].sort());
	});

	it("offers the shop's cancel exactly where sellerCancelOrder allows it", () => {
		const offered = ORDER_STATUS_NAMES.filter((status) =>
			mobileActionTable[status].shop.includes("seller_cancel_order"),
		);
		expect(offered.sort()).toEqual([...SELLER_CANCELLABLE_STATUSES].sort());
	});
});

describe("the mobile action table against the audience and permission rules", () => {
	it("keeps the buyer's own routes out of the shop and staff cells", () => {
		for (const cell of cells(mobileActionTable)) {
			if (cell.audience === "buyer") continue;
			for (const action of BUYER_ONLY_ACTIONS) {
				expect(cell.actions).not.toContain(action);
			}
		}
		// Proves the loop above ran over cells that hold those actions at all.
		expect(mobileActionTable.placed.buyer).toContain("cancel_order");
		expect(mobileActionTable.shipped.buyer).toContain(
			"regenerate_handover_code",
		);
	});

	it("gives staff no action at all beyond the receipt", () => {
		for (const status of ORDER_STATUS_NAMES) {
			expect(mobileActionTable[status].staff).toEqual(["view_receipt"]);
		}
	});

	it("names a permission for every shop action, and only for those", () => {
		const permissioned = Object.keys(mobileActionPermissions);
		const inShopCells = new Set<string>();
		for (const status of ORDER_STATUS_NAMES) {
			for (const action of mobileActionTable[status].shop) {
				if (action !== "view_receipt") inShopCells.add(action);
			}
		}
		expect([...inShopCells].sort()).toEqual(permissioned.sort());
		expect(permissioned).toHaveLength(9);
	});

	it("names only permissions the role matrix actually declares", () => {
		const declared = new Set(ROLE_PERMISSIONS.owner);
		for (const permission of Object.values(mobileActionPermissions)) {
			expect(declared).toContain(permission);
		}
		expect(Object.values(mobileActionPermissions)).toHaveLength(9);
	});

	it("gates the shop's cancel on the one permission staff does not hold", () => {
		expect(mobileActionPermissions.seller_cancel_order).toBe("orders.cancel");
		expect(can("staff", "orders.cancel")).toBe(false);
		expect(can("staff", "orders.process")).toBe(true);
		for (const role of SHOP_ROLES) {
			expect(can(role, "orders.process")).toBe(true);
		}
	});
});
