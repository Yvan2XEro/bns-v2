import type { PayloadRequest } from "payload";
import type { OrderItem } from "../../payload-types";

export async function loadOrderItemsFor(
	req: PayloadRequest,
	orderId: string,
): Promise<OrderItem[]> {
	const { docs } = await req.payload.find({
		collection: "order-items",
		where: { order: { equals: orderId } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs as OrderItem[];
}
