/**
 * What a shop's refusal or cancellation of an order sets off, as the server
 * applies it: `refundOnOrderCancelled` (services/checkoutSettlement.ts) and
 * the insights alert (services/shopInsights.ts) both read these, so the
 * seller's refusal sheet states exactly what will happen.
 */

/** Share of placed orders the shop refused or cancelled that raises the insights alert. */
export const SELLER_CANCELLATION_THRESHOLD = 0.1;

/** Below this many placed orders in the period the rate is too thin to alert on. */
export const SELLER_CANCELLATION_MIN_ORDERS = 5;

export function sellerCancellationAlert(
	cancellations: number,
	ordersPlaced: number,
): boolean {
	return (
		ordersPlaced >= SELLER_CANCELLATION_MIN_ORDERS &&
		cancellations / ordersPlaced >= SELLER_CANCELLATION_THRESHOLD
	);
}

/** A protected order the buyer has paid (in full or partly refunded already) gets the rest back. */
export function cancellationRefundsBuyer(order: {
	paymentMethod?: string | null;
	paymentStatus?: string | null;
}): boolean {
	return (
		order.paymentMethod === "mobile_money" &&
		(order.paymentStatus === "paid" ||
			order.paymentStatus === "partially_refunded")
	);
}
