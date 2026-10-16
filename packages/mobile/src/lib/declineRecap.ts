import {
	cancellationRefundsBuyer,
	SELLER_CANCELLATION_MIN_ORDERS,
	SELLER_CANCELLATION_THRESHOLD,
} from "../../../api/src/contracts/sellerCancellation";
import type { OrderView } from "../types/order";

export interface DeclineEffect {
	key: string;
	values?: Record<string, string | number>;
	icon: "refund" | "notify" | "stock" | "rate";
}

export function declineBuyerName(order: Pick<OrderView, "buyer" | "delivery">) {
	return order.buyer?.name?.trim() || order.delivery.recipientName;
}

/** "Bonanjo, Douala" — the buyer's district (or the one they typed) and city. */
export function declineBuyerArea(order: Pick<OrderView, "delivery">): string {
	const district =
		order.delivery.districtOther?.trim() || order.delivery.district?.trim();
	return [district, order.delivery.city?.trim()].filter(Boolean).join(", ");
}

/**
 * What refusing does, in the order the server does it: the refund (or that
 * nothing was paid), the buyer's notification, the stock release, and the
 * shop's refusal rate with the threshold its insights alert on.
 */
export function declineEffects(
	order: Pick<
		OrderView,
		"paymentMethod" | "paymentStatus" | "buyer" | "delivery"
	>,
	amount: string,
): DeclineEffect[] {
	const buyer = declineBuyerName(order);
	return [
		cancellationRefundsBuyer(order)
			? {
					key: "sellerOrders.declineEffects.refund",
					values: { buyer, amount },
					icon: "refund",
				}
			: { key: "sellerOrders.declineEffects.nothingPaid", icon: "refund" },
		{
			key: "sellerOrders.declineEffects.notified",
			values: { buyer },
			icon: "notify",
		},
		{ key: "sellerOrders.declineEffects.stock", icon: "stock" },
		{
			key: "sellerOrders.declineEffects.rate",
			values: {
				threshold: Math.round(SELLER_CANCELLATION_THRESHOLD * 100),
				min: SELLER_CANCELLATION_MIN_ORDERS,
			},
			icon: "rate",
		},
	];
}
