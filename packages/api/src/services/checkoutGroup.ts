import type { Payload } from "payload";
import type { CheckoutGroupView } from "../contracts/checkoutGroup";
import { ERROR_CODES } from "../lib/errors";
import { getPaymentSettings } from "../lib/paymentSettings";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import type { Shop } from "../payload-types";
import { summaryOf } from "./cart";
import { isOrderPayable } from "./checkoutPayment";
import type { ServiceUser } from "./shops";

/** Buyer only; a stranger and a missing group answer alike, because existence is the leak. */
export async function readCheckoutGroup(
	payload: Payload,
	user: ServiceUser,
	checkoutGroup: string,
	now: Date = new Date(),
): Promise<CheckoutGroupView> {
	const { docs } = await payload.find({
		collection: "orders",
		where: {
			and: [
				{ checkoutGroup: { equals: checkoutGroup } },
				{ buyer: { equals: user.id } },
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	if (docs.length === 0) throw new ServiceError(ERROR_CODES.orderNotFound, 404);

	const settings = await getPaymentSettings(payload);
	const shopIds = [...new Set(docs.map((o) => String(relationId(o.shop))))];
	const shops = new Map<string, Shop>();
	for (const id of shopIds) {
		const shop = await payload
			.findByID({ collection: "shops", id, depth: 0, overrideAccess: true })
			.catch(() => null);
		if (shop) shops.set(id, shop);
	}

	return {
		checkoutGroup,
		orders: [...docs]
			.sort((a, b) => (a.orderNumber < b.orderNumber ? -1 : 1))
			.map((order) => {
				const shopId = String(relationId(order.shop));
				return {
					id: String(order.id),
					orderNumber: order.orderNumber,
					shop: summaryOf(shops.get(shopId) ?? null, shopId),
					total: order.amounts?.total ?? 0,
					currency: order.amounts?.currency ?? "",
					paymentMethod:
						order.paymentMethod === "mobile_money" ? "mobile_money" : "cod",
					status: order.status,
					paymentStatus: order.paymentStatus ?? "",
					payableNow: isOrderPayable(order, settings, now),
				};
			}),
	};
}
