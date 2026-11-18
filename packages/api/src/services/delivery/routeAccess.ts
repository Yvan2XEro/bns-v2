import type { Payload, PayloadRequest } from "payload";
import {
	type OrderViewer,
	requireOrderShopPermission,
} from "../../access/orderAccess";
import type { ShopPermission } from "../../access/shopRoles";
import { ERROR_CODES } from "../../lib/errors";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { Shipment } from "../../payload-types";

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		error.status === 404
	);
}

export async function requireShopShipment(
	payload: Payload,
	user: OrderViewer,
	shipmentId: string,
	permission: ShopPermission,
	req?: PayloadRequest,
): Promise<{
	shipment: Shipment;
	role: Awaited<ReturnType<typeof requireOrderShopPermission>>["role"];
}> {
	let shipment: Shipment;
	try {
		shipment = await payload.findByID({
			collection: "shipments",
			id: shipmentId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch (error) {
		if (isNotFound(error)) throw new ServiceError(ERROR_CODES.notFound, 404);
		throw error;
	}
	const orderId = relationId(shipment.order);
	if (!orderId) throw new ServiceError(ERROR_CODES.orderNotFound, 404);
	const { role } = await requireOrderShopPermission(
		payload,
		user,
		orderId,
		permission,
		req,
	);
	return { shipment, role };
}

export function shipmentActionResult(shipment: Shipment) {
	return {
		id: String(shipment.id),
		shipmentNumber: shipment.shipmentNumber,
		status: shipment.status,
		readyForPickupAt: shipment.readyForPickupAt ?? null,
		pickupDeadline: shipment.pickupDeadline ?? null,
		inTransitAt: shipment.inTransitAt ?? null,
		deliveredAt: shipment.deliveredAt ?? null,
	};
}
