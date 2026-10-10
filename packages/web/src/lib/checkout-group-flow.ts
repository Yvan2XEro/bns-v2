import type {
	CheckoutGroupOrderView,
	CheckoutGroupView,
} from "../../../api/src/contracts/checkoutGroup";

export type GroupOrderState = "paid" | "expired" | "pending";

const PAID = new Set([
	"paid",
	"cod_collected",
	"refunded",
	"partially_refunded",
]);

/** A settled order is paid; an order out of its window and unpaid is expired; the rest wait. */
export function groupOrderState(
	order: CheckoutGroupOrderView,
): GroupOrderState {
	if (PAID.has(order.paymentStatus)) return "paid";
	if (order.payableNow) return "pending";
	if (order.status === "cancelled" || order.paymentStatus === "failed") {
		return "expired";
	}
	return "pending";
}

export interface GroupFlowStep {
	orderId: string;
	orderNumber: string;
	/** 1-based, in the server's order. */
	position: number;
	state: GroupOrderState;
	payable: boolean;
}

export interface CheckoutGroupFlow {
	steps: GroupFlowStep[];
	total: number;
	/** The first sibling the server says can be paid now; a failed sibling never blocks it. */
	nextPayable: GroupFlowStep | null;
	summary: { paid: number; expired: number; pending: number };
	done: boolean;
}

export function checkoutGroupFlow(view: CheckoutGroupView): CheckoutGroupFlow {
	const steps = view.orders.map<GroupFlowStep>((order, index) => {
		const state = groupOrderState(order);
		return {
			orderId: order.id,
			orderNumber: order.orderNumber,
			position: index + 1,
			state,
			payable: order.payableNow && state !== "paid",
		};
	});
	const summary = { paid: 0, expired: 0, pending: 0 };
	for (const step of steps) summary[step.state] += 1;
	const nextPayable = steps.find((step) => step.payable) ?? null;
	return {
		steps,
		total: steps.length,
		nextPayable,
		summary,
		done: nextPayable === null && summary.pending === 0,
	};
}
