import type { StatusTone } from "@/src/components/shop/Tags";
import type { OrderStatusName } from "@/src/lib/orderStatus";

/**
 * What an order status asks of the seller, as a pill tone: warning while it
 * waits on them, info while it moves, success once delivered, danger when it
 * went wrong. Display only; the server owns every transition.
 */
export const ORDER_STATUS_TONE: Record<OrderStatusName, StatusTone> = {
	placed: "warning",
	confirmed: "warning",
	paid: "warning",
	accepted: "info",
	shipped: "info",
	delivered: "success",
	completed: "success",
	cancelled: "neutral",
	returned: "neutral",
	delivery_failed: "danger",
	disputed: "danger",
};

export function orderStatusTone(status: OrderStatusName): StatusTone {
	return ORDER_STATUS_TONE[status] ?? "neutral";
}
