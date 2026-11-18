/**
 * Display-only mirror of `ORDER_STATUS_NAMES` and `ORDER_STATUS_LABEL_KEYS`
 * in `packages/api/src/lib/orderFormat.ts`. The server stays the sole
 * authority for every transition; this table only tells a screen which
 * translation key to show for a given status and audience.
 * `packages/api/tests/int/order-status-parity.int.spec.ts` imports this
 * table (and mobile's) alongside the API's own and diffs them at runtime, so
 * a divergence from the server fails a test instead of shipping — the test
 * beside this file only catches this copy drifting from its own local test.
 */
export const ORDER_STATUSES = [
	"placed",
	"confirmed",
	"paid",
	"accepted",
	"shipped",
	"delivered",
	"completed",
	"cancelled",
	"delivery_failed",
	"returned",
	"disputed",
] as const;

export type OrderStatusName = (typeof ORDER_STATUSES)[number];

export type OrderAudience = "buyer" | "seller";

export const ORDER_STATUS_LABEL_KEYS: Record<
	OrderStatusName,
	{ buyer: string; seller: string }
> = {
	placed: { buyer: "status_placed_buyer", seller: "status_placed_seller" },
	confirmed: {
		buyer: "status_confirmed_buyer",
		seller: "status_placed_seller",
	},
	paid: { buyer: "status_paid_buyer", seller: "status_placed_seller" },
	accepted: {
		buyer: "status_accepted_buyer",
		seller: "status_accepted_seller",
	},
	shipped: { buyer: "status_shipped_buyer", seller: "status_shipped_seller" },
	delivered: {
		buyer: "status_delivered_buyer",
		seller: "status_delivered_seller",
	},
	completed: {
		buyer: "status_completed_buyer",
		seller: "status_delivered_seller",
	},
	cancelled: {
		buyer: "status_cancelled_buyer",
		seller: "status_cancelled_seller",
	},
	delivery_failed: {
		buyer: "status_failed_buyer",
		seller: "status_failed_seller",
	},
	returned: {
		buyer: "status_returned_buyer",
		seller: "status_returned_seller",
	},
	disputed: {
		buyer: "status_disputed_buyer",
		seller: "status_disputed_seller",
	},
};

/** The seller order list's six tabs, in display order. */
export const SHOP_ORDER_TABS = [
	"to_accept",
	"to_ship",
	"shipped",
	"delivered",
	"cancelled",
	"failed",
] as const;

export type ShopOrderTab = (typeof SHOP_ORDER_TABS)[number];

/**
 * Which statuses each seller-order tab shows. `to_accept` groups `placed`,
 * `confirmed` and `paid` because all three share the same seller-facing
 * label (`status_placed_seller` above) — from the seller's point of view
 * they are all "a new order waiting on you", whatever stage the buyer's own
 * confirmation is at. `delivered` groups `delivered` and `completed` for the
 * same reason. `returned` and `disputed` are not claimed by any tab: both
 * are reserved for P6 (see Task 8's `RESERVED_STATUSES`) and are not part of
 * the P4 seller workflow this tab bar covers.
 */
export const TAB_STATUSES: Record<ShopOrderTab, readonly OrderStatusName[]> = {
	to_accept: ["placed", "confirmed", "paid"],
	to_ship: ["accepted"],
	shipped: ["shipped"],
	delivered: ["delivered", "completed"],
	cancelled: ["cancelled"],
	failed: ["delivery_failed"],
};

/** The translation key for a status, as the given audience would read it. */
export function statusLabelKey(
	status: OrderStatusName,
	audience: OrderAudience,
): string {
	return ORDER_STATUS_LABEL_KEYS[status][audience];
}
