import type { OrderTimestamps } from "@/src/types/order";
import type { OrderStatusName } from "./orderStatus";

export const ORDER_PROGRESS_STEPS = [
	"placed",
	"confirmed",
	"accepted",
	"shipped",
	"delivered",
] as const;
export type OrderProgressStep = (typeof ORDER_PROGRESS_STEPS)[number];

export interface OrderProgressItem {
	key: OrderProgressStep;
	at: string | null;
	state: "done" | "current" | "todo";
}

const REACHED: Record<OrderStatusName, number> = {
	placed: 0,
	confirmed: 1,
	paid: 1,
	accepted: 2,
	shipped: 3,
	delivered: 4,
	completed: 4,
	returned: 4,
	disputed: 4,
	cancelled: -1,
	delivery_failed: -1,
};

/**
 * The five happy-path milestones of an order, for the stepper at the top of
 * a purchase. A cancelled or failed order has left that path: null, and the
 * timeline below tells what happened instead.
 */
export function orderProgress(
	status: OrderStatusName,
	timestamps: OrderTimestamps,
): OrderProgressItem[] | null {
	const reached = REACHED[status];
	if (reached < 0) return null;
	const at: Record<OrderProgressStep, string | null> = {
		placed: timestamps.placedAt,
		confirmed: timestamps.confirmedAt,
		accepted: timestamps.acceptedAt,
		shipped: timestamps.shippedAt,
		delivered: timestamps.deliveredAt,
	};
	return ORDER_PROGRESS_STEPS.map((key, index) => ({
		key,
		at: index <= reached ? at[key] : null,
		state:
			index < reached || (index === reached && key === "delivered")
				? "done"
				: index === reached
					? "current"
					: "todo",
	}));
}
