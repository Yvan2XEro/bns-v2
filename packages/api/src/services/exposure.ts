import type { Payload } from "payload";
import { TERMINAL_STATUSES } from "./orders/transitions";

/**
 * Paid, not completed: what the shop could still owe back if every one went
 * wrong. Checkout leaves out the order being paid; the moderation sheet does not.
 */
export async function openProtectedExposure(
	payload: Payload,
	shopId: string,
	excludeOrderId?: string,
): Promise<number> {
	const { docs } = await payload.find({
		collection: "orders",
		where: {
			and: [
				{ shop: { equals: shopId } },
				...(excludeOrderId ? [{ id: { not_equals: excludeOrderId } }] : []),
				{ paymentMethod: { equals: "mobile_money" } },
				{ paymentStatus: { in: ["paid", "partially_refunded"] } },
				{ status: { not_in: [...TERMINAL_STATUSES] } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	return docs.reduce(
		(sum, open) =>
			sum + (open.amounts?.total ?? 0) - (open.settlement?.refundedAmount ?? 0),
		0,
	);
}
